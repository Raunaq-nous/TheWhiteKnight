/**
 * THE REAL FAILURE MODE: the live model under-selects. It ranked (or picked)
 * only a handful of ids, and the old pipeline treated that short list as
 * final, so a two-page resume came out at about one page.
 *
 * The stand-in model below deliberately returns ONLY 10 ids, clustered on
 * two employers. A stand-in that fills to the cap would hide exactly the
 * bug this guards, so it is not used here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../ai-client", () => ({ chatJSON: vi.fn(), chat: vi.fn() }));

import { chatJSON } from "../ai-client";
import { generateResumeContent } from "../server/services/resume-generation-service";
import type { Profile } from "../profile";
import { listProfileBullets } from "../profile-bullets";
import { FILL_TARGETS } from "../resume-budget";
import { proofFigures } from "../resume-fill";
import { balanceViolations } from "../resume-balance";
import { liveShapedProfile, LIVE_SHAPE } from "./fixtures/live-shaped-profile";
import type { Application } from "../store";

// Shaped like the live profile (Bain 9, Aranca 20, Evalueserve 8, Tecnova 5,
// Madcue 3), not the master-spec counts.
const masterProfile = liveShapedProfile;

const CONSULTING_APP: Application = {
  id: "app-c", slug: "acme-consulting-manager", company: "Acme Advisory", role: "Consulting Manager, Capital Excellence",
  location: "Mumbai", remote: false, status: "sourced", score: 0, bucket: "strategy", bucketName: "Strategy / Consulting",
  sector: "consulting", seniority: "senior", sourceUrl: "https://example.com/job", capturedAt: "2026-01-01T00:00:00.000Z",
  jdRaw: "Management consulting firm hiring a consulting manager for capital project delivery and performance improvement.",
  jdParsed: {
    keyRequirements: ["management consulting", "capital projects", "client leadership"],
    technicalSkills: ["financial modelling"], softSkills: ["stakeholder management"], yearsExperienceRequired: 6,
    redFlags: [], keywords: ["consulting", "capital", "performance improvement"],
  },
  nextAction: "", contacts: [], interviews: [], reminders: [], resumeVersions: [], notes: "", emailEvents: [],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
} as Application;

/** Bain has run out when every one of its profile bullets is on the page (Experience or Key Projects). */
function bainExhausted(data: { experience: { company: string; bullets: unknown[] }[]; keyWinCompanies?: string[] | null }): boolean {
  const bain = data.experience.find(e => e.company === "Bain and Company");
  const used = (bain?.bullets.length ?? 0) + (data.keyWinCompanies ?? []).filter(c => c === "Bain and Company").length;
  return used >= LIVE_SHAPE["Bain and Company"];
}

const MAIN_EMPLOYERS = ["Bain and Company", "Aranca", "Evalueserve", "Tecnova India", "Madcue"];

/** A model that ranks only 10 ids: by default 5 Bain + 5 Aranca, or all Aranca to stress balance. */
function tenIdModel(profile: Profile, summary: string, arancaOnly = false) {
  const refs = listProfileBullets(profile).filter(r => r.sourceType === "experience");
  const ten = arancaOnly
    ? refs.filter(r => r.sourceId === "Aranca").slice(0, 10)
    : [
      ...refs.filter(r => r.sourceId === "Bain and Company").slice(0, 5),
      ...refs.filter(r => r.sourceId === "Aranca").slice(0, 5),
    ];
  expect(ten).toHaveLength(10);
  return {
    name: "Test Candidate",
    contactLine: "candidate@example.com | +91 00000 00000",
    summary,
    targetPriorities: ["capital projects"],
    subFocus: "capital excellence",
    bulletRanking: ten.map((r, i) => ({ sourceBulletId: r.id, relevance: 95 - i * 3 })),
    keyWins: [],
    experience: [],
    education: [{ institution: "IIT", degree: "B.Tech", field: "Engineering", years: "2010 - 2014" }],
    skills: [{ category: "Consulting", items: ["Financial modelling"] }],
  };
}

