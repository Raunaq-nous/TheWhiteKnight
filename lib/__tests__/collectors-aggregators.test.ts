import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { serpApiCollector, isMassBoardUrl } from "../server/services/collectors/serpapi";
import { jsearchCollector } from "../server/services/collectors/jsearch";
import { theirStackCollector } from "../server/services/collectors/theirstack";
import { jobsPipeCollector, JOBSPIPE_BASE } from "../server/services/collectors/jobspipe";
import { remotiveCollector } from "../server/services/collectors/remotive";
import { arbeitnowCollector } from "../server/services/collectors/arbeitnow";
import { theMuseCollector } from "../server/services/collectors/themuse";
import { remoteOkCollector } from "../server/services/collectors/remoteok";
import { weWorkRemotelyCollector, parseRssItems } from "../server/services/collectors/weworkremotely";
import { himalayasCollector } from "../server/services/collectors/himalayas";
import { jobicyCollector } from "../server/services/collectors/jobicy";
import type { JobCollector } from "../server/services/collectors/types";

const FIXTURES = join(__dirname, "fixtures", "collectors");
const fixtureText = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const fixtureJson = (name: string) => JSON.parse(fixtureText(name));

const jsonRes = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const textRes = (body: string) => ({ ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) });
const errRes = (status: number) => ({ ok: false, status, json: async () => ({}), text: async () => "" });
const badJsonRes = () => ({
  ok: true, status: 200,
  json: async () => { throw new SyntaxError("Unexpected token < in JSON at position 0"); },
  text: async () => "<html>oops</html>",
});

const SECRET = "sk_test_SECRET_123";
const UA = "CareerOS/1.0 (personal job search tool)";

