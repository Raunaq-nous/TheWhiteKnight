import { describe, it, expect } from "vitest";
import { clampToOnePageBudget, clampText, estimateResumeLineCount, MAX_LINES_PER_PAGE, ONE_PAGE_BUDGET } from "../resume-budget";
import type { ResumeContent } from "../resume-schema";

function makeBullet(text: string, priority: number) {
  return { text, priority };
}

function richConsultingContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100",
    summary: "A".repeat(500), // deliberately over budget
    sectionOrder: "experience-first",
    experience: Array.from({ length: 6 }, (_, i) => ({
      company: `Company ${i}`,
      role: "Consultant",
      tenure: "2020 - Present",
      location: "",
      bullets: [
        makeBullet("A".repeat(300), 1), // over budget, must clamp
        makeBullet("Second bullet", 2),
        makeBullet("Third bullet", 3),
        makeBullet("Fourth bullet", 4),
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
    projects: Array.from({ length: 6 }, (_, i) => ({ name: `Project ${i}`, description: "A".repeat(250) })),
    keyWins: Array.from({ length: 6 }, (_, i) => `Win ${i}: ${"A".repeat(250)}`),
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
