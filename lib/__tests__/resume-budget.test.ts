import { describe, it, expect } from "vitest";
import {
  clampToOnePageBudget, clampText, clampBulletText, clampBulletPreservingOutcome, estimateResumeLineCount,
  MAX_LINES_PER_PAGE, ONE_PAGE_BUDGET, TWO_PAGE_BUDGET, budgetForMaxPages, compressOlderRoles,
  enforceMinBulletsPerRole, capTopBandPerCompany,
} from "../resume-budget";
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
// mirrors actual bullet text: many ordinary-length words in a row. Takes a
// distinct word pool per call site so unrelated fixture fields (experience
// bullets vs. keyWins/projects) don't accidentally share enough vocabulary
// to trip the semantic dedupe (BUG C) against each other.
// Includes a comma partway through, like every real bullet in this app's
// actual profile data — the clause-boundary-only compressor (BUG: cutting
// mid-noun-phrase) needs SOME clause boundary to trim at, or an overflowing
// bullet with no natural delimiter at all gets dropped entirely rather
// than mangled, which is correct but not what most of these fixtures are
// meant to exercise.
const DANGLING_WORDS = new Set(["and", "or", "but", "nor", "with", "for", "to", "of", "in", "on", "at", "by", "as", "the", "a", "an", "from"]);

function longFiller(targetLen: number, pool = "Delivered measurable outcomes across multiple engagements for global clients spanning finance technology and infrastructure sectors with substantial impact"): string {
  const words = pool.split(" ");
  let out = "";
  let i = 0;
  while (out.length < targetLen) {
    const word = words[i % words.length];
    out += (out ? " " : "") + word;
    // Never land the comma right after a word that would itself read as a
    // dangling conjunction/preposition once trimmed to this clause.
    if (out.length >= Math.floor(targetLen * 0.35) && !out.includes(",") && !DANGLING_WORDS.has(word.toLowerCase())) out += ",";
    i++;
  }
  return out.slice(0, targetLen);
}
const KEY_WIN_POOL = "Negotiated regional agreements involving distinct partners across separate territories covering logistics procurement and vendor consolidation workstreams entirely";

function richConsultingContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100",
    summary: longFiller(500), // deliberately over budget
    sectionOrder: "experience-first",
    // 6 entries, each with its OWN distinct priority band (entry i:
    // 10*i+1..10*i+4) so role-capping/global-trimming behavior is
    // deterministic — entry 0 is always the most relevant, entry 5 always
    // the least, with no ties to arbitrate.
    experience: Array.from({ length: 6 }, (_, i) => ({
      company: `Company ${i}`,
      role: "Consultant",
      tenure: "2020 - Present",
      location: "",
      bullets: [
        makeBullet(i === 0 ? longFiller(300) : `Bullet ${i}-1.`, i * 10 + 1), // entry 0's first bullet is deliberately over budget, must clamp
        makeBullet(`Bullet ${i}-2.`, i * 10 + 2),
        makeBullet(`Bullet ${i}-3.`, i * 10 + 3),
        makeBullet(`Bullet ${i}-4.`, i * 10 + 4),
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
    projects: Array.from({ length: 6 }, (_, i) => ({ name: `Project ${i}`, description: longFiller(250, KEY_WIN_POOL) })),
    keyWins: Array.from({ length: 6 }, (_, i) => `Win ${i}: ${longFiller(240, KEY_WIN_POOL)}`),
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
    const result = clampBulletText("Delivered a multi-plant capital program strategy, with board-level sign-off from the utility", 60);
    expect(result).not.toBeNull();
    expect(/[.!?]$/.test(result!)).toBe(true);
  });

  it("never cuts mid-word or mid-clause — result is always a whole-clause prefix of the source", () => {
    const original = "Delivered multi-plant capital program strategy for North American nuclear utility, unlocking a multi-billion-dollar program";
    const result = clampBulletText(original, 90);
    expect(result).not.toBeNull();
    const withoutPeriod = result!.replace(/\.$/, "");
    expect(original.startsWith(withoutPeriod)).toBe(true);
  });

  it("drops the item entirely (returns null) when even the FIRST clause alone exceeds the budget — never trims WITHIN a clause", () => {
    // Same source as above, but too tight for even "Delivered multi-plant
    // capital program strategy for North American nuclear utility" alone.
    const original = "Delivered multi-plant capital program strategy for North American nuclear utility, unlocking a multi-billion-dollar program";
    expect(clampBulletText(original, 80)).toBeNull();
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

// BUG B — THE MOST IMPORTANT FIX: the outcome clause must survive clamping.
// The real reported example: profile bullet's outcome ("enabling investment
// commitment on a previously non-feasible project") was being deleted
// because the old clamp trimmed from the END, and impact sits at the end of
// a CAR bullet.
describe("clampBulletPreservingOutcome — impact must survive (BUG B)", () => {
  const OG_BULLET =
    "Led concept selection study for South American national O&G company: designed AI-augmented evaluation framework across financial, technical, and regulatory dimensions; structured C-suite decision document enabling investment commitment on a previously non-feasible project";

  it("the exact reported O&G example renders with its outcome intact", () => {
    const result = clampBulletPreservingOutcome(OG_BULLET, 240);
    expect(result).not.toBeNull();
    expect(result).toContain("enabling investment commitment on a previously non-feasible project");
  });

  it("preserves the outcome even under a tight cap that forces real trimming", () => {
    const result = clampBulletPreservingOutcome(OG_BULLET, 150);
    expect(result).not.toBeNull();
    expect(result).toContain("enabling investment commitment on a previously non-feasible project");
    expect(result!.length).toBeLessThanOrEqual(150);
  });

  it("shortens the SETUP, never the outcome, as the cap tightens", () => {
    const loose = clampBulletPreservingOutcome(OG_BULLET, 240)!;
    const tight = clampBulletPreservingOutcome(OG_BULLET, 150)!;
    // The outcome clause is identical in both — only the setup shrank.
    const outcome = "structured C-suite decision document enabling investment commitment on a previously non-feasible project.";
    expect(loose.toLowerCase()).toContain(outcome.toLowerCase());
    expect(tight.toLowerCase()).toContain(outcome.toLowerCase());
    expect(tight.length).toBeLessThan(loose.length);
  });

  it("drops the whole bullet (returns null) when even the outcome alone can't fit — never emits an impact-less bullet", () => {
    const result = clampBulletPreservingOutcome(OG_BULLET, 40);
    expect(result).toBeNull();
  });

  it("preserves specific scope markers ($10.45B, 16 projects, board-level, C-suite) rather than paraphrasing them away", () => {
    const cases = [
      { text: "Built a portfolio intelligence cockpit spanning finance, ops, and delivery workstreams across a $10.45B, 16-project, 10-site capital program.", marker: "$10.45B" },
      { text: "Delivered multi-plant capital program strategy for North American nuclear utility, securing board-level sign-off on the recommendation.", marker: "board-level" },
      { text: "Led concept selection study for South American O&G company, structuring a C-suite decision document on the investment case.", marker: "C-suite" },
    ];
    for (const { text, marker } of cases) {
      const result = clampBulletPreservingOutcome(text, 240);
      expect(result).not.toBeNull();
      expect(result).toContain(marker);
    }
  });

  it("no rendered bullet is impact-less when its source contained an outcome clause, across a full clampToOnePageBudget pass", () => {
    const content = richConsultingContent({
      experience: [{
        company: "Bain & Company", role: "Consultant", tenure: "2025 - Present", location: "",
        bullets: [{ text: OG_BULLET, priority: 1 }],
      }],
    });
    const clamped = clampToOnePageBudget(content, "consulting");
    const bain = clamped.experience.find(e => e.company === "Bain & Company")!;
    expect(bain.bullets.length).toBeGreaterThan(0);
    expect(bain.bullets[0].text).toContain("enabling investment commitment on a previously non-feasible project");
  });

  it("falls back to the plain grammar-safe clamp when no outcome marker exists at all", () => {
    const noMarker = "Led a cross-functional workshop series, to align stakeholders on a shared roadmap for the coming quarter";
    const result = clampBulletPreservingOutcome(noMarker, 60);
    expect(result).not.toBeNull();
    expect(/[.!?]$/.test(result!)).toBe(true);
  });

  it("drops (returns null) a no-outcome bullet whose first clause alone still exceeds the budget, rather than trim mid-clause", () => {
    const noMarkerSingleClause = "Led a cross-functional workshop series to align stakeholders on a shared roadmap for the coming quarter";
    expect(clampBulletPreservingOutcome(noMarkerSingleClause, 60)).toBeNull();
  });
});

// PROBLEM 1 (real reported bug): compression cut mid-noun-phrase — the
// source "Designed a portfolio intelligence cockpit integrating cost,
// schedule, and risk data with Monte Carlo-driven early-warning alerts and
// a stage-gate governance framework, demonstrated on..." became "Designed
// a portfolio," (grammatically terminated, but the object of "Designed"
// was truncated mid-phrase — nonsense). Fixed by trimming at clause
// boundaries ONLY, never inside one.
describe("clause-boundary-only compression — the exact reported bug (PROBLEM 1)", () => {
  const REAL_SETUP =
    "Designed a portfolio intelligence cockpit integrating cost, schedule, and risk data with Monte Carlo-driven early-warning alerts and a stage-gate governance framework";
  const REAL_FULL_BULLET =
    `${REAL_SETUP}, demonstrated on a $10.45B portfolio of 16 projects across 10+ sites in a single integrated capital planning system.`;

  it("never produces the reported broken fragment, and the result is always a whole-clause prefix of the source", () => {
    const result = clampBulletText(REAL_SETUP, 70);
    expect(result).not.toBeNull();
    expect(result).not.toBe("Designed a portfolio.");
    expect(REAL_SETUP.startsWith(result!.replace(/\.$/, ""))).toBe(true);
    // The object of "Designed" ("a portfolio intelligence cockpit") must
    // survive whole — never truncated mid-noun-phrase.
    expect(result).toContain("a portfolio intelligence cockpit");
  });

  it("drops the setup entirely (null) rather than truncate inside the first clause when even that doesn't fit", () => {
    expect(clampBulletText(REAL_SETUP, 45)).toBeNull();
  });

  it("the exact real full bullet: outcome survives, and if the setup is trimmed it is trimmed at a whole clause boundary, never mid-phrase", () => {
    const result = clampBulletPreservingOutcome(REAL_FULL_BULLET, 130);
    expect(result).not.toBeNull();
    expect(result).toContain("$10.45B portfolio of 16 projects across 10+ sites");
    expect(result).not.toContain("Designed a portfolio,");
    expect(result).not.toMatch(/Designed a portfolio\.[^,]/); // never a bare truncated object
  });

  it("at a looser budget, keeps the first whole clause of the setup intact alongside the outcome", () => {
    const result = clampBulletPreservingOutcome(REAL_FULL_BULLET, 200)!;
    expect(result).toContain("Designed a portfolio intelligence cockpit integrating cost");
    expect(result).toContain("$10.45B portfolio of 16 projects across 10+ sites");
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
    // Entry 0 has the lowest (most relevant) priority band and is never
    // touched by the global trim — its top 3 (of 4) bullets survive intact.
    expect(clamped.experience[0].bullets.map(b => b.priority).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("clamps every surviving bullet's text length", () => {
    const clamped = clampToOnePageBudget(richConsultingContent(), "consulting");
    for (const e of clamped.experience) {
      for (const b of e.bullets) {
        expect(b.text.length).toBeLessThanOrEqual(ONE_PAGE_BUDGET.bulletMaxChars);
      }
    }
  });

  it("drops the weakest roles entirely once there are more than experienceMaxRoles (BUG D) — never more than the cap survive", () => {
    const content = richConsultingContent(); // 6 entries, distinct priority bands
    const clamped = clampToOnePageBudget(content, "consulting");
    expect(clamped.experience.length).toBeLessThanOrEqual(ONE_PAGE_BUDGET.experienceMaxRoles);
    expect(clamped.experience.length).toBe(4);
    // The 2 lowest-relevance roles (highest priority bands) are gone entirely.
    const companies = clamped.experience.map(e => e.company);
    expect(companies).toContain("Company 0");
    expect(companies).not.toContain("Company 4");
    expect(companies).not.toContain("Company 5");
  });

  it("does not drop any role when there are experienceMaxRoles or fewer to begin with", () => {
    const content = richConsultingContent({ experience: richConsultingContent().experience.slice(0, 3) });
    const clamped = clampToOnePageBudget(content, "consulting");
    expect(clamped.experience).toHaveLength(3);
  });

  it("allows a genuinely multi-engagement role to keep up to bulletsPerRoleMax (3) distinct bullets, never collapsed to 1", () => {
    const content = richConsultingContent({
      experience: [{
        company: "Bain & Company", role: "Consultant", tenure: "2020 - Present", location: "",
        bullets: [
          makeBullet("Delivered nuclear capital program: board-level recommendation, multi-billion-dollar program.", 1),
          makeBullet("Identified CapEx/OpEx optimization for solar project: delivered IRR improvement roadmap.", 2),
          makeBullet("Led concept selection study for O&G company: enabled investment commitment on the project.", 3),
          makeBullet("Built AI platform: RAG document intelligence, agentic workplan generator, 16-project scope.", 4),
        ],
      }],
    });
    const clamped = clampToOnePageBudget(content, "consulting");
    expect(clamped.experience).toHaveLength(1);
    expect(clamped.experience[0].bullets).toHaveLength(3); // top 3 of 4 distinct engagements survive, not collapsed to 1
  });

  it("global bullet trim is asymmetric by relevance — a highly-relevant role keeps more bullets than a barely-relevant one", () => {
    // 4 entries (== experienceMaxRoles, so no role gets dropped) x 4 bullets
    // = 16, capped per-entry to 3 (=12), then over the 10-bullet global cap,
    // so a real cross-entry trim must still happen.
    const content = richConsultingContent({
      experience: [
        { company: "Most Relevant Co", role: "Consultant", tenure: "2023 - Present", location: "", bullets: [1, 2, 3, 4].map(p => makeBullet(`Engagement ${p}`, p)) },
        { company: "Relevant Co", role: "Consultant", tenure: "2021 - 2023", location: "", bullets: [11, 12, 13, 14].map(p => makeBullet(`Engagement ${p}`, p)) },
        { company: "Somewhat Relevant Co", role: "Analyst", tenure: "2019 - 2021", location: "", bullets: [21, 22, 23, 24].map(p => makeBullet(`Engagement ${p}`, p)) },
        { company: "Barely Relevant Co", role: "Analyst", tenure: "2015 - 2018", location: "", bullets: [31, 32, 33, 34].map(p => makeBullet(`Old engagement ${p}`, p)) },
      ],
    });
    const clamped = clampToOnePageBudget(content, "consulting");
    expect(clamped.experience).toHaveLength(4); // none dropped — exactly at the role cap
    const total = clamped.experience.reduce((n, e) => n + e.bullets.length, 0);
    expect(total).toBe(10); // trimmed down to the global cap

    const mostRelevant = clamped.experience.find(e => e.company === "Most Relevant Co")!;
    const barelyRelevant = clamped.experience.find(e => e.company === "Barely Relevant Co")!;
    // Global trim removes highest priority-number bullets first, regardless
    // of which entry they're in — so the more relevant role (lower numbers)
    // should end up with more surviving bullets than the least relevant one.
    expect(mostRelevant.bullets).toHaveLength(3); // fully preserved at the per-role cap
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

// PROBLEM 4: dedupe promoting a role's best engagements to the top band
// left the role itself looking thin (one bullet). Fixed with a floor —
// enforceMinBulletsPerRole un-promotes just enough top-band items so the
// role keeps at least minBullets in Experience instead.
function bainContent(bainBulletCount: number, keyWinIds: string[]): ResumeContent {
  const bullets = Array.from({ length: bainBulletCount }, (_, i) => ({
    sourceBulletId: `bain_${i}`, text: `Bain engagement number ${i}, delivering real impact.`, priority: i + 1,
  }));
  return {
    name: "Jordan Lee", contactLine: "jordan@example.com | 555-0100", summary: "",
    sectionOrder: "experience-first",
    experience: [{ company: "Bain & Company", role: "Consultant", tenure: "2020 - Present", location: "", bullets }],
    education: [], skills: [], projects: [],
    keyWins: keyWinIds.map(id => `Win from ${id}`),
    keyWinIds,
  } as ResumeContent;
}

describe("enforceMinBulletsPerRole (PROBLEM 4)", () => {
  it("un-promotes just enough top-band items to keep a role at the floor, when it started with enough bullets", () => {
    // 3 Bain bullets, all 3 promoted to keyWinIds — dedupe would otherwise
    // strip all 3 duplicates from Experience, leaving Bain with zero.
    const content = bainContent(3, ["bain_0", "bain_1", "bain_2"]);
    const floored = enforceMinBulletsPerRole(content, 2);
    // Exactly 1 of the 3 was un-promoted (need = 2 - 0 surviving = 2... but
    // un-promoting 2 satisfies the floor with the least disruption).
    expect(floored.keyWinIds!.length).toBeLessThan(3);
    const stillTopBand = new Set(floored.keyWinIds);
    const survivingInExperience = content.experience[0].bullets.filter(b => !stillTopBand.has(b.sourceBulletId!));
    expect(survivingInExperience.length).toBeGreaterThanOrEqual(2);
  });

  it("un-promotes the LOWEST-priority (weakest) duplicated bullets first, keeping the strongest in the top band", () => {
    const content = bainContent(3, ["bain_0", "bain_1", "bain_2"]); // priorities 1,2,3
    const floored = enforceMinBulletsPerRole(content, 2);
    // bain_0 (priority 1, strongest) should be the one that STAYS promoted.
    expect(floored.keyWinIds).toContain("bain_0");
  });

  it("does nothing when the role already has enough non-duplicated bullets", () => {
    const content = bainContent(4, ["bain_0"]); // 3 of 4 bullets remain even after removing the 1 duplicate
    const floored = enforceMinBulletsPerRole(content, 2);
    expect(floored).toEqual(content);
  });

  it("does nothing when a role never had enough bullets to begin with (nothing to redistribute)", () => {
    const content = bainContent(1, ["bain_0"]);
    const floored = enforceMinBulletsPerRole(content, 2);
    expect(floored).toEqual(content);
  });

  it("is a no-op when there is no top-band content at all", () => {
    const content = bainContent(3, []);
    expect(enforceMinBulletsPerRole(content, 2)).toEqual(content);
  });

  it("integration: a full clampToOnePageBudget pass never leaves a role with fewer than 2 bullets when it had enough to start", () => {
    const content: ResumeContent = {
      ...richConsultingContent(),
      experience: [{
        company: "Bain & Company", role: "Project Leader", tenure: "2025 - Present", location: "",
        bullets: [
          { sourceBulletId: "bain_a", text: "Delivered board-level recommendation for a multi-billion-dollar program.", priority: 1 },
          { sourceBulletId: "bain_b", text: "Led concept selection enabling investment commitment on the project.", priority: 2 },
          { sourceBulletId: "bain_c", text: "Structured governance framework across financial and regulatory dimensions.", priority: 3 },
        ],
      }],
      keyWins: ["Win A", "Win B", "Win C"],
      keyWinIds: ["bain_a", "bain_b", "bain_c"], // all 3 of Bain's bullets promoted
    };
    const clamped = clampToOnePageBudget(content, "consulting");
    const bain = clamped.experience.find(e => e.company === "Bain & Company");
    expect(bain).toBeDefined();
    expect(bain!.bullets.length).toBeGreaterThanOrEqual(2);
  });
});

describe("capTopBandPerCompany (PROBLEM 4: top band should draw from across employers)", () => {
  it("caps the number of top-band items tracing back to a single company", () => {
    const content: ResumeContent = {
      ...bainContent(4, ["bain_0", "bain_1", "bain_2"]),
      // A second company contributes nothing to the top band here.
    };
    const capped = capTopBandPerCompany(content, 2);
    const bainIdsInTopBand = capped.keyWinIds!.filter(id => id.startsWith("bain_"));
    expect(bainIdsInTopBand.length).toBeLessThanOrEqual(2);
  });

  it("keeps the highest-priority (earliest-listed) items for the over-represented company", () => {
    const content = bainContent(4, ["bain_0", "bain_1", "bain_2"]);
    const capped = capTopBandPerCompany(content, 2);
    expect(capped.keyWinIds).toEqual(["bain_0", "bain_1"]);
  });

  it("does not cap project-sourced top-band items (not tied to any employer)", () => {
    const content: ResumeContent = {
      ...bainContent(2, ["bain_0", "bain_1"]),
      projects: [{ sourceBulletId: "proj_1", name: "P1", description: "A project." }],
    };
    const capped = capTopBandPerCompany(content, 1);
    expect(capped.keyWinIds).toEqual(["bain_0"]);
    expect(capped.projects).toHaveLength(1); // untouched
  });

  it("leaves keyWins/keyWinIds index-aligned after capping", () => {
    const content = bainContent(4, ["bain_0", "bain_1", "bain_2"]);
    const capped = capTopBandPerCompany(content, 2);
    expect(capped.keyWins!.length).toBe(capped.keyWinIds!.length);
  });

  it("draws top-band items from multiple employers when both contribute strong bullets", () => {
    const content: ResumeContent = {
      name: "Jordan Lee", contactLine: "jordan@example.com | 555-0100", summary: "",
      sectionOrder: "experience-first",
      experience: [
        { company: "Bain & Company", role: "Consultant", tenure: "2020", location: "", bullets: [
          { sourceBulletId: "bain_0", text: "Bain win.", priority: 1 },
        ] },
        { company: "Aranca", role: "Analyst", tenure: "2018", location: "", bullets: [
          { sourceBulletId: "aranca_0", text: "Aranca win.", priority: 2 },
        ] },
      ],
      education: [], skills: [], projects: [],
      keyWins: ["Bain win.", "Aranca win."],
      keyWinIds: ["bain_0", "aranca_0"],
    } as ResumeContent;
    const capped = capTopBandPerCompany(content, 1);
    expect(capped.keyWinIds).toEqual(["bain_0", "aranca_0"]); // both survive — no employer over the cap of 1
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

describe("budgetForMaxPages", () => {
  it("returns ONE_PAGE_BUDGET for maxPages 1 (or omitted)", () => {
    expect(budgetForMaxPages(1)).toEqual(ONE_PAGE_BUDGET);
  });

  it("returns TWO_PAGE_BUDGET for maxPages 2", () => {
    expect(budgetForMaxPages(2)).toEqual(TWO_PAGE_BUDGET);
  });

  it("TWO_PAGE_BUDGET expands roles, bullets-per-role, and the key-impact band beyond ONE_PAGE_BUDGET, never shrinks them", () => {
    expect(TWO_PAGE_BUDGET.experienceMaxRoles).toBeGreaterThan(ONE_PAGE_BUDGET.experienceMaxRoles);
    expect(TWO_PAGE_BUDGET.bulletsPerRoleMax).toBeGreaterThan(ONE_PAGE_BUDGET.bulletsPerRoleMax);
    expect(TWO_PAGE_BUDGET.totalExperienceBulletsMax).toBeGreaterThan(ONE_PAGE_BUDGET.totalExperienceBulletsMax);
    expect(TWO_PAGE_BUDGET.keyImpactMaxItems).toBeGreaterThan(ONE_PAGE_BUDGET.keyImpactMaxItems);
  });
});

describe("clampToOnePageBudget with maxPages: 2 — expanded content budget", () => {
  it("keeps more roles, more bullets per role, and a fuller Key Projects & Impact band than the 1-page pass", () => {
    const content = richConsultingContent();
    const onePage = clampToOnePageBudget(content, "consulting", 1);
    const twoPage = clampToOnePageBudget(content, "consulting", 2);

    expect(twoPage.experience.length).toBeGreaterThanOrEqual(onePage.experience.length);
    const onePageBullets = onePage.experience.reduce((n, e) => n + e.bullets.length, 0);
    const twoPageBullets = twoPage.experience.reduce((n, e) => n + e.bullets.length, 0);
    expect(twoPageBullets).toBeGreaterThan(onePageBullets);

    const onePageImpact = (onePage.keyWins?.length ?? 0) + (onePage.projects?.length ?? 0);
    const twoPageImpact = (twoPage.keyWins?.length ?? 0) + (twoPage.projects?.length ?? 0);
    expect(twoPageImpact).toBeGreaterThan(onePageImpact);
  });

  it("never exceeds TWO_PAGE_BUDGET's caps even at maxPages 2", () => {
    const clamped = clampToOnePageBudget(richConsultingContent(), "consulting", 2);
    expect(clamped.experience.length).toBeLessThanOrEqual(TWO_PAGE_BUDGET.experienceMaxRoles);
    for (const e of clamped.experience) {
      expect(e.bullets.length).toBeLessThanOrEqual(TWO_PAGE_BUDGET.bulletsPerRoleMax);
    }
  });

  it("defaults to the 1-page budget when maxPages is omitted (back-compat)", () => {
    const content = richConsultingContent();
    const implicit = clampToOnePageBudget(content, "consulting");
    const explicit = clampToOnePageBudget(content, "consulting", 1);
    expect(implicit).toEqual(explicit);
  });
});

describe("compressOlderRoles — detail only the last 10-15 years, compress older roles to a single line", () => {
  const currentYear = new Date().getFullYear();

  function roleEndingYearsAgo(yearsAgo: number, bulletCount = 3) {
    const endYear = currentYear - yearsAgo;
    return {
      company: `Company ${yearsAgo}y ago`,
      role: "Consultant",
      tenure: yearsAgo === 0 ? "2015 - Present" : `${endYear - 3} - ${endYear}`,
      location: "",
      bullets: Array.from({ length: bulletCount }, (_, i) => ({ text: `Bullet ${i}.`, priority: i + 1 })),
    };
  }

  it("leaves a current role (Present) fully detailed", () => {
    const compressed = compressOlderRoles([roleEndingYearsAgo(0)]);
    expect(compressed[0].bullets.length).toBe(3);
  });

  it("leaves a role that ended within the last 10-15 years fully detailed", () => {
    const compressed = compressOlderRoles([roleEndingYearsAgo(8)]);
    expect(compressed[0].bullets.length).toBe(3);
  });

  it("compresses a role that ended more than 15 years ago to a single bullet", () => {
    const compressed = compressOlderRoles([roleEndingYearsAgo(20)]);
    expect(compressed[0].bullets.length).toBe(1);
  });

  it("keeps the strongest (lowest-priority) bullet when compressing", () => {
    const old = roleEndingYearsAgo(20);
    old.bullets = [
      { text: "Weaker bullet.", priority: 5 },
      { text: "Strongest bullet.", priority: 1 },
    ];
    const compressed = compressOlderRoles([old]);
    expect(compressed[0].bullets).toEqual([{ text: "Strongest bullet.", priority: 1 }]);
  });

  it("leaves a role with an unparseable tenure untouched", () => {
    const weird = roleEndingYearsAgo(20);
    weird.tenure = "Ask me about it";
    const compressed = compressOlderRoles([weird]);
    expect(compressed[0].bullets.length).toBe(3);
  });

  it("integrates with a full clampToOnePageBudget pass: an old role reads as one line even when otherwise eligible for more", () => {
    const content = richConsultingContent({
      experience: [
        { company: "Recent Co", role: "Consultant", tenure: "2022 - Present", location: "", bullets: [
          { text: "Recent bullet 1.", priority: 1 }, { text: "Recent bullet 2.", priority: 2 },
        ] },
        roleEndingYearsAgo(20, 4),
      ],
    });
    const clamped = clampToOnePageBudget(content, "consulting", 2);
    const old = clamped.experience.find(e => e.company.includes("20y ago"));
    expect(old).toBeDefined();
    expect(old!.bullets.length).toBe(1);
  });
});