describe("aggregator and remote-board collectors", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const urlOf = (call = 0) => new URL(String(fetchMock.mock.calls[call][0]));
  const initOf = (call = 0) => (fetchMock.mock.calls[call][1] ?? {}) as RequestInit & { headers?: Record<string, string> };

  // ---- Keyed aggregators: shared contract --------------------------------
  const keyed: [string, JobCollector, string][] = [
    ["serpapi", serpApiCollector, "SERPAPI_API_KEY"],
    ["jsearch", jsearchCollector, "JSEARCH_API_KEY"],
    ["theirstack", theirStackCollector, "THEIRSTACK_API_KEY"],
    ["jobspipe", jobsPipeCollector, "JOBSPIPE_API_KEY"],
  ];

  describe.each(keyed)("%s (keyed) contract", (_name, collector, envKey) => {
    it("missing key returns an error naming the env var with zero fetch calls", async () => {
      const r = await collector.collect({ query: "product manager" });
      expect(r).toEqual({ jobs: [], error: `${envKey} not set` });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("non-OK HTTP returns { jobs: [], error } without throwing or leaking the key", async () => {
      fetchMock.mockResolvedValue(errRes(429));
      const r = await collector.collect({ query: "pm", apiKey: SECRET });
      expect(r.jobs).toEqual([]);
      expect(r.error).toContain("429");
      expect(r.error).not.toContain(SECRET);
    });

    it("malformed JSON returns { jobs: [], error } without throwing", async () => {
      fetchMock.mockResolvedValue(badJsonRes());
      const r = await collector.collect({ query: "pm", apiKey: SECRET });
      expect(r.jobs).toEqual([]);
      expect(r.error).toBeTruthy();
      expect(r.error).not.toContain(SECRET);
    });

    it("network error that echoes the key is redacted", async () => {
      fetchMock.mockRejectedValue(new Error(`request to https://x/?api_key=${SECRET} failed`));
      const r = await collector.collect({ query: "pm", apiKey: SECRET });
      expect(r.jobs).toEqual([]);
      expect(r.error).toBeTruthy();
      expect(r.error).not.toContain(SECRET);
    });
  });

  // ---- SerpApi -------------------------------------------------------------
  describe("serpApiCollector", () => {
    it("maps jobs_results, prefers company-direct apply links, sends key as api_key param", async () => {
      const fx = fixtureJson("serpapi.json");
      fetchMock.mockResolvedValue(jsonRes(fx));
      const r = await serpApiCollector.collect({ query: "product manager", location: "London", apiKey: SECRET });

      const u = urlOf();
      expect(u.origin + u.pathname).toBe("https://serpapi.com/search.json");
      expect(u.searchParams.get("engine")).toBe("google_jobs");
      expect(u.searchParams.get("q")).toBe("product manager");
      expect(u.searchParams.get("location")).toBe("London");
      expect(u.searchParams.get("api_key")).toBe(SECRET);
      expect(fetchMock).toHaveBeenCalledTimes(1); // default maxPages = 1

      expect(r.error).toBeUndefined();
      expect(r.jobs).toHaveLength(3);
      const [a, b, c] = r.jobs;
      // Company careers link chosen over LinkedIn (listed first) and Indeed.
      expect(a).toMatchObject({
        title: "Senior Product Manager, Payments",
        company: "Acme Fintech",
        location: "London, UK",
        source: "serpapi",
        via: "Acme Fintech Careers",
        url: "https://careers.acmefintech.com/jobs/senior-pm-payments?utm_source=google_jobs_apply",
        applyUrl: "https://careers.acmefintech.com/jobs/senior-pm-payments?utm_source=google_jobs_apply",
        externalId: fx.jobs_results[0].job_id,
      });
      expect(Date.parse(a.publishedDate!)).not.toBeNaN();
      expect(a.descriptionHtml).toContain("payments roadmap");
      // Only mass boards: url falls back to the first option, no applyUrl.
      expect(b.url).toBe("https://www.linkedin.com/jobs/view/product-manager-remote-4098765432");
      expect(b.applyUrl).toBeUndefined();
      expect(b.remote).toBe(true);
      // No apply options at all: share_link.
      expect(c.url).toBe(fx.jobs_results[2].share_link);
      expect(c.applyUrl).toBeUndefined();
    });

    it("honours maxPages via next_page_token and stops when the cap is reached", async () => {
      const fx = fixtureJson("serpapi.json");
      fetchMock.mockResolvedValue(jsonRes(fx)); // every page has a next token
      const r = await serpApiCollector.collect({ query: "pm", apiKey: SECRET, maxPages: 2 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(urlOf(0).searchParams.get("next_page_token")).toBeNull();
      expect(urlOf(1).searchParams.get("next_page_token")).toBe(fx.serpapi_pagination.next_page_token);
      expect(r.jobs).toHaveLength(6);
    });

    it("stops early when there is no next_page_token", async () => {
      const fx = fixtureJson("serpapi.json");
      delete fx.serpapi_pagination;
      fetchMock.mockResolvedValue(jsonRes(fx));
      await serpApiCollector.collect({ query: "pm", apiKey: SECRET, maxPages: 5 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("surfaces a SerpApi error body without the key", async () => {
      fetchMock.mockResolvedValue(jsonRes({ error: "Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key" }));
      const r = await serpApiCollector.collect({ query: "pm", apiKey: SECRET });
      expect(r.jobs).toEqual([]);
      expect(r.error).toContain("Invalid API key");
      expect(r.error).not.toContain(SECRET);
    });

    it("classifies mass boards by hostname label, including country variants", () => {
      expect(isMassBoardUrl("https://uk.linkedin.com/jobs/view/1")).toBe(true);
      expect(isMassBoardUrl("https://in.indeed.com/viewjob?jk=1")).toBe(true);
      expect(isMassBoardUrl("https://www.glassdoor.co.uk/job-listing/x")).toBe(true);
      expect(isMassBoardUrl("https://www.ziprecruiter.com/c/x")).toBe(true);
      expect(isMassBoardUrl("https://careers.acme.com/jobs/1")).toBe(false);
      expect(isMassBoardUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe(false);
      expect(isMassBoardUrl("not a url")).toBe(true);
    });
  });

  // ---- JSearch -------------------------------------------------------------
  describe("jsearchCollector", () => {
    it("maps data[], sends RapidAPI headers, prefers direct apply links", async () => {
      fetchMock.mockResolvedValue(jsonRes(fixtureJson("jsearch.json")));
      const r = await jsearchCollector.collect({ query: "product manager", location: "London", apiKey: SECRET });

      const u = urlOf();
      expect(u.origin + u.pathname).toBe("https://jsearch.p.rapidapi.com/search");
      expect(u.searchParams.get("query")).toBe("product manager in London");
      expect(u.searchParams.get("page")).toBe("1");
      expect(u.searchParams.get("num_pages")).toBe("1");
      expect(u.toString()).not.toContain(SECRET); // key goes in a header, not the URL
      const headers = initOf().headers!;
      expect(headers["X-RapidAPI-Key"]).toBe(SECRET);
      expect(headers["X-RapidAPI-Host"]).toBe("jsearch.p.rapidapi.com");

      expect(r.error).toBeUndefined();
      expect(r.jobs).toHaveLength(3);
      const [a, b, c] = r.jobs;
      expect(a).toEqual({
        title: "Senior Product Manager",
        company: "Acme Fintech",
        location: "London, England, GB",
        url: "https://careers.acmefintech.com/jobs/senior-pm",
        source: "jsearch",
        publishedDate: "2026-10-17T00:00:00.000Z",
        snippet: "Own the payments roadmap end to end.",
        descriptionHtml: "Own the payments roadmap end to end.",
        externalId: "Q2xR4VbT1dEAAAAAAA==",
        applyUrl: "https://careers.acmefintech.com/jobs/senior-pm",
        via: "Acme Fintech Careers",
        remote: false,
      });
      // Primary link is LinkedIn, but a direct option exists in apply_options.
      expect(b.url).toBe("https://www.linkedin.com/jobs/view/4098765432");
      expect(b.applyUrl).toBe("https://jobs.globex.com/apply/pm-growth");
      expect(b.remote).toBe(true);
      expect(b.location).toBe("GB");
      // No direct option at all.
      expect(c.applyUrl).toBeUndefined();
      expect(c.via).toBe("Indeed");
    });

    it("returns an error on an unexpected body shape", async () => {
      fetchMock.mockResolvedValue(jsonRes({ message: "You are not subscribed to this API." }));
      const r = await jsearchCollector.collect({ query: "pm", apiKey: SECRET });
      expect(r.jobs).toEqual([]);
      expect(r.error).toContain("not subscribed");
    });
  });

  // ---- TheirStack ----------------------------------------------------------
  describe("theirStackCollector", () => {
    it("POSTs the search body with Bearer auth and maps data[]", async () => {
      fetchMock.mockResolvedValue(jsonRes(fixtureJson("theirstack.json")));
      const r = await theirStackCollector.collect({ query: "product manager", location: "London", numResults: 10, apiKey: SECRET });

      expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.theirstack.com/v1/jobs/search");
      const init = initOf();
      expect(init.method).toBe("POST");
      expect(init.headers!.Authorization).toBe(`Bearer ${SECRET}`);
      expect(JSON.parse(String(init.body))).toEqual({
        page: 0,
        limit: 10,
        job_title_or: ["product manager"],
        posted_at_max_age_days: 30,
        job_location_pattern_or: ["London"],
      });

      expect(r.error).toBeUndefined();
      expect(r.jobs).toHaveLength(2);
      expect(r.jobs[0]).toMatchObject({
        title: "Senior Product Manager",
        company: "Acme Fintech",
        location: "London, England, United Kingdom",
        url: "https://www.linkedin.com/jobs/view/4012345678",
        applyUrl: "https://boards.greenhouse.io/acmefintech/jobs/7012345",
        source: "theirstack",
        publishedDate: "2026-10-17",
        externalId: "189345672",
        via: "linkedin.com",
        remote: false,
      });
      // company null -> company_object.name; final_url null -> no applyUrl
      expect(r.jobs[1]).toMatchObject({ company: "Globex", location: "Remote", remote: true });
      expect(r.jobs[1].applyUrl).toBeUndefined();
    });

    it("defaults limit to 25 and omits the location filter when none is given", async () => {
      fetchMock.mockResolvedValue(jsonRes({ data: [] }));
      await theirStackCollector.collect({ query: "pm", apiKey: SECRET });
      const body = JSON.parse(String(initOf().body));
      expect(body.limit).toBe(25);
      expect(body.job_location_pattern_or).toBeUndefined();
    });
  });

  // ---- JobsPipe ------------------------------------------------------------
  describe("jobsPipeCollector", () => {
    it("GETs JOBSPIPE_BASE/jobs with Bearer auth and maps defensively", async () => {
      fetchMock.mockResolvedValue(jsonRes(fixtureJson("jobspipe.json")));
      const r = await jobsPipeCollector.collect({ query: "product manager", location: "London", numResults: 5, apiKey: SECRET });

      const u = urlOf();
      expect(u.toString().startsWith(`${JOBSPIPE_BASE}/jobs?`)).toBe(true);
      expect(u.searchParams.get("q")).toBe("product manager");
      expect(u.searchParams.get("location")).toBe("London");
      expect(u.searchParams.get("limit")).toBe("5");
      expect(initOf().headers!.Authorization).toBe(`Bearer ${SECRET}`);

      expect(r.error).toBeUndefined();
      expect(r.jobs).toHaveLength(2);
      expect(r.jobs[0]).toMatchObject({
        title: "Product Manager, Platform",
        company: "Acme Fintech",
        location: "London, United Kingdom",
        url: "https://jobs.ashbyhq.com/acmefintech/1f2e3d4c-5b6a-7980-a1b2-c3d4e5f6a7b8",
        applyUrl: "https://jobs.ashbyhq.com/acmefintech/1f2e3d4c-5b6a-7980-a1b2-c3d4e5f6a7b8/application",
        source: "jobspipe",
        publishedDate: "2026-10-18T09:00:00Z",
        externalId: "jp_01J9Z5K2ABCDEF",
        via: "ashby",
        remote: false,
      });
      expect(r.jobs[1]).toMatchObject({
        title: "Senior PM",
        company: "Globex",
        location: "Remote, EU",
        url: "https://jobs.lever.co/globex/9a8b7c6d",
        publishedDate: "2026-10-16T12:00:00Z",
        externalId: "42",
        via: "lever",
        remote: true,
      });
    });

    it("also accepts a `data` array", async () => {
      fetchMock.mockResolvedValue(jsonRes({ data: [{ id: 1, title: "PM", company_name: "X", url: "https://x.test/1" }] }));
      const r = await jobsPipeCollector.collect({ query: "pm", apiKey: SECRET });
      expect(r.jobs.map(j => j.title)).toEqual(["PM"]);
    });
  });

  // ---- Keyless boards: shared contract -------------------------------------
  const boards: [string, JobCollector, () => ReturnType<typeof jsonRes> | ReturnType<typeof textRes>][] = [
    ["remotive", remotiveCollector, () => jsonRes(fixtureJson("remotive.json"))],
    ["arbeitnow", arbeitnowCollector, () => jsonRes(fixtureJson("arbeitnow.json"))],
    ["themuse", theMuseCollector, () => jsonRes(fixtureJson("themuse.json"))],
    ["remoteok", remoteOkCollector, () => jsonRes(fixtureJson("remoteok.json"))],
    ["weworkremotely", weWorkRemotelyCollector, () => textRes(fixtureText("weworkremotely.rss"))],
    ["himalayas", himalayasCollector, () => jsonRes(fixtureJson("himalayas.json"))],
    ["jobicy", jobicyCollector, () => jsonRes(fixtureJson("jobicy.json"))],
  ];

  describe.each(boards)("%s (keyless board) contract", (name, collector, ok) => {
    it("makes exactly one GET with an honest User-Agent and tags every job", async () => {
      fetchMock.mockResolvedValue(ok());
      const r = await collector.collect({});
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = initOf();
      expect(init.method ?? "GET").toBe("GET");
      expect(init.headers!["User-Agent"]).toBe(UA);
      expect(r.error).toBeUndefined();
      expect(r.jobs.length).toBeGreaterThan(0);
      for (const j of r.jobs) {
        expect(j.source).toBe(name);
        expect(j.title).toBeTruthy();
        expect(j.url).toMatch(/^https:\/\//);
        expect(j.via).toBeTruthy();
      }
    });

    it("non-OK HTTP returns { jobs: [], error } without throwing", async () => {
      fetchMock.mockResolvedValue(errRes(503));
      const r = await collector.collect({ query: "product" });
      expect(r.jobs).toEqual([]);
      expect(r.error).toContain("503");
    });

    it("malformed body returns { jobs: [], error } without throwing", async () => {
      fetchMock.mockResolvedValue(badJsonRes());
      const r = await collector.collect({ query: "product" });
      expect(r.jobs).toEqual([]);
      expect(r.error).toBeTruthy();
    });

    it("network error returns { jobs: [], error } without throwing", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const r = await collector.collect({ query: "product" });
      expect(r).toEqual({ jobs: [], error: expect.stringContaining("network down") });
    });
  });

  // ---- Per-board mapping ---------------------------------------------------
  describe("remotiveCollector", () => {
    it("passes search to the API and maps jobs[]", async () => {
      fetchMock.mockResolvedValue(jsonRes(fixtureJson("remotive.json")));
      const r = await remotiveCollector.collect({ query: "product manager" });
      const u = urlOf();
      expect(u.origin + u.pathname).toBe("https://remotive.com/api/remote-jobs");
      expect(u.searchParams.get("search")).toBe("product manager");
      expect(r.jobs[0]).toEqual({
        title: "Senior Product Manager",
        company: "Acme Fintech",
        location: "Europe",
        url: "https://remotive.com/remote-jobs/product/senior-product-manager-2045113",
        source: "remotive",
        publishedDate: "2026-10-18T14:22:31",
        snippet: "Own the payments roadmap.",
        descriptionHtml: "<p>Own the <strong>payments</strong> roadmap.</p>",
        externalId: "2045113",
        via: "Remotive",
        remote: true,
      });
    });
  });

  describe("arbeitnowCollector", () => {
    it("maps data[], converts unix seconds, and filters by query client-side", async () => {
      fetchMock.mockResolvedValue(jsonRes(fixtureJson("arbeitnow.json")));
      const r = await arbeitnowCollector.collect({ query: "Product Manager" });
      expect(String(fetchMock.mock.calls[0][0])).toBe("https://www.arbeitnow.com/api/job-board-api");
      // "Backend Engineer (Go)" does not contain "product" or "manager".
      expect(r.jobs.map(j => j.title)).toEqual(["Senior Product Manager (m/w/d)", "Werkstudent Product Owner"]);
      expect(r.jobs[0]).toMatchObject({
        company: "Acme Fintech GmbH",
        location: "Berlin",
        url: "https://www.arbeitnow.com/jobs/companies/acme-fintech-gmbh/senior-product-manager-acme-fintech-berlin-123456",
        publishedDate: new Date(1760870400 * 1000).toISOString(),
        externalId: "senior-product-manager-acme-fintech-berlin-123456",
        via: "Arbeitnow",
        remote: true,
      });
      expect(r.jobs[1].remote).toBe(false);
    });

    it("returns everything when no query is given", async () => {
      fetchMock.mockResolvedValue(jsonRes(fixtureJson("arbeitnow.json")));
      const r = await arbeitnowCollector.collect({});
      expect(r.jobs).toHaveLength(3);
    });
  });

  describe("theMuseCollector", () => {
    it("maps results[], joins locations, flags flexible/remote, filters by query", async () => {
      fetchMock.mockResolvedValue(jsonRes(fixtureJson("themuse.json")));
      const r = await theMuseCollector.collect({ query: "product", location: "New York, NY" });
      const u = urlOf();
      expect(u.origin + u.pathname).toBe("https://www.themuse.com/api/public/jobs");
      expect(u.searchParams.get("page")).toBe("0");
      expect(u.searchParams.get("descending")).toBe("true");
      expect(u.searchParams.get("location")).toBe("New York, NY");
      expect(r.jobs).toHaveLength(1);
      expect(r.jobs[0]).toMatchObject({
        title: "Senior Product Manager",
        company: "Acme Fintech",
        location: "New York, NY; Flexible / Remote",
        url: "https://www.themuse.com/jobs/acmefintech/senior-product-manager",
        publishedDate: "2026-10-19T19:54:16.528000Z",
        externalId: "14823311",
        via: "The Muse",
        remote: true,
      });
    });
  });

  describe("remoteOkCollector", () => {
    it("skips the legal/meta first entry, keeps their job page as url and apply_url as applyUrl", async () => {
      const fx = fixtureJson("remoteok.json");
      expect(fx[0].legal).toBeTruthy(); // fixture keeps the real-shape meta entry
      fetchMock.mockResolvedValue(jsonRes(fx));
      const r = await remoteOkCollector.collect({});
      expect(String(fetchMock.mock.calls[0][0])).toBe("https://remoteok.com/api");
      expect(initOf().headers!["User-Agent"]).toBe(UA);
      expect(r.jobs).toHaveLength(2);
      expect(r.jobs[0]).toMatchObject({
        title: "Senior Product Manager",
        company: "Acme Fintech",
        location: "Europe",
        url: "https://remoteOK.com/remote-jobs/remote-senior-product-manager-acme-fintech-1098765",
        applyUrl: "https://remoteok.com/remote-jobs/1098765/apply",
        source: "remoteok",
        publishedDate: "2026-10-20T11:00:00+00:00",
        externalId: "1098765",
        via: "Remote OK",
        remote: true,
      });
      expect(r.jobs[1].location).toBeUndefined();
    });

    it("filters by query against title and tags", async () => {
      fetchMock.mockResolvedValue(jsonRes(fixtureJson("remoteok.json")));
      const r = await remoteOkCollector.collect({ query: "golang" });
      expect(r.jobs.map(j => j.title)).toEqual(["Senior Golang Engineer"]);
      fetchMock.mockResolvedValue(jsonRes(fixtureJson("remoteok.json")));
      const r2 = await remoteOkCollector.collect({ query: "fintech" }); // tag only
      expect(r2.jobs.map(j => j.title)).toEqual(["Senior Product Manager"]);
    });

    it("errors when the body is not an array", async () => {
      fetchMock.mockResolvedValue(jsonRes({ error: "rate limited" }));
      const r = await remoteOkCollector.collect({});
      expect(r.jobs).toEqual([]);
      expect(r.error).toBeTruthy();
    });
  });

  describe("weWorkRemotelyCollector", () => {
    it("parses CDATA and HTML entities and splits 'Company: Title'", () => {
      const items = parseRssItems(fixtureText("weworkremotely.rss"));
      expect(items).toHaveLength(3);
      // CDATA taken verbatim (inner &amp; stays as HTML)
      expect(items[0].description).toBe("<p>Own the <strong>payments</strong> roadmap &amp; work with design.</p>");
      // Entity-encoded title and numeric entity decoded
      expect(items[1].title).toBe("Smith & Sons: Product Owner, Data – EMEA");
      // Entity-encoded HTML description decoded exactly once
      expect(items[1].description).toBe("<p>Lead data products &amp; analytics.</p>");
      // CDATA title
      expect(items[2].title).toBe("Globex: Senior Rails Developer");
    });

    it("maps items and filters by query client-side", async () => {
      fetchMock.mockResolvedValue(textRes(fixtureText("weworkremotely.rss")));
      const r = await weWorkRemotelyCollector.collect({ query: "product" });
      expect(String(fetchMock.mock.calls[0][0])).toBe("https://weworkremotely.com/remote-jobs.rss");
      expect(r.jobs).toHaveLength(2);
      expect(r.jobs[0]).toEqual({
        title: "Senior Product Manager",
        company: "Acme Fintech",
        location: "Anywhere in the World",
        url: "https://weworkremotely.com/remote-jobs/acme-fintech-senior-product-manager",
        source: "weworkremotely",
        publishedDate: "2026-10-20T10:15:00.000Z",
        snippet: "Own the payments roadmap & work with design.",
        descriptionHtml: "<p>Own the <strong>payments</strong> roadmap &amp; work with design.</p>",
        externalId: "https://weworkremotely.com/remote-jobs/acme-fintech-senior-product-manager",
        via: "We Work Remotely",
        remote: true,
      });
      expect(r.jobs[1]).toMatchObject({ company: "Smith & Sons", title: "Product Owner, Data – EMEA", location: "Europe Only" });
    });

    it("rejects a non-RSS body", async () => {
      fetchMock.mockResolvedValue(textRes("<html><body>Just a moment...</body></html>"));
      const r = await weWorkRemotelyCollector.collect({});
      expect(r.jobs).toEqual([]);
      expect(r.error).toContain("not an RSS feed");
    });
  });

  describe("himalayasCollector", () => {
    it("maps jobs[], uses guid as url and applicationLink as applyUrl, filters by query", async () => {
      fetchMock.mockResolvedValue(jsonRes(fixtureJson("himalayas.json")));
      const r = await himalayasCollector.collect({ query: "product manager" });
      const u = urlOf();
      expect(u.origin + u.pathname).toBe("https://himalayas.app/jobs/api");
      expect(u.searchParams.get("limit")).toBe("20");
      expect(u.searchParams.get("offset")).toBe("0");
      expect(r.jobs).toHaveLength(1);
      expect(r.jobs[0]).toEqual({
        title: "Senior Product Manager",
        company: "Acme Fintech",
        location: "United Kingdom; Germany",
        url: "https://himalayas.app/companies/acme-fintech/jobs/senior-product-manager",
        source: "himalayas",
        publishedDate: new Date(1760950000 * 1000).toISOString(),
        snippet: "Own the payments roadmap at a remote-first fintech.",
        descriptionHtml: "<p>Own the payments roadmap.</p>",
        externalId: "https://himalayas.app/companies/acme-fintech/jobs/senior-product-manager",
        applyUrl: "https://himalayas.app/companies/acme-fintech/jobs/senior-product-manager/apply",
        via: "Himalayas",
        remote: true,
      });
    });

    it("labels unrestricted jobs Worldwide", async () => {
      fetchMock.mockResolvedValue(jsonRes(fixtureJson("himalayas.json")));
      const r = await himalayasCollector.collect({ query: "customer" });
      expect(r.jobs[0].location).toBe("Worldwide");
    });
  });

  describe("jobicyCollector", () => {
    it("passes tag + count and maps jobs[]", async () => {
      fetchMock.mockResolvedValue(jsonRes(fixtureJson("jobicy.json")));
      const r = await jobicyCollector.collect({ query: "product manager" });
      const u = urlOf();
      expect(u.origin + u.pathname).toBe("https://jobicy.com/api/v2/remote-jobs");
      expect(u.searchParams.get("count")).toBe("50");
      expect(u.searchParams.get("tag")).toBe("product manager");
      expect(r.jobs).toHaveLength(2);
      expect(r.jobs[0]).toEqual({
        title: "Senior Product Manager",
        company: "Acme Fintech",
        location: "UK, EMEA",
        url: "https://jobicy.com/jobs/118422-senior-product-manager",
        source: "jobicy",
        publishedDate: "2026-10-20 09:30:11",
        snippet: "Own the payments roadmap for a remote fintech.",
        descriptionHtml: "<p>Own the payments roadmap.</p>",
        externalId: "118422",
        via: "Jobicy",
        remote: true,
      });
    });
  });
});
