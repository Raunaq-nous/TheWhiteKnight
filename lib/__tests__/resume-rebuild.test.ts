/**
 * The company-by-company resume rebuild. Runs the REAL generation pipeline
 * with the model mocked (one stand-in answers step 0's requirement
 * extraction, the ranking call and the summary retry), plus the pure rules:
 *   1 confidentiality (PX Pulse, Haus Nous)   6 skills
 *   2 no projects section                     7 taper, no padding
 *   3 JD alignment                            8 education lines
 *   4 summary                                 9 bolding
 *   5 role structure
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../ai-client", () => ({ chatJSON: vi.fn(), chat: vi.fn() }));

import { chatJSON } from "../ai-client";
import { generateResumeContent } from "../server/services/resume-generation-service";
import { extractTopRequirements, JD_TOO_THIN_WARNING } from "../server/services/jd-requirements";
import {
  applyConfidentialitySubstitutions, applyConfidentialitySubstitutionsToResumeContent, runConfidentialityGate, renderedResumeText,
} from "../resume-confidentiality";
import { buildFilledSelection, isEligibleBullet, isScopeLine, scopeLineFor } from "../resume-fill";
import { hasOutcomeClause } from "../resume-outcome";
import { summaryViolations, repairSummary, splitSentences } from "../resume-summary";
import { selectResumeSkills, SKILLS_TAXONOMY, evidenceFor, keepEvidencedSkills } from "../resume-skills";
import { finalizeEducation, publicationsLine } from "../resume-education";
import { computeBoldSpans, splitTextByBoldSpans } from "../resume-bolding";
import { roleSubLabelGroups, AI_BUILDS_LABEL, CONSULTING_ENGAGEMENTS_LABEL } from "../resume-sublabels";
import { buildDocxPlan } from "../resume-docx";
import { listProfileBullets } from "../profile-bullets";
import { jdRelevanceTerms, isAiRelatedJd } from "../resume-jd";
import { liveShapedProfile } from "./fixtures/live-shaped-profile";
import { getSeedProfile, type Profile } from "../profile";
import type { Application } from "../store";
import type { ResumeContent } from "../resume-schema";

// ─── Fixtures ───────────────────────────────────────────────────────────

function app(role: string, requirements: string[], keywords: string[], jdRaw = ""): Application {
  return {
    id: "app", slug: "app", company: "Acme Advisory", role, location: "Mumbai", remote: false, status: "sourced", score: 0,
    bucket: "strategy", bucketName: "Strategy", sector: "consulting", seniority: "senior", sourceUrl: "https://example.com/job",
    capturedAt: "2026-01-01T00:00:00.000Z", jdRaw: jdRaw || `${role}. ${requirements.join(". ")}.`,
    jdParsed: { keyRequirements: requirements, technicalSkills: [], softSkills: [], yearsExperienceRequired: 8, redFlags: [], keywords },
    nextAction: "", contacts: [], interviews: [], reminders: [], resumeVersions: [], notes: "", emailEvents: [],
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as Application;
}

const CAPITAL_REQS = [
  "capital project delivery for energy and infrastructure clients",
  "investment cases and C-suite decision documents",
  "cost and schedule risk diagnostics",
  "performance improvement on capital assets",
  "market entry and growth strategy",
];
const AI_REQS = [
  "AI transformation strategy for enterprise clients",
  "building AI products and deploying them into production",
  "process reinvention with agentic AI",
  "executive stakeholder management",
  "AI governance and adoption",
];
const CAPITAL_APP = app("Consulting Manager, Capital Excellence", CAPITAL_REQS, ["capital", "energy", "infrastructure", "investment", "schedule", "risk"]);
const AI_APP = app("Manager, AI Transformation", AI_REQS, ["AI", "agentic", "transformation", "automation", "platform"]);

/** Live-shaped profile plus a scope bullet and a project the resume must never read. */
function profile(): Profile {
  const p = liveShapedProfile();
  p.experience[0] = { ...p.experience[0], bullets: `Leading cross-functional teams across capital-intensive infrastructure engagements for global clients.\n${p.experience[0].bullets}` };
  p.projects = [{ id: "p1", name: "Zephyr Ledger", description: "Built Zephyr Ledger, a side project that reconciled 9,999 invoices.", stack: "Python", outcomes: "", repoUrl: "" } as Profile["projects"][number]];
  p.education = [{ id: "ed1", institution: "Manipal Institute of Technology", degree: "B.Tech", field: "Mechanical Engineering", years: "2012 - 2016", gpa: "8.0", achievements: "" } as Profile["education"][number]];
  p.publications = [
    { id: "pub1", title: "AI's impact on green manufacturing", publication: "Economic Times", year: "2024" },
    { id: "pub2", title: "Digital governance", publication: "Dataquest", year: "2025" },
    { id: "pub3", title: "Dynamics and Control System Design of a Polar Low-Earth Orbit Nano-Satellite", publication: "IEEE", year: "2015" },
  ];
  return p;
}

