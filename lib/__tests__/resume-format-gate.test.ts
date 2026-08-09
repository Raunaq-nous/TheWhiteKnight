import { describe, it, expect } from "vitest";
import { runFormatGate, formatGateFailureMessage, hasIdentifiableOutcome } from "../resume-format-gate";
import { ONE_PAGE_BUDGET } from "../resume-budget";
import type { ResumeContent } from "../resume-schema";

function baseContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100",
    summary: "Five years shipping AI products for enterprise customers.",
    sectionOrder: "experience-first",
    experience: [{
      company: "Acme AI",
      role: "Senior PM",
      tenure: "2021 - Present",
      location: "",
      bullets: [
        { sourceBulletId: "e_1", text: "Led a 0-to-1 launch of an AI recommendation engine, increasing engagement by 32%.", priority: 1 },
      ],
    }],
    education: [],
    skills: [{ category: "Product", items: ["Roadmapping", "PRD writing"] }],
    projects: [],
    keyWins: [],
    keyWinIds: [],
    ...overrides,
  } as ResumeContent;
}

function bulletContent(text: string): ResumeContent {
  return baseContent({
    experience: [{
      company: "Acme AI", role: "Senior PM", tenure: "2021", location: "",
      bullets: [{ sourceBulletId: "e_1", text, priority: 1 }],
    }],
  });
}

describe("hasIdentifiableOutcome — widened detector (PROBLEM 1)", () => {
  it("accepts the three real bullets the narrower detector wrongly rejected", () => {
    expect(hasIdentifiableOutcome(
      "Built digital readiness evaluation framework for a global cloud provider entering India, assessed 10+ GSI partners, delivered tiered engagement model and GTM strategy.",
    )).toBe(true);
    expect(hasIdentifiableOutcome(
      "Structured commercial framework and return analysis for global port operator across APAC, Europe, and Africa bid advisory.",
    )).toBe(true);
    expect(hasIdentifiableOutcome(
      "Led competitive analysis on compliance assurance programs for a top hyperscale cloud provider, directly shaping product roadmap and M&A screening.",
    )).toBe(true);
  });

  it("still accepts a quantitative outcome (unchanged behavior)", () => {
    expect(hasIdentifiableOutcome("Delivered $10.45B portfolio intelligence cockpit.")).toBe(true);
  });

  it("still rejects pure activity description with no result of any kind", () => {
    expect(hasIdentifiableOutcome("Worked on various initiatives across the team.")).toBe(false);
    expect(hasIdentifiableOutcome("Attended weekly stakeholder meetings.")).toBe(false);
  });

  it("accepts a decision outcome with no number attached", () => {
    expect(hasIdentifiableOutcome("Structured the C-suite decision document for the board.")).toBe(true);
    expect(hasIdentifiableOutcome("Enabled investment commitment on a previously non-feasible project.")).toBe(true);
  });
});

