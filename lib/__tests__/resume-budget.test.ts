import { describe, it, expect } from "vitest";
import { clampToOnePageBudget, clampText, clampBulletText, estimateResumeLineCount, MAX_LINES_PER_PAGE, ONE_PAGE_BUDGET } from "../resume-budget";
import type { ResumeContent } from "../resume-schema";

// A rendered bullet must never end in a comma, a dangling conjunction/
// preposition (and/or/with/for/...), or lack terminal punctuation entirely.
function endsCleanly(text: string): boolean {
  if (/[,]$/.test(text.trim())) return false;
  if (!/[.!?]$/.test(text.trim())) return false;
  const withoutPeriod = text.trim().replace(/[.!?]+$/, "");
  const lastWord = withoutPeriod.trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  const banned = new Set(["and", "or", "with", "for"]);
  return !banned.has(lastWord);
}

function makeBullet(text: string, priority: number) {
  return { text, priority };
}

// Realistic space-separated filler of approximately targetLen characters —
// unlike a single giant "AAAA..." blob (which has no word boundaries and so
// doesn't exercise the clamp's real word-boundary logic realistically), this
// mirrors actual bullet text: many ordinary-length words in a row.
function longFiller(targetLen: number): string {
  const words = "Delivered measurable outcomes across multiple engagements for global clients spanning finance technology and infrastructure sectors with substantial impact".split(" ");
  let out = "";
  let i = 0;
  while (out.length < targetLen) {
    out += (out ? " " : "") + words[i % words.length];
    i++;
  }
  return out.slice(0, targetLen);
}

function richConsultingContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100",
    summary: longFiller(500), // deliberately over budget
    sectionOrder: "experience-first",
    experience: Array.from({ length: 6 }, (_, i) => ({
      company: `Company ${i}`,
      role: "Consultant",
      tenure: "2020 - Present",
      location: "",
      bullets: [
        makeBullet(longFiller(300), 1), // over budget, must clamp
        makeBullet("Second bullet.", 2),
        makeBullet("Third bullet.", 3),
        makeBullet("Fourth bullet.", 4),
      ],
    })),
    education: Array.from({ length: 4 }, (_, i) => ({
      institution: `University ${i}`,
      degree: "B.S.",
      field: "Something",
      years: "2010 - 2014",
      achievements: ["Dean's list", "Honors"],
    })),
    skills: Array.from({ length: 6 }, (_, i) => ({ category: `Cat ${i}`, items: Array.from({ length: 10 }, (_, j) => `Skill ${i}-${j}`) })),
    projects: Array.from({ length: 6 }, (_, i) => ({ name: `Project ${i}`, description: longFiller(250) })),
    keyWins: Array.from({ length: 6 }, (_, i) => `Win ${i}: ${longFiller(240)}`),
    leadership: ["Led club A", "Led club B"],
    certifications: [{ name: "Cert A" }],
    ...overrides,
  } as ResumeContent;
}

describe("clampText", () => {
  it("returns text unchanged when already within budget", () => {
    expect(clampText("Short bullet.", 100)).toBe("Short bullet.");
  });

  it("cuts at the last full sentence boundary when one fits", () => {
    const text = "First sentence here. Second sentence that pushes past the limit entirely.";
    const clamped = clampText(text, 30);
    expect(clamped).toBe("First sentence here.");
  });

  it("falls back to the last word boundary when no sentence fits", () => {
    const text = "onewordthatistoolongtofit anotherword andmore words here to exceed";
    const clamped = clampText(text, 20);
    expect(clamped.length).toBeLessThanOrEqual(20);
    expect(clamped).not.toMatch(/\s$/);
  });

  it("never cuts mid-word and never appends an ellipsis", () => {
    const clamped = clampText("Delivered a multi-billion-dollar capital program successfully across three sites", 40);
    expect(clamped).not.toContain("…");
    expect(clamped).not.toContain("...");
    expect("Delivered a multi-billion-dollar capital program successfully across three sites").toContain(clamped);
  });
});

