/**
 * P1-1 sourcing: cross-source dedupe, ghost jobs, source attribution and
 * ranking, job-alert emails (fixtures per portal), monthly budgets and the
 * scan orchestration. No network: collectors are stubbed.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dedupeJobs, isCompanyDirectUrl, jobKey } from "../job-dedupe";
import { ghostFlags, jdFingerprint, rememberFingerprint } from "../ghost-jobs";
import { computeSourceConversion, rankSources, expectedInterviewRate } from "../source-analytics";
import { parseAlertEmail, portalForSender, ALERT_PORTALS } from "../alert-email";
import { resolveAlertJobs, readAlertEmails, type ImapLike } from "../server/services/alert-inbox";
import { memorySourceBudget } from "../server/source-budget";
import type { Application } from "../store";
import type { JobResult, JobCollector } from "../server/services/collectors/types";

const FIX = join(__dirname, "fixtures", "alert-emails");
const email = (portal: string, from: string) => ({ from, html: readFileSync(join(FIX, `${portal}.html`), "utf8") });

describe("cross-source dedupe", () => {
  const ats: JobResult = { title: "Senior Strategy Manager", company: "Acme Analytics Inc.", location: "Mumbai", url: "https://boards.greenhouse.io/acme/jobs/1", source: "greenhouse", descriptionHtml: "<p>long jd</p>" };
  const google: JobResult = { title: "Sr Strategy Manager", company: "Acme Analytics", location: "Mumbai, India", url: "https://www.google.com/search?ibp=htl;jobs#x", source: "serpapi", applyUrl: "https://boards.greenhouse.io/acme/jobs/1?gh_src=g" };
  const board: JobResult = { title: "Senior Strategy Manager", company: "Acme Analytics", url: "https://remotive.com/remote-jobs/x/1", source: "remotive" };

  it("collapses the same job from several sources into one record, keeping the company-direct URL", () => {
    const out = dedupeJobs([google, board, ats]);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://boards.greenhouse.io/acme/jobs/1");
    expect(out[0].source).toBe("greenhouse");
    expect(out[0].alsoSeenOn?.sort()).toEqual(["remotive", "serpapi"]);
  });

  it("an aggregator record alone keeps the employer's own apply link as its URL", () => {
    const out = dedupeJobs([{ ...google }, { ...board }]);
    expect(out).toHaveLength(1);
    expect(out[0].url).toContain("greenhouse.io");
  });

  it("the same title at the same company in different cities stays two jobs", () => {
    expect(dedupeJobs([{ ...ats }, { ...ats, url: "https://boards.greenhouse.io/acme/jobs/2", location: "Dubai" }])).toHaveLength(2);
  });

  it("normalises company suffixes and title abbreviations; classifies direct URLs", () => {
    expect(jobKey({ company: "Acme Analytics Pvt Ltd", title: "Sr. Mgr, Strategy" })).toBe(jobKey({ company: "Acme Analytics", title: "Senior Manager Strategy" }));
    expect(isCompanyDirectUrl("https://acme.wd5.myworkdayjobs.com/External/job/1")).toBe(true);
    expect(isCompanyDirectUrl("https://careers.acme.com/jobs/1")).toBe(true);
    expect(isCompanyDirectUrl("https://www.linkedin.com/jobs/view/1")).toBe(false);
    expect(isCompanyDirectUrl("https://in.indeed.com/viewjob?jk=1")).toBe(false);
  });
});

describe("ghost jobs", () => {
  const now = new Date("2026-10-22T00:00:00Z");
  const jd = "We need a strategy manager to lead capital programme diagnostics for energy clients across the region. ".repeat(3);

  it("flags postings older than 30 days, and not newer ones", () => {
    expect(ghostFlags({ url: "u", publishedDate: "2026-09-01T00:00:00Z" }, { now }).map(f => f.kind)).toEqual(["stale"]);
    expect(ghostFlags({ url: "u", publishedDate: "2026-10-01T00:00:00Z" }, { now })).toEqual([]);
  });

  it("flags a repost: the same JD fingerprint under a new id on the same host", () => {
    const idx = rememberFingerprint({}, jd, "https://boards.greenhouse.io/acme/jobs/1", now);
    expect(ghostFlags({ url: "https://boards.greenhouse.io/acme/jobs/2", jdText: jd }, { now, index: idx }).map(f => f.kind)).toEqual(["repost"]);
    // The same JD on a different source is the same listing, not a repost.
    expect(ghostFlags({ url: "https://remotive.com/jobs/9", jdText: jd }, { now, index: idx })).toEqual([]);
    // Seeing the same URL again is not a repost.
    expect(ghostFlags({ url: "https://boards.greenhouse.io/acme/jobs/1", jdText: jd }, { now, index: idx })).toEqual([]);
  });

  it("fingerprints ignore markup, case and whitespace, and skip very short text", () => {
    expect(jdFingerprint(`<p>${jd.toUpperCase()}</p>`)).toBe(jdFingerprint(jd.replace(/ /g, "   ")));
    expect(jdFingerprint("too short")).toBeNull();
  });

  it("flags a job missing from its company's feed", () => {
    expect(ghostFlags({ url: "a" }, { now, feedUrls: new Set(["b"]) }).map(f => f.kind)).toEqual(["gone"]);
    expect(ghostFlags({ url: "a" }, { now, feedUrls: new Set(["a"]) })).toEqual([]);
  });
});

describe("attribution and conversion by source", () => {
  const app = (source: string | undefined, status: Application["status"], interviews = 0) =>
    ({ source, status, interviews: Array(interviews).fill({}) } as unknown as Application);

  it("computes response and interview rates per source over applied jobs only", () => {
    const apps = [
      app("greenhouse", "interview"), app("greenhouse", "applied"), app("greenhouse", "sourced"),
      app("serpapi", "rejected"), app("serpapi", "applied"), app(undefined, "applied"),
    ];
    const stats = computeSourceConversion(apps);
    const gh = stats.find(s => s.source === "greenhouse")!;
    expect(gh).toMatchObject({ total: 3, applied: 2, interviewed: 1, interviewRate: 0.5 });
    expect(stats.find(s => s.source === "manual")?.applied).toBe(1);
  });

  it("defaults to company-direct first, then lets observed conversion take over", () => {
    expect(rankSources([], ["remotive", "serpapi", "greenhouse", "alert-email"])).toEqual(["greenhouse", "serpapi", "remotive", "alert-email"]);
    const stats = computeSourceConversion([
      ...Array.from({ length: 6 }, () => app("remotive", "interview")), ...Array.from({ length: 4 }, () => app("remotive", "applied")),
      ...Array.from({ length: 10 }, () => app("greenhouse", "applied")),
    ]);
    expect(rankSources(stats, ["greenhouse", "remotive"])[0]).toBe("remotive");
    expect(expectedInterviewRate("greenhouse")).toBeCloseTo(0.0687);
  });
});

describe("job-alert emails", () => {
  const cases: [string, string, { title: string; company: string; location?: string }][] = [
    ["linkedin", "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>", { title: "Senior Strategy Manager", company: "Acme Analytics", location: "Mumbai, Maharashtra, India" }],
    ["naukri", "Naukri <jobalert@naukri.com>", { title: "Engagement Manager", company: "Gamma Advisory", location: "Bengaluru" }],
    ["iimjobs", "iimjobs <alerts@iimjobs.com>", { title: "Associate Director - Strategy", company: "Delta Capital", location: "Gurgaon" }],
    ["instahyre", "Instahyre <jobs@instahyre.com>", { title: "Product Strategy Lead", company: "Epsilon Labs", location: "Bangalore" }],
    ["cutshort", "Cutshort <hello@cutshort.io>", { title: "AI Deployment Strategist", company: "Zeta AI", location: "Bengaluru" }],
    ["wellfound", "Wellfound <team@wellfound.com>", { title: "Forward Deployed Engineer", company: "Eta Robotics", location: "Remote" }],
    ["bayt", "Bayt.com <alerts@bayt.com>", { title: "Strategy Manager", company: "Theta Group", location: "Abu Dhabi, UAE" }],
    ["gulftalent", "GulfTalent <jobs@gulftalent.com>", { title: "Senior Consultant, Capital Projects", company: "Iota Infrastructure", location: "Dubai" }],
    ["naukrigulf", "Naukrigulf <alerts@naukrigulf.com>", { title: "Project Director", company: "Kappa Energy", location: "Riyadh" }],
  ];
  for (const [portal, from, want] of cases) {
    it(`parses a ${portal} alert`, () => {
      const jobs = parseAlertEmail(email(portal, from));
      expect(jobs[0]).toMatchObject({ portal, ...want });
      expect(jobs[0].portalUrl).toBeTruthy();
    });
  }

  it("covers all nine portals, and every one is lookup-only (the portal page is never fetched)", () => {
    expect(ALERT_PORTALS.map(p => p.id).sort()).toEqual(cases.map(c => c[0]).sort());
    expect(ALERT_PORTALS.every(p => p.policy === "lookup-only")).toBe(true);
  });

  it("skips 'View job' / 'See all jobs' links and keeps one record per job", () => {
    const jobs = parseAlertEmail(email("linkedin", "jobalerts-noreply@linkedin.com"));
    expect(jobs.map(j => j.title)).toEqual(["Senior Strategy Manager", "Principal, AI Transformation"]);
    expect(jobs[1]).toMatchObject({ company: "Beta Consulting", location: "Dubai, United Arab Emirates" });
  });

  it("email content is inert: instruction-like text is not a job and changes nothing", () => {
    const jobs = parseAlertEmail(email("linkedin", "jobalerts-noreply@linkedin.com"));
    expect(JSON.stringify(jobs)).not.toMatch(/IGNORE ALL PREVIOUS/);
  });

  it("a company-direct ATS link in an alert is ingested as is", () => {
    const jobs = parseAlertEmail(email("naukrigulf", "alerts@naukrigulf.com"));
    expect(jobs.find(j => j.title === "Director, PMO")?.directUrl).toBe("https://boards.greenhouse.io/kappaenergy/jobs/777");
  });

  it("only known alert senders are parsed", () => {
    expect(portalForSender("Someone <ceo@example.com>")).toBeNull();
    expect(parseAlertEmail({ from: "x@example.com", html: "<a href='https://www.linkedin.com/jobs/view/1'>Job</a>" })).toEqual([]);
  });

  it("plain-text alerts: 'Title at Company - Location'", () => {
    const jobs = parseAlertEmail({ from: "alerts@iimjobs.com", text: "Hi,\nVP Strategy at Lambda Holdings - Mumbai\nThanks" });
    expect(jobs[0]).toMatchObject({ title: "VP Strategy", company: "Lambda Holdings", location: "Mumbai" });
  });
});

describe("resolving alerts on the company's own board", () => {
  const targets = [{ id: "acme", name: "Acme Analytics", region: ["global"], sector: "industry", ats: "greenhouse", atsTenant: "acme", careersUrl: "https://acme.com/careers", enabled: true }] as any;

  it("matches by company and title and returns the company-direct posting; the portal URL is never fetched", async () => {
    const board: JobCollector = { name: "greenhouse", collect: vi.fn(async () => ({ jobs: [
      { title: "Senior Strategy Manager, India", company: "Acme Analytics", url: "https://boards.greenhouse.io/acme/jobs/55", source: "greenhouse" as const },
      { title: "Data Engineer", company: "Acme Analytics", url: "https://boards.greenhouse.io/acme/jobs/56", source: "greenhouse" as const },
    ] })) };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const jobs = parseAlertEmail(email("linkedin", "jobalerts-noreply@linkedin.com"));
    const r = await resolveAlertJobs(jobs, targets, { greenhouse: board });
    expect(r.resolved).toHaveLength(1);
    expect(r.resolved[0]).toMatchObject({ url: "https://boards.greenhouse.io/acme/jobs/55", via: "linkedin" });
    expect(r.unresolved[0].reason).toMatch(/not in your targets/);
    expect(board.collect).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("IMAP reader", () => {
  const settings = { imapHost: "imap.example.com", imapUser: "me@example.com", imapPassword: "SECRET-PW" };
  const source = Buffer.from(`From: LinkedIn <jobalerts-noreply@linkedin.com>\r\nSubject: Jobs\r\nMessage-ID: <m1@linkedin.com>\r\nContent-Type: text/html\r\n\r\n${readFileSync(join(FIX, "linkedin.html"), "utf8")}`);
  const client = (opts: { fail?: boolean } = {}) => {
    const c: any = {
      readOnly: undefined as boolean | undefined,
      connect: vi.fn(async () => { if (opts.fail) throw new Error("auth failed"); }),
      getMailboxLock: vi.fn(async (_p: string, o?: { readOnly?: boolean }) => { c.readOnly = o?.readOnly; return { release() {} }; }),
      search: vi.fn(async () => [1, 2]),
      async *fetch() {
        yield { uid: 1, source, envelope: { from: [{ address: "jobalerts-noreply@linkedin.com" }], messageId: "<m1@linkedin.com>" } };
        yield { uid: 2, source: Buffer.from("x"), envelope: { from: [{ address: "friend@example.com" }], messageId: "<m2>" } };
      },
      logout: vi.fn(async () => {}),
    };
    return c as ImapLike & { readOnly?: boolean };
  };

  it("opens the folder read-only, reads only alert senders, skips seen ids", async () => {
    const c = client();
    const r = await readAlertEmails(settings, new Set(), { client: c });
    expect(c.readOnly).toBe(true);
    expect(r.emails).toHaveLength(1);
    expect(parseAlertEmail(r.emails[0])[0].title).toBe("Senior Strategy Manager");
    const again = await readAlertEmails(settings, new Set(["<m1@linkedin.com>"]), { client: client() });
    expect(again.emails).toHaveLength(0);
  });

  it("never throws, and never echoes the password", async () => {
    const r = await readAlertEmails(settings, new Set(), { client: client({ fail: true }) });
    expect(r.error).toMatch(/auth failed/);
    expect(JSON.stringify(r)).not.toContain("SECRET-PW");
    expect((await readAlertEmails({}, new Set())).error).toMatch(/not configured/);
  });
});

describe("monthly budgets for keyed sources", () => {
  it("counts calls against each source's free tier", () => {
    const b = memorySourceBudget({ serpapi: 2 });
    expect(b.remaining("serpapi")).toBe(2);
    b.consume("serpapi"); b.consume("serpapi");
    expect(b.remaining("serpapi")).toBe(0);
    expect(b.cap("jsearch")).toBe(200);
  });
});