/** A graded JD relevance like a careful model's: adjacent strategy work ~30, each requirement term it evidences +18, 0-100. */
function relevanceFor(text: string, reqs: string[]): number {
  const terms = jdRelevanceTerms({ role: "", jdParsed: { keyRequirements: reqs } } as unknown as Application, reqs);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/);
  const hits = new Set(words.filter(w => terms.has(w))).size;
  return Math.min(100, 30 + hits * 18);
}

type ModelOpts = { reqs: string[]; summary: string; rewrittenSummary?: string; skills?: ResumeContent["skills"]; prompts?: string[]; evaluator?: () => unknown };

function mockModel(p: Profile, o: ModelOpts) {
  vi.mocked(chatJSON).mockImplementation((async (messages: { content: string }[]) => {
    // vitest can re-invoke a mock implementation without arguments; ignore those.
    if (!Array.isArray(messages)) return null;
    const prompt = messages[0].content;
    o.prompts?.push(prompt);
    if (prompt.includes("Extract the TOP 5 requirements")) return { requirements: o.reqs };
    if (prompt.includes("Rewrite this resume profile summary")) return { summary: o.rewrittenSummary ?? o.summary };
    if (prompt.includes("DEFAULT IS FAIL")) return o.evaluator ? o.evaluator() : { criteria: [] };
    const ids = new Set([...prompt.matchAll(/\[(e_\w+)\]/g)].map(m => m[1]));
    const refs = listProfileBullets(p).filter(r => ids.has(r.id));
    return {
      name: "Test Candidate", contactLine: "candidate@example.com | +91 00000 00000",
      summary: o.summary, targetPriorities: o.reqs, subFocus: "x",
      bulletRanking: refs.map(r => ({ sourceBulletId: r.id, relevance: relevanceFor(r.text, o.reqs) })).sort((a, b) => b.relevance - a.relevance),
      requirementCoverage: o.reqs.map(r => ({ requirement: r, sourceBulletId: null })),
      sectionOrder: "experience-first", experience: [],
      education: [{ institution: "Manipal Institute of Technology", degree: "B.Tech", field: "Mechanical Engineering", years: "2012 - 2016", achievements: ["Captain of the debate team"] }],
      skills: o.skills ?? [{ category: "Strategy", items: ["Strategic Initiatives", "Business Development", "Data Analysis", "market entry", "due diligence"] }],
    };
  }) as never);
}

const GOOD_SUMMARY = "Strategy consultant with 10+ years of experience, positioned for capital excellence leadership and currently a Project Leader at Bain and Company. Leads concept selection, capital program readiness and asset performance work for energy and infrastructure clients across South America and North America. Builds AI-enabled diagnostics that put schedule and cost risk in front of executives.";

const allBullets = (c: ResumeContent) => c.experience.flatMap(e => e.bullets);

// ─── 1. Confidentiality ─────────────────────────────────────────────────