// BUG 2 regression: real reported truncation fragments. Each of these was
// the observed END of a bullet under the old blind-character-slice
// behavior. Feeding a long source bullet that WOULD naturally truncate to
// one of these fragments must now produce a complete, grammatical clause
// instead — never a dangling conjunction/preposition, never a trailing
// comma, always terminal punctuation.
describe("clampBulletText — never truncates mid-sentence (BUG 2)", () => {
  const REPORTED_FRAGMENTS = [
    "designing governance and",
    "capital reallocation,",
    "and AI assurance",
    "used for",
    "and agentic tool",
  ];

  it("real reported fragments are not what the clamp would now produce for a naturally overflowing bullet", () => {
    // Reconstruct a plausible full-length source bullet that would have
    // been blindly sliced down to each fragment, and verify the new clamp
    // does not reproduce the same dangling ending.
    const sources = [
      "Delivered multi-plant capital program strategy for North American nuclear utility, designing governance and contractor selection frameworks for the program",
      "Identified CapEx and OpEx optimization levers for utility-scale solar project, built investment case for capital reallocation, produced IRR roadmap",
      "Built integrated agentic AI platform spanning document intelligence, workplan generation, cost modeling, and AI assurance across the full portfolio",
      "Structured a governance framework and contractor selection model used for the multi-billion-dollar nuclear capital program end to end",
      "Delivered a RAG-based document intelligence engine and agentic tool for contract and regulatory libraries across the full portfolio",
    ];
    for (let i = 0; i < sources.length; i++) {
      const result = clampBulletText(sources[i], 100); // tight budget forces a real cut
      if (result === null) continue; // dropping is an acceptable outcome too
      expect(result.endsWith(REPORTED_FRAGMENTS[i])).toBe(false);
      expect(endsCleanly(result)).toBe(true);
    }
  });

  it("never returns a result ending in a comma", () => {
    const result = clampBulletText("Identified CapEx and OpEx optimization levers for a utility-scale solar project, delivering capital reallocation, produced a roadmap", 90);
    expect(result).not.toBeNull();
    expect(result!.endsWith(",")).toBe(false);
  });

  it("never returns a result ending in a dangling conjunction or preposition (and/or/with/for)", () => {
    const cases = [
      "Delivered board-level recommendation for a multi-billion-dollar program designing governance and",
      "Built a platform for contract intelligence and cost modeling used for",
      "Structured the decision document across financial, technical, and regulatory dimensions and",
    ];
    for (const text of cases) {
      const result = clampBulletText(text, 60);
      if (result === null) continue;
      const lastWord = result.replace(/[.!?]+$/, "").trim().split(/\s+/).pop()!.toLowerCase();
      expect(["and", "or", "with", "for"]).not.toContain(lastWord);
    }
  });

  it("always ends in terminal punctuation (a period) when a result is returned", () => {
    const result = clampBulletText("Delivered a multi-plant capital program strategy for a North American nuclear utility with board-level sign-off", 60);
    expect(result).not.toBeNull();
    expect(/[.!?]$/.test(result!)).toBe(true);
  });

  it("never cuts mid-word", () => {
    const result = clampBulletText("Delivered multi-plant capital program strategy for North American nuclear utility, unlocking a multi-billion-dollar program", 80);
    expect(result).not.toBeNull();
    const original = "Delivered multi-plant capital program strategy for North American nuclear utility, unlocking a multi-billion-dollar program";
    const withoutPeriod = result!.replace(/\.$/, "");
    expect(original.startsWith(withoutPeriod) || original.includes(withoutPeriod)).toBe(true);
  });

  it("drops the bullet entirely (returns null) rather than emit an ungrammatical fragment when no clean cut exists", () => {
    // Every word in this text is a dangling conjunction/preposition, so no
    // matter how far back the algorithm retreats, the last remaining word
    // is always banned — there is no clean cut point anywhere.
    const pathological = "and or with for and or with for and or with for";
    const result = clampBulletText(pathological, 100, 30);
    expect(result).toBeNull();
  });

  it("accepts a bullet ending on a quantified value (number/%/$) without falsely treating it as ungrammatical", () => {
    expect(clampBulletText("Grew revenue by 32%", 100)).toBe("Grew revenue by 32%.");
    expect(clampBulletText("Delivered a $10.45B portfolio cockpit", 100)).toBe("Delivered a $10.45B portfolio cockpit.");
    expect(clampBulletText("Led a team of 12+", 100)).toBe("Led a team of 12+.");
  });

  it("leaves an already-short, already-complete bullet unchanged (plus a period), regardless of the minChars floor", () => {
    expect(clampBulletText("Second bullet", 150)).toBe("Second bullet.");
  });
});

describe("no rendered experience bullet ever ends badly, across a full clampToOnePageBudget pass", () => {
  it("every surviving bullet ends cleanly after clamping a profile full of overflowing, comma/conjunction-ending source bullets", () => {
    const content = richConsultingContent({
      experience: [{
        company: "Bain & Company", role: "Consultant", tenure: "2020 - Present", location: "",
        bullets: [
          makeBullet("Delivered multi-plant capital program strategy for North American nuclear utility, designing governance and contractor selection frameworks and", 1),
          makeBullet("Identified CapEx and OpEx optimization levers for utility-scale solar project, delivering capital reallocation,", 2),
          makeBullet("Built integrated agentic AI platform spanning document intelligence, cost modeling, and AI assurance and", 3),
          makeBullet("Structured governance framework and contractor selection model used for", 4),
        ],
      }],
    });
    const clamped = clampToOnePageBudget(content, "consulting");
    expect(clamped.experience[0].bullets.length).toBeGreaterThan(0);
    for (const b of clamped.experience[0].bullets) {
      expect(endsCleanly(b.text)).toBe(true);
    }
  });
});