describe("runFormatGate — graded severity (PROBLEM 2)", () => {
  it("passes clean content: not blocked, no hard failures, no warnings", () => {
    const result = runFormatGate(baseContent());
    expect(result.blocked).toBe(false);
    expect(result.hardFailures).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("HARD FAILS on an em-dash and blocks export", () => {
    const content = baseContent({ summary: "Built products - shipped fast".replace("-", "—") });
    const result = runFormatGate(content);
    expect(result.blocked).toBe(true);
    expect(result.hardFailures.some(v => /em-dash/.test(v.reason))).toBe(true);
  });

  it("HARD FAILS on brackets", () => {
    const content = baseContent({ summary: "Shipped [redacted] feature." });
    const result = runFormatGate(content);
    expect(result.blocked).toBe(true);
    expect(result.hardFailures.some(v => /bracket/.test(v.reason))).toBe(true);
  });

  it("HARD FAILS on a pipe in real document content (contactLine's own separator is exempt)", () => {
    const content = baseContent({ summary: "Built products | shipped fast" });
    const result = runFormatGate(content);
    expect(result.blocked).toBe(true);
    expect(result.hardFailures.some(v => /pipe/.test(v.reason))).toBe(true);
  });

  it("does not flag contactLine's own \"email | phone\" pipe separator", () => {
    const result = runFormatGate(baseContent({ contactLine: "jordan@example.com | 555-0100" }));
    expect(result.hardFailures.some(v => v.location === "contact line" && /pipe/.test(v.reason))).toBe(false);
  });

  it("HARD FAILS on a truncated/mid-sentence bullet (no terminal punctuation) — still blocks export", () => {
    const content = bulletContent("Delivered 40% growth in engagement");
    const result = runFormatGate(content);
    expect(result.blocked).toBe(true);
    expect(result.hardFailures.some(v => /truncated\/mid-sentence/.test(v.reason))).toBe(true);
  });

  it("WARNS (does not block) on a bullet over the character cap", () => {
    const longBullet = "Delivered ".repeat(30) + "50% growth.";
    expect(longBullet.length).toBeGreaterThan(ONE_PAGE_BUDGET.bulletMaxChars);
    const result = runFormatGate(bulletContent(longBullet));
    expect(result.blocked).toBe(false);
    expect(result.warnings.some(v => /character cap/.test(v.reason))).toBe(true);
    expect(result.hardFailures).toHaveLength(0);
  });

  it("WARNS (does not block) on a role with more bullets than the per-role cap", () => {
    const bullets = Array.from({ length: ONE_PAGE_BUDGET.bulletsPerRoleMax + 1 }, (_, i) => ({
      sourceBulletId: `e_${i}`, text: `Delivered result number ${i}, saving $10M.`, priority: i + 1,
    }));
    const content = baseContent({ experience: [{ company: "Acme AI", role: "Senior PM", tenure: "2021", location: "", bullets }] });
    const result = runFormatGate(content);
    expect(result.blocked).toBe(false);
    expect(result.warnings.some(v => /per-role cap/.test(v.reason))).toBe(true);
  });

  it("WARNS (does not block) on a bullet with no identifiable outcome, and records it as a structured outcomeWarning", () => {
    const content = bulletContent("Worked on various initiatives across the team.");
    const result = runFormatGate(content);
    expect(result.blocked).toBe(false);
    expect(result.warnings.some(v => /outcome/.test(v.reason))).toBe(true);
    expect(result.outcomeWarnings).toEqual([
      { company: "Acme AI", bulletIndex: 0, text: "Worked on various initiatives across the team." },
    ]);
  });

  it("does not flag a bullet with a real qualitative outcome as an outcomeWarning", () => {
    const content = bulletContent("Structured commercial framework and return analysis for global port operator across APAC, Europe, and Africa bid advisory.");
    const result = runFormatGate(content);
    expect(result.outcomeWarnings).toHaveLength(0);
  });

  it("collects both hard failures and warnings independently in the same pass", () => {
    const content = baseContent({
      summary: "Shipped [bad] stuff",
      experience: [{
        company: "Acme AI", role: "Senior PM", tenure: "2021", location: "",
        bullets: [{ sourceBulletId: "e_1", text: "no punctuation and no outcome at all", priority: 1 }],
      }],
    });
    const result = runFormatGate(content);
    expect(result.blocked).toBe(true);
    // bracket + missing terminal punctuation are HARD; missing outcome is WARN.
    expect(result.hardFailures.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.some(v => /outcome/.test(v.reason))).toBe(true);
  });
});

describe("formatGateFailureMessage", () => {
  it("renders a loud, itemized message naming each HARD violation's location and reason", () => {
    const result = runFormatGate(baseContent({ summary: "Shipped [bad] stuff" }));
    const msg = formatGateFailureMessage(result);
    expect(msg).toContain("FORMAT GATE FAILED");
    expect(msg).toContain("summary");
    expect(msg).toContain("bracket");
  });
});