describe("1. confidentiality: PX Pulse and Haus Nous are blocked, with every spelling", () => {
  const VARIANTS: [string, string][] = [
    ["PX Pulse", "the risk-analysis module"], ["px pulse", "the risk-analysis module"], ["PX-Pulse", "the risk-analysis module"],
    ["PXPulse", "the risk-analysis module"], ["PX  Pulse", "the risk-analysis module"],
    ["Haus Nous", "AI-first strategy consulting platform"], ["Haus-Nous", "AI-first strategy consulting platform"],
    ["haus nous", "AI-first strategy consulting platform"], ["HAUS-NOUS", "AI-first strategy consulting platform"], ["HausNous", "AI-first strategy consulting platform"],
  ];
  for (const [term, replacement] of VARIANTS) {
    it(`"${term}" is substituted and the gate blocks it raw`, () => {
      const text = `Built ${term} for portfolio reviews.`;
      expect(runConfidentialityGate(text).ok).toBe(false);
      const clean = applyConfidentialitySubstitutions(text);
      expect(clean).toBe(`Built ${replacement} for portfolio reviews.`);
      expect(runConfidentialityGate(clean).ok).toBe(true);
    });
  }

  it("every field that reaches a resume is substituted and gated, the summary included", () => {
    const c = {
      name: "T", contactLine: "t@example.com", summary: "Built PX Pulse and Haus-Nous.",
      sectionOrder: "experience-first", links: [{ label: "Haus Nous demo", url: "https://example.com" }],
      experience: [{ company: "Bain and Company", role: "Project Leader", tenure: "2025", scope: "Leading teams on PX-Pulse rollouts.",
        bullets: [{ sourceBulletId: "e_1", text: "Shipped Haus Nous to clients.", priority: 1 }] }],
      education: [{ institution: "Manipal", degree: "B.Tech", years: "2016", achievements: ["Mentored on PX Pulse."] }],
      skills: [{ category: "AI", items: ["Haus-Nous platform"] }],
    } as unknown as ResumeContent;
    expect(runConfidentialityGate(renderedResumeText(c)).blockedTerms).toEqual(expect.arrayContaining(["PX Pulse", "Haus Nous"]));
    const clean = applyConfidentialitySubstitutionsToResumeContent(c);
    expect(runConfidentialityGate(renderedResumeText(clean)).ok).toBe(true);
    expect(clean.summary).toBe("Built the risk-analysis module and AI-first strategy consulting platform.");
    expect(clean.experience[0].scope).toContain("the risk-analysis module");
  });
});

// ─── Pipeline (2, 3, 4, 5, 6, 7, 8) ─────────────────────────────────────