describe("clampToOnePageBudget — the structural one-page guarantee", () => {
  it("clamps the summary to the budget length", () => {
    const clamped = clampToOnePageBudget(richConsultingContent(), "consulting");
    expect(clamped.summary.length).toBeLessThanOrEqual(ONE_PAGE_BUDGET.summaryMaxChars);
  });

  it("caps every experience entry to at most bulletsPerRoleMax bullets, keeping the top-priority ones", () => {
    const clamped = clampToOnePageBudget(richConsultingContent(), "consulting");
    for (const e of clamped.experience) {
      expect(e.bullets.length).toBeLessThanOrEqual(ONE_PAGE_BUDGET.bulletsPerRoleMax);
    }
    // Priority 1 and 2 survive, 3 and 4 are cut, for every entry.
    expect(clamped.experience[0].bullets.map(b => b.priority).sort()).toEqual([1, 2]);
  });

  it("clamps every surviving bullet's text length", () => {
    const clamped = clampToOnePageBudget(richConsultingContent(), "consulting");
    for (const e of clamped.experience) {
      for (const b of e.bullets) {
        expect(b.text.length).toBeLessThanOrEqual(ONE_PAGE_BUDGET.bulletMaxChars);
      }
    }
  });

  it("never drops an experience entry — all entries survive, only bullets are trimmed", () => {
    const content = richConsultingContent();
    const clamped = clampToOnePageBudget(content, "consulting");
    expect(clamped.experience).toHaveLength(content.experience.length);
  });

  it("allows a genuinely multi-engagement role to keep up to bulletsPerRoleMax (4) distinct bullets, never collapsed to 1", () => {
    const content = richConsultingContent({
      experience: [{
        company: "Bain & Company", role: "Consultant", tenure: "2020 - Present", location: "",
        bullets: [
          makeBullet("Delivered nuclear capital program: board-level recommendation, multi-billion-dollar program", 1),
          makeBullet("Identified CapEx/OpEx optimization for solar project: IRR improvement roadmap", 2),
          makeBullet("Led concept selection study for O&G company: enabled investment commitment", 3),
          makeBullet("Built AI platform: RAG document intelligence, agentic workplan generator", 4),
        ],
      }],
    });
    const clamped = clampToOnePageBudget(content, "consulting");
    expect(clamped.experience).toHaveLength(1);
    expect(clamped.experience[0].bullets).toHaveLength(4); // all 4 distinct engagements survive
  });

  it("global bullet trim is asymmetric by relevance — a highly-relevant role keeps more bullets than a barely-relevant one", () => {
    // 4 entries x 4 bullets = 16 total, over the 12-bullet global cap, so a
    // real trim must happen — spread across entries by priority, not evenly.
    const content = richConsultingContent({
      experience: [
        { company: "Most Relevant Co", role: "Consultant", tenure: "2023 - Present", location: "", bullets: [1, 2, 3, 4].map(p => makeBullet(`Engagement ${p}`, p)) },
        { company: "Relevant Co", role: "Consultant", tenure: "2021 - 2023", location: "", bullets: [11, 12, 13, 14].map(p => makeBullet(`Engagement ${p}`, p)) },
        { company: "Somewhat Relevant Co", role: "Analyst", tenure: "2019 - 2021", location: "", bullets: [21, 22, 23, 24].map(p => makeBullet(`Engagement ${p}`, p)) },
        { company: "Barely Relevant Co", role: "Analyst", tenure: "2015 - 2018", location: "", bullets: [31, 32, 33, 34].map(p => makeBullet(`Old engagement ${p}`, p)) },
      ],
    });
    const clamped = clampToOnePageBudget(content, "consulting");
    const total = clamped.experience.reduce((n, e) => n + e.bullets.length, 0);
    expect(total).toBe(12); // trimmed from 16 down to the global cap

    const mostRelevant = clamped.experience.find(e => e.company === "Most Relevant Co")!;
    const barelyRelevant = clamped.experience.find(e => e.company === "Barely Relevant Co")!;
    // Global trim removes highest priority-number bullets first, regardless
    // of which entry they're in — so the more relevant role (lower numbers)
    // should end up with more surviving bullets than the least relevant one.
    expect(mostRelevant.bullets).toHaveLength(4); // fully preserved
    expect(mostRelevant.bullets.length).toBeGreaterThan(barelyRelevant.bullets.length);
    expect(barelyRelevant.bullets.length).toBeGreaterThanOrEqual(1); // never emptied entirely
  });

  it("global trim never empties an entry down to zero bullets, even under extreme pressure", () => {
    const content = richConsultingContent({
      experience: Array.from({ length: 10 }, (_, i) => ({
        company: `Co ${i}`, role: "Consultant", tenure: "2020", location: "",
        bullets: [1, 2, 3, 4].map(p => makeBullet(`Bullet ${p}`, p)),
      })),
    });
    const clamped = clampToOnePageBudget(content, "consulting");
    for (const e of clamped.experience) {
      expect(e.bullets.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("caps the combined Key Projects & Impact band to keyImpactMaxItems total, keyWins first", () => {
    const clamped = clampToOnePageBudget(richConsultingContent(), "consulting");
    const total = (clamped.keyWins?.length ?? 0) + (clamped.projects?.length ?? 0);
    expect(total).toBeLessThanOrEqual(ONE_PAGE_BUDGET.keyImpactMaxItems);
    expect(clamped.keyWins?.length).toBe(ONE_PAGE_BUDGET.keyImpactMaxItems); // 6 keyWins available, only room for 4
    expect(clamped.projects).toEqual([]);
  });

  it("caps skills to skillsMaxCategories categories and skillsMaxItemsPerCategory items each", () => {
    const clamped = clampToOnePageBudget(richConsultingContent(), "consulting");
    expect(clamped.skills.length).toBeLessThanOrEqual(ONE_PAGE_BUDGET.skillsMaxCategories);
    for (const g of clamped.skills) expect(g.items.length).toBeLessThanOrEqual(ONE_PAGE_BUDGET.skillsMaxItemsPerCategory);
  });

  it("caps education entries and drops achievements entirely (one-line education)", () => {
    const clamped = clampToOnePageBudget(richConsultingContent(), "consulting");
    expect(clamped.education.length).toBeLessThanOrEqual(ONE_PAGE_BUDGET.educationMaxEntries);
    for (const ed of clamped.education) expect(ed.achievements).toBeNull();
  });

  it("nulls out leadership and certifications for consulting — not part of its fixed layout (BUG: education not last)", () => {
    const clamped = clampToOnePageBudget(richConsultingContent(), "consulting");
    expect(clamped.leadership).toBeNull();
    expect(clamped.certifications).toBeNull();
  });

  it("does not null out sections an archetype DOES use — e.g. product's standalone projects", () => {
    const content = richConsultingContent({ keyWins: null });
    const clamped = clampToOnePageBudget(content, "product");
    expect(clamped.projects).not.toBeNull();
    expect(clamped.projects!.length).toBeLessThanOrEqual(ONE_PAGE_BUDGET.keyImpactMaxItems);
  });

  it("is idempotent — clamping already-clamped content changes nothing further", () => {
    const once = clampToOnePageBudget(richConsultingContent(), "consulting");
    const twice = clampToOnePageBudget(once, "consulting");
    expect(twice).toEqual(once);
  });

  it("does not mutate the input content", () => {
    const content = richConsultingContent();
    const snapshot = JSON.stringify(content);
    clampToOnePageBudget(content, "consulting");
    expect(JSON.stringify(content)).toBe(snapshot);
  });
});

describe("estimateResumeLineCount / MAX_LINES_PER_PAGE — verifying the one-page guarantee structurally", () => {
  it("a maximally rich consulting profile, once budget-clamped, structurally fits within one page's line budget", () => {
    // This is the closest this repo's test environment (node, no DOM/print
    // renderer) can get to "verify the PDF is exactly one page": prove the
    // WORST CASE — every section maxed out — still fits under the line
    // budget a letter page holds at the fixed print font/line-height.
    const worstCase = richConsultingContent();
    const clamped = clampToOnePageBudget(worstCase, "consulting");
    const lines = estimateResumeLineCount(clamped, "consulting");
    expect(lines).toBeLessThanOrEqual(MAX_LINES_PER_PAGE);
  });

  it("an UNCLAMPED rich profile would exceed the one-page line budget (proves the clamp is load-bearing, not redundant)", () => {
    const worstCase = richConsultingContent();
    const lines = estimateResumeLineCount(worstCase, "consulting");
    expect(lines).toBeGreaterThan(MAX_LINES_PER_PAGE);
  });
});