describe("generation never trusts a short model selection (10 ids in, two full pages out)", () => {
  beforeEach(() => vi.mocked(chatJSON).mockReset());

  it("fills the full two-page target (26+ experience bullets), all 5 employers, 2+ each, from only 10 model ids", async () => {
    const profile = masterProfile();
    vi.mocked(chatJSON).mockResolvedValue(tenIdModel(profile, "Consulting manager for capital excellence roles.") as never);

    const { data, maxPages, fill } = await generateResumeContent(profile, CONSULTING_APP, undefined, "consulting");

    expect(maxPages).toBe(2);
    expect(fill.modelRankedIds).toBe(10);
    expect(fill.addedByFill).toBeGreaterThan(0);

    const total = data.experience.reduce((n, e) => n + e.bullets.length, 0);
    expect(total).toBeGreaterThanOrEqual(FILL_TARGETS.totalMin);
    expect(total).toBeLessThanOrEqual(FILL_TARGETS.totalTarget);

    const companies = data.experience.map(e => e.company);
    for (const employer of MAIN_EMPLOYERS) expect(companies).toContain(employer);
    for (const e of data.experience.filter(x => MAIN_EMPLOYERS.includes(x.company))) {
      expect(e.bullets.length, e.company).toBeGreaterThanOrEqual(FILL_TARGETS.perEmployerMin);
    }
    // The preview IS the two-page resume: the estimate lands page two past half.
    // (A real LibreOffice render of this output measured page two at ~59%.)
    expect(fill.finalEstimatedLines).toBeGreaterThanOrEqual(FILL_TARGETS.linesPerPage * 1.4);
    expect(fill.finalEstimatedLines).toBeLessThan(FILL_TARGETS.linesPerPage * 2);
    // Balanced: Bain leads (counting Key Projects), no role over about a third.
    expect(balanceViolations(data.experience, data.keyWinCompanies, bainExhausted(data))).toEqual([]);

    // Key Projects 3-4 items, disjoint from experience.
    expect(data.keyWins?.length ?? 0).toBeGreaterThanOrEqual(FILL_TARGETS.keyImpactMin);
    expect(data.keyWins?.length ?? 0).toBeLessThanOrEqual(FILL_TARGETS.keyImpactMax);
    const expIds = new Set(data.experience.flatMap(e => e.bullets.map(b => b.sourceBulletId)));
    for (const id of data.keyWinIds ?? []) expect(expIds.has(id)).toBe(false);

    // Selection, not writing: every bullet's id is a real profile id.
    const profileIds = new Set(listProfileBullets(profile).map(r => r.id));
    for (const id of expIds) expect(profileIds.has(id)).toBe(true);

    // Export has candidates to fill with.
    expect(data.reserve?.length ?? 0).toBeGreaterThan(0);
  });

  it("a model that ranks only Aranca still yields a Bain-led, balanced resume", async () => {
    const profile = masterProfile();
    vi.mocked(chatJSON).mockResolvedValue(tenIdModel(profile, "Consulting manager.", true) as never);
    const { data } = await generateResumeContent(profile, CONSULTING_APP, undefined, "consulting");
    expect(balanceViolations(data.experience, data.keyWinCompanies, bainExhausted(data))).toEqual([]);
    const bain = data.experience.find(e => e.company === "Bain and Company")!;
    const bainTotal = bain.bullets.length + (data.keyWinCompanies ?? []).filter(c => c === "Bain and Company").length;
    const aranca = data.experience.find(e => e.company === "Aranca")!;
    if (!bainExhausted(data)) expect(aranca.bullets.length).toBeLessThanOrEqual(bainTotal);
    const total = data.experience.reduce((n, e) => n + e.bullets.length, 0);
    expect(aranca.bullets.length).toBeLessThanOrEqual(Math.ceil(total / 3));
  });

  it("the summary never repeats the leading Key Projects item's figure", async () => {
    const profile = masterProfile();
    // Ask the stand-in to echo whatever figure the fill will lead with: run
    // once to learn the lead item, then again with a colliding summary.
    vi.mocked(chatJSON).mockResolvedValue(tenIdModel(profile, "Consulting manager.") as never);
    const first = await generateResumeContent(profile, CONSULTING_APP, undefined, "consulting");
    const lead = first.data.keyWins?.[0] ?? "";
    const figure = [...proofFigures(lead)][0];
    expect(figure).toBeTruthy();

    vi.mocked(chatJSON).mockResolvedValue(tenIdModel(profile, `Consulting manager who delivered ${figure} on a flagship program.`) as never);
    const second = await generateResumeContent(profile, CONSULTING_APP, undefined, "consulting");
    expect(second.fill.summaryProofPointSwapped).toBe(true);
    const newLead = second.data.keyWins?.[0] ?? "";
    const summaryFigures = proofFigures(second.data.summary);
    for (const f of proofFigures(newLead)) expect(summaryFigures.has(f)).toBe(false);
  });
});