describe("generation pipeline (model mocked)", () => {
  beforeEach(() => vi.mocked(chatJSON).mockReset());

  it("2. never reads profile.projects and renders no projects or Key Projects section", async () => {
    const p = profile();
    const prompts: string[] = [];
    mockModel(p, { reqs: CAPITAL_REQS, summary: GOOD_SUMMARY, prompts });
    const r = await generateResumeContent(p, CAPITAL_APP, undefined, "consulting");
    expect(prompts.join("\n")).not.toContain("Zephyr Ledger");
    expect(r.data.projects ?? []).toEqual([]);
    expect(r.data.keyWins ?? []).toEqual([]);
    expect(r.data.sectionSequence).toEqual(["summary", "experience", "skills", "education"]);
    expect(renderedResumeText(r.data)).not.toContain("Zephyr");
  });

  it("3. extracts the top requirements first, ranks eligible bullets only, and orders each employer by JD relevance", async () => {
    const p = profile();
    const prompts: string[] = [];
    mockModel(p, { reqs: CAPITAL_REQS, summary: GOOD_SUMMARY, prompts });
    const r = await generateResumeContent(p, CAPITAL_APP, undefined, "consulting");
    expect(prompts[0]).toContain("Extract the TOP 5 requirements");
    expect(r.jdRequirements).toEqual(CAPITAL_REQS);
    expect(r.jdWarning).toBeNull();
    expect(r.coverage).toHaveLength(5);
    // Quality filter: no bullet without an outcome clause (unless configured eligible).
    for (const b of allBullets(r.data)) expect(isEligibleBullet(b.text), b.text).toBe(true);
    // Ineligible bullets are never offered to the model.
    const rankingPrompt = prompts.find(x => x.includes("AVAILABLE BULLETS"))!;
    const offered = new Set([...rankingPrompt.split("AVAILABLE BULLETS")[1].matchAll(/\[(e_\w+)\]/g)].map(m => m[1]));
    for (const ref of listProfileBullets(p)) if (offered.has(ref.id)) expect(isEligibleBullet(ref.text), ref.text).toBe(true);
    // Within each employer, bullets run in JD-relevance order.
    for (const e of r.data.experience) {
      const order = [...e.bullets].sort((a, b) => a.priority - b.priority).map(b => relevanceFor(b.text, CAPITAL_REQS));
      expect(order, e.company).toEqual([...order].sort((a, b) => b - a));
    }
  });

  it("3. different JDs produce different resumes: relevance decides, not impact", async () => {
    const p = profile();
    mockModel(p, { reqs: CAPITAL_REQS, summary: GOOD_SUMMARY });
    const capital = await generateResumeContent(p, CAPITAL_APP, undefined, "consulting");
    mockModel(p, { reqs: AI_REQS, summary: GOOD_SUMMARY.replace("capital excellence leadership", "AI transformation leadership") });
    const ai = await generateResumeContent(p, AI_APP, undefined, "consulting");
    const firstBain = (c: ResumeContent) => [...c.experience[0].bullets].sort((a, b) => a.priority - b.priority)[0].sourceBulletId;
    expect(firstBain(capital.data)).not.toBe(firstBain(ai.data));
    const ids = (c: ResumeContent) => new Set(allBullets(c).map(b => b.sourceBulletId));
    const a = ids(capital.data), b = ids(ai.data);
    expect([...a].filter(x => !b.has(x)).length).toBeGreaterThan(0);
  });

  it("3. a thin JD (fewer than 3 requirements) is flagged", async () => {
    const p = profile();
    mockModel(p, { reqs: ["consulting"], summary: GOOD_SUMMARY });
    const r = await generateResumeContent(p, app("Consultant", ["consulting"], []), undefined, "consulting");
    expect(r.jdWarning).toBe(JD_TOO_THIN_WARNING);
  });

  it("4. a fluffy summary gets ONE corrective retry; the stored summary meets every rule", async () => {
    const p = profile();
    const FLUFF = "Strategy consultant who approaches every engagement from first principles. Cut manual review effort by 80% with an AI cockpit. Passionate about results. Delivers synergy. Builds trust.";
    mockModel(p, { reqs: CAPITAL_REQS, summary: FLUFF, rewrittenSummary: GOOD_SUMMARY });
    const r = await generateResumeContent(p, CAPITAL_APP, undefined, "consulting");
    expect(r.summaryReport.violations.length).toBeGreaterThan(0);
    expect(r.summaryReport.retried).toBe(true);
    expect(r.summaryReport.violationsAfterRetry).toEqual([]);
    expect(r.data.summary).toBe(GOOD_SUMMARY);
    const bulletTexts = [...allBullets(r.data).map(b => b.text), ...(r.data.reserve ?? []).map(x => x.text)];
    expect(summaryViolations(r.data.summary, { bulletTexts })).toEqual([]);
  });

  it("5. scope line under the role title, never an engagement; sub-labels at Bain and Aranca only", async () => {
    const p = profile();
    mockModel(p, { reqs: AI_REQS, summary: GOOD_SUMMARY });
    const r = await generateResumeContent(p, AI_APP, undefined, "consulting");
    const bain = r.data.experience[0];
    expect(bain.scope).toBe("Leading cross-functional teams across capital-intensive infrastructure engagements for global clients.");
    expect(bain.bullets.some(b => isScopeLine(b.text))).toBe(false);
    const aranca = r.data.experience.find(e => e.company === "Aranca")!;
    expect(aranca.scope).toMatch(/^Primary client interface across 12\+ mandates/);
    const labelled = r.data.experience.filter(e => roleSubLabelGroups(e)).map(e => e.company);
    expect(labelled).toEqual(["Bain and Company", "Aranca"]);
  });

  it("5. for an AI-related JD, 'Led the internal AI strategy team' leads Aranca's AI BUILDS", async () => {
    const p = profile();
    mockModel(p, { reqs: AI_REQS, summary: GOOD_SUMMARY });
    const r = await generateResumeContent(p, AI_APP, undefined, "consulting");
    const aranca = r.data.experience.find(e => e.company === "Aranca")!;
    const ai = roleSubLabelGroups(aranca)!.find(g => g.label === AI_BUILDS_LABEL)!;
    expect(ai.bullets[0].text).toMatch(/^Led the internal AI strategy team/);
    const plan = buildDocxPlan(r.data, "consulting");
    const i = plan.findIndex(n => n.kind === "entryHeader" && n.left === "Aranca");
    const afterAiLabel = plan.slice(i).findIndex(n => n.kind === "subLabel" && n.text === AI_BUILDS_LABEL);
    expect((plan[i + afterAiLabel + 1] as { text: string }).text).toMatch(/^Led the internal AI strategy team/);
    expect(plan.slice(i).some(n => n.kind === "subLabel" && n.text === CONSULTING_ENGAGEMENTS_LABEL)).toBe(true);
  });

  it("6. skills: at most two rows of at most six taxonomy items matching the JD, no filler, no Technical row for a non-technical role", async () => {
    const p = profile();
    mockModel(p, { reqs: CAPITAL_REQS, summary: GOOD_SUMMARY });
    const r = await generateResumeContent(p, CAPITAL_APP, undefined, "consulting");
    const taxonomy = new Set(Object.values(SKILLS_TAXONOMY).flat());
    expect(r.data.skills.length).toBeGreaterThan(0);
    expect(r.data.skills.length).toBeLessThanOrEqual(2);
    for (const g of r.data.skills) {
      expect(g.items.length).toBeLessThanOrEqual(6);
      expect(g.category).not.toBe("Technical");
      for (const item of g.items) expect(taxonomy.has(item), item).toBe(true);
    }
    const flat = r.data.skills.flatMap(g => g.items).map(x => x.toLowerCase());
    for (const filler of ["strategic initiatives", "business development", "data analysis"]) expect(flat).not.toContain(filler);
  });

  it("6. every listed skill is evidenced by a SELECTED bullet, and the evidence is stored", async () => {
    const p = profile();
    mockModel(p, { reqs: CAPITAL_REQS, summary: GOOD_SUMMARY, skills: [{ category: "Any", items: ["market entry", "due diligence", "pricing strategy", "M&A advisory", "financial modelling", "market sizing"] }] });
    const r = await generateResumeContent(p, CAPITAL_APP, undefined, "consulting");
    const shown = new Map(allBullets(r.data).map(b => [b.sourceBulletId, b.text]));
    const listed = r.data.skills.flatMap(g => g.items);
    expect(listed.length).toBeGreaterThan(0);
    expect((r.data.skillEvidence ?? []).map(e => e.skill)).toEqual(listed);
    for (const e of r.data.skillEvidence ?? []) {
      expect(e.sourceBulletId, e.skill).not.toBeNull();
      expect(shown.has(e.sourceBulletId!), e.skill).toBe(true);
    }
  });

  it("7. taper: Bain leads, Evalueserve and Tecnova 3-4 at most, Madcue 2; nothing below the relevance bar pads beyond a floor", async () => {
    const p = profile();
    mockModel(p, { reqs: CAPITAL_REQS, summary: GOOD_SUMMARY });
    const r = await generateResumeContent(p, CAPITAL_APP, undefined, "consulting");
    const n = Object.fromEntries(r.data.experience.map(e => [e.company, e.bullets.length]));
    expect(n["Bain and Company"]).toBeGreaterThanOrEqual(Math.max(n["Aranca"] ?? 0, n["Evalueserve"] ?? 0, n["Tecnova India"] ?? 0, n["Madcue"] ?? 0));
    expect(n["Evalueserve"]).toBeLessThanOrEqual(4);
    expect(n["Tecnova India"]).toBeLessThanOrEqual(4);
    expect(n["Madcue"]).toBeLessThanOrEqual(2);
    // Every reserve bullet export could add clears the relevance bar.
    for (const x of r.data.reserve ?? []) expect(x.score).toBeGreaterThanOrEqual(0.4);
  });

  it("8. education: the degree, the compressed satellite line and one publications line, nothing more", async () => {
    const p = profile();
    mockModel(p, { reqs: CAPITAL_REQS, summary: GOOD_SUMMARY });
    const r = await generateResumeContent(p, CAPITAL_APP, undefined, "consulting");
    expect(r.data.education).toHaveLength(1);
    expect(r.data.education[0].achievements).toEqual([
      "Worked on the control system of a satellite during an ISRO-guided student project; co-authored multiple published research papers.",
      "Publications: AI's impact on green manufacturing (Economic Times, 2024); Digital governance (Dataquest, 2025)",
    ]);
  });

  it("P0-2: the resume goes behind the evaluator gate: a FAIL regenerates once with the findings in the ranking prompt", async () => {
    const p = profile();
    const prompts: string[] = [];
    let evalCalls = 0;
    mockModel(p, {
      reqs: CAPITAL_REQS, summary: GOOD_SUMMARY, prompts,
      evaluator: () => (++evalCalls === 1
        ? { criteria: [{ id: "covers_requirements", pass: false, evidence: [], finding: "Requirement 3 has no supporting line." }] }
        : { criteria: [] }),
    });
    const { generateEvaluatedResume } = await import("../server/services/resume-generation-service");
    const r = await generateEvaluatedResume(p, CAPITAL_APP, undefined, "consulting");
    const ranking = prompts.filter(x => x.includes("AVAILABLE BULLETS"));
    expect(ranking).toHaveLength(2);
    expect(ranking[0]).not.toContain("INDEPENDENT REVIEWER FAILED");
    expect(ranking[1]).toContain("Requirement 3 has no supporting line.");
    expect(r.evaluation.attempts).toBe(2);
    expect(r.evaluation.regenerated).toBe(true);
    expect(r.evaluation.kind).toBe("resume");
    expect(r.evaluation.criteria.map(c => c.id)).toContain("skills_evidenced");
    // The evaluator never saw the generation prompt.
    const evalPrompt = prompts.find(x => x.includes("DEFAULT IS FAIL"))!;
    expect(evalPrompt).not.toContain("AVAILABLE BULLETS");
    expect(evalPrompt).not.toContain("RANKING RULES");
  });

  it("the generation-time confidentiality gate covers every field and passes on clean content", async () => {
    const p = profile();
    mockModel(p, { reqs: CAPITAL_REQS, summary: GOOD_SUMMARY.replace("AI-enabled diagnostics", "PX Pulse diagnostics") });
    const r = await generateResumeContent(p, CAPITAL_APP, undefined, "consulting");
    expect(r.data.summary).toContain("the risk-analysis module diagnostics");
    expect(r.confidentialityGate.ok).toBe(true);
  });
});

// ─── Pure rules ─────────────────────────────────────────────────────────

describe("3. quality filter and relevance-first selection (pure)", () => {
  it("an outcome clause makes a bullet eligible; activity alone does not; configured builds are eligible", () => {
    expect(hasOutcomeClause("Led a concept selection study, authoring the C-suite decision document that unlocked investment.")).toBe(true);
    expect(isEligibleBullet("Led go-to-market and product launch strategy for a major Indian telecom operator entering CPaaS/CCaaS.")).toBe(false);
    expect(isEligibleBullet("Built a project economics and cost modelling engine for real-time CapEx, OpEx, and IRR analysis across multiple project concepts at once.")).toBe(true);
    expect(isEligibleBullet("Led the internal AI strategy team, reforming how research and consulting work gets delivered.")).toBe(true);
  });

  it("a relevant bullet beats a more quantified but irrelevant one", () => {
    const RELEVANT = "Led capital program readiness for a green energy entity, covering the governance model that secured board approval.";
    const QUANTIFIED = "Scaled a creator platform to 150+ creators and 70,000 monthly viewers, tripling audience in 8 months.";
    const p: Profile = { ...getSeedProfile(), experience: [{ id: "a", company: "Bain and Company", role: "Project Leader", tenure: "2025", location: "", current: true, bullets: [QUANTIFIED, RELEVANT].join("\n") }] };
    const ids = listProfileBullets(p);
    const ranking = [
      { sourceBulletId: ids.find(r => r.text === RELEVANT)!.id, relevance: 90 },
      { sourceBulletId: ids.find(r => r.text === QUANTIFIED)!.id, relevance: 20 },
    ];
    const base = { name: "", contactLine: "", summary: "", sectionOrder: "experience-first", experience: [], education: [], skills: [], bulletRanking: ranking } as unknown as ResumeContent;
    const out = buildFilledSelection(p, base, "consulting", 2);
    const bullets = [...out.experience[0].bullets].sort((a, b) => a.priority - b.priority);
    expect(bullets[0].text).toBe(RELEVANT);
  });

  it("isAiRelatedJd reads the role and requirements", () => {
    expect(isAiRelatedJd(AI_APP, AI_REQS)).toBe(true);
    expect(isAiRelatedJd(CAPITAL_APP, CAPITAL_REQS)).toBe(false);
  });

  it("extractTopRequirements falls back to the parsed JD and flags fewer than 3", async () => {
    vi.mocked(chatJSON).mockImplementation((async () => null) as never);
    const r = await extractTopRequirements(app("Analyst", ["SQL"], []));
    expect(r.requirements).toEqual(["SQL"]);
    expect(r.tooThin).toBe(true);
    expect(r.warning).toBe(JD_TOO_THIN_WARNING);
  });
});

describe("4. summary rules (pure)", () => {
  const bulletTexts = ["Cut manual review effort by 80% across 16 projects.", "Lifted IRR from 6% to the 10% hurdle rate."];
  it("flags more than 3 sentences, more than ~60 words, filler, banned phrases, repeated figures and copied JD wording", () => {
    const v = summaryViolations(
      "One. Two. Three. Four approaches every engagement from first principles and is passionate about synergy. Cut review effort by 80%. Delivers capital project delivery for energy and infrastructure clients.",
      { bulletTexts, jdText: "We need capital project delivery for energy and infrastructure clients." },
    );
    const joined = v.join(" | ");
    expect(joined).toMatch(/sentences/);
    expect(joined).toMatch(/first principles/);
    expect(joined).toMatch(/approaches every engagement/);
    expect(joined).toMatch(/passionate about/);
    expect(joined).toMatch(/repeats figure.*80/);
    expect(joined).toMatch(/copies JD wording/);
    expect(summaryViolations("word ".repeat(80).trim() + ".", { bulletTexts }).join(" ")).toMatch(/80 words/);
  });

  it("years are not proof-point figures; a clean 3-sentence summary passes", () => {
    expect(summaryViolations(GOOD_SUMMARY, { bulletTexts })).toEqual([]);
  });

  it("repairSummary drops later sentences that repeat a bullet figure and keeps at most 3", () => {
    const fixed = repairSummary("Consultant with 10+ years. Cut review effort by 80%. Leads capital programs. Builds AI tools. Advises boards.", { bulletTexts });
    expect(splitSentences(fixed)).toEqual(["Consultant with 10+ years.", "Leads capital programs.", "Builds AI tools."]);
  });
});

describe("5. scope lines (pure)", () => {
  it("scope statements are recognised and come from the role's own bullets, else config", () => {
    expect(isScopeLine("Primary client interface across 12+ mandates for Fortune 500 clients.")).toBe(true);
    expect(isScopeLine("Leading cross-functional teams across workstreams.")).toBe(true);
    expect(isScopeLine("Led a market entry strategy.")).toBe(false);
    expect(scopeLineFor({ company: "Aranca", bullets: "Built a model." })).toMatch(/^Primary client interface/);
    expect(scopeLineFor({ company: "Tecnova India", bullets: "Built a model." })).toBeNull();
  });
});

describe("6. skills (pure)", () => {
  it("drops a JD-matching skill that no selected bullet evidences", () => {
    const bullets = [{ sourceBulletId: "e_1", text: "Led a market entry strategy for a French conglomerate in India." }];
    const rows = selectResumeSkills([{ category: "S", items: ["market entry", "pricing strategy"] }], { jdTerms: new Set(["market", "entry", "pricing"]), aiJd: false, technicalJd: false, bullets });
    expect(rows.flatMap(r => r.items)).toEqual(["market entry"]);
    expect(evidenceFor("market entry", bullets)).toBe("e_1");
    expect(evidenceFor("pricing strategy", bullets)).toBeNull();
    expect(keepEvidencedSkills([{ category: "S", items: ["market entry", "pricing strategy"] }], bullets)).toEqual([{ category: "S", items: ["market entry"] }]);
    expect(keepEvidencedSkills([{ category: "S", items: ["pricing strategy"] }], bullets)).toEqual([]);
  });

  const jdTerms = jdRelevanceTerms(AI_APP, AI_REQS);
  it("keeps model picks that are taxonomy items, drops filler and non-taxonomy items, caps at 2 x 6", () => {
    const rows = selectResumeSkills([{ category: "Mixed", items: ["Strategic Initiatives", "Python", "market entry", "Synergy building"] }], { jdTerms, aiJd: true, technicalJd: false });
    expect(rows.length).toBeLessThanOrEqual(2);
    const items = rows.flatMap(r => r.items);
    expect(items).toContain("market entry");
    expect(items).not.toContain("Strategic Initiatives");
    expect(items).not.toContain("Synergy building");
    expect(items).not.toContain("Python"); // Technical row only for a technical role
    for (const r of rows) expect(r.items.length).toBeLessThanOrEqual(6);
  });

  it("includes the Technical row for a technical role", () => {
    const rows = selectResumeSkills([{ category: "Tech", items: ["Python", "TypeScript", "React"] }], { jdTerms, aiJd: true, technicalJd: true });
    expect(rows.map(r => r.category)).toContain("Technical");
  });
});

describe("8. education lines (pure)", () => {
  it("adds the satellite line under Manipal and the publications line once", () => {
    const p = profile();
    const ed = finalizeEducation([{ institution: "Manipal Institute of Technology", degree: "B.Tech", years: "2016", achievements: ["Debate captain"] }], p);
    expect(ed[0].achievements).toHaveLength(2);
    expect(publicationsLine(p)).not.toContain("IEEE");
  });
});

describe("9. bolding: thousands separators and headline figures", () => {
  const bold = (t: string) => splitTextByBoldSpans(t, computeBoldSpans(t)).filter(s => s.bold).map(s => s.text);
  it("bolds 16,000 projects whole, never 16,**000 projects**", () => {
    const b = bold("Built a knowledge management system spanning 17 capital-project industries and 16,000 projects.");
    expect(b).toContain("16,000 projects");
    expect(b).not.toContain("000 projects");
  });
  it("bolds Madcue's 150+ creators and 70,000 monthly viewers", () => {
    const b = bold("Co-founded and scaled a creator economy platform to 150+ independent creators and 70,000 monthly viewers, tripling audience in 8 months.");
    expect(b).toContain("150+ independent creators");
    expect(b).toContain("70,000 monthly viewers");
  });
});

// ─── Real export (opt-in: needs LibreOffice) ───────────────────────────
// RESUME_LIVE_EXPORT=1 npx vitest run lib/__tests__/resume-rebuild.test.ts
// Renders DOCX -> LibreOffice PDF -> pdf-parse with measure-and-fill and the
// confidentiality gate on both texts. RESUME_LIVE_EXPORT_DIR saves the PDFs.
describe.runIf(process.env.RESUME_LIVE_EXPORT === "1")("real export (LibreOffice)", () => {
  for (const [name, a, reqs] of [["capital", CAPITAL_APP, CAPITAL_REQS], ["ai", AI_APP, AI_REQS]] as const) {
    it(`${name} JD exports without padding or blocking`, { timeout: 300_000 }, async () => {
      const { runResumeExport } = await import("../server/resume-export-pipeline");
      const p = profile();
      mockModel(p, { reqs: [...reqs], summary: GOOD_SUMMARY });
      const r = await generateResumeContent(p, a, undefined, "consulting");
      const ex = await runResumeExport({ resumeContent: r.data, archetype: r.archetype, maxPages: r.maxPages });
      if (!ex.ok) throw new Error(`export rejected: ${JSON.stringify(ex.body)}`);
      console.log(`LIVE ${name}: pages=${ex.pageCount} pageTwo=${ex.pageTwoFillPercent}% steps=${ex.fill.steps.map(s => s.action).join(",")} ` +
        `warning=${ex.fillWarning ? "yes" : "no"} perEmployer=${ex.resumeContent.experience.map(e => `${e.company}=${e.bullets.length}`).join(",")} subLabels=${ex.subLabelsRendered}`);
      if (process.env.RESUME_LIVE_EXPORT_DIR) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(`${process.env.RESUME_LIVE_EXPORT_DIR}/rebuild-${name}.pdf`, ex.pdfBuffer);
      }
      expect(ex.pageCount).toBeLessThanOrEqual(2);
      expect(ex.subLabelsRendered).toBe(true);
      if (ex.pageCount === 2 && (ex.pageTwoFillPercent ?? 100) < 50) expect(ex.fillWarning).toBeTruthy();
    });
  }
});
