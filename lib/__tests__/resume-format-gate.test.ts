import { describe, it, expect } from "vitest";
import { runFormatGate, formatGateFailureMessage } from "../resume-format-gate";
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

describe("runFormatGate", () => {
  it("passes clean content with no violations", () => {
    const result = runFormatGate(baseContent());
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("rejects an em-dash anywhere in the content", () => {
    const content = baseContent({ summary: "Built products - shipped fast" .replace("-", "—") });
    const result = runFormatGate(content);
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => /em-dash/.test(v.reason))).toBe(true);
  });

  it("rejects brackets", () => {
    const content = baseContent({ summary: "Shipped [redacted] feature." });
    const result = runFormatGate(content);
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => /bracket/.test(v.reason))).toBe(true);
  });

  it("rejects pipes in real document content (contactLine's own \"email | phone\" separator is exempt — see comment in resume-format-gate.ts)", () => {
    const content = baseContent({ summary: "Built products | shipped fast" });
    const result = runFormatGate(content);
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => /pipe/.test(v.reason))).toBe(true);
  });

  it("does not flag contactLine's own \"email | phone\" pipe separator", () => {
    const content = baseContent({ contactLine: "jordan@example.com | 555-0100" });
    const result = runFormatGate(content);
    expect(result.violations.some(v => v.location === "contact line" && /pipe/.test(v.reason))).toBe(false);
  });

  it("rejects a bullet over the character cap", () => {
    const longBullet = "Delivered ".repeat(30) + "50% growth.";
    expect(longBullet.length).toBeGreaterThan(ONE_PAGE_BUDGET.bulletMaxChars);
    const content = baseContent({
      experience: [{
        company: "Acme AI", role: "Senior PM", tenure: "2021", location: "",
        bullets: [{ sourceBulletId: "e_1", text: longBullet, priority: 1 }],
      }],
    });
    const result = runFormatGate(content);
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => /character cap/.test(v.reason))).toBe(true);
  });

  it("rejects a role with more bullets than the per-role cap", () => {
    const bullets = Array.from({ length: ONE_PAGE_BUDGET.bulletsPerRoleMax + 1 }, (_, i) => ({
      sourceBulletId: `e_${i}`, text: `Delivered result number ${i}, saving $10M.`, priority: i + 1,
    }));
    const content = baseContent({ experience: [{ company: "Acme AI", role: "Senior PM", tenure: "2021", location: "", bullets }] });
    const result = runFormatGate(content);
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => /per-role cap/.test(v.reason))).toBe(true);
  });

  it("rejects a bullet not ending in terminal punctuation", () => {
    const content = baseContent({
      experience: [{
        company: "Acme AI", role: "Senior PM", tenure: "2021", location: "",
        bullets: [{ sourceBulletId: "e_1", text: "Delivered 40% growth in engagement", priority: 1 }],
      }],
    });
    const result = runFormatGate(content);
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => /terminal punctuation/.test(v.reason))).toBe(true);
  });

  it("rejects a bullet with no identifiable outcome clause", () => {
    const content = baseContent({
      experience: [{
        company: "Acme AI", role: "Senior PM", tenure: "2021", location: "",
        bullets: [{ sourceBulletId: "e_1", text: "Worked on various initiatives across the team.", priority: 1 }],
      }],
    });
    const result = runFormatGate(content);
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => /outcome clause/.test(v.reason))).toBe(true);
  });

  it("does not flag a single-clause bullet whose only clause legitimately ends on its outcome", () => {
    const content = baseContent({
      experience: [{
        company: "Acme AI", role: "Senior PM", tenure: "2021", location: "",
        bullets: [{ sourceBulletId: "e_1", text: "Delivered $10.45B portfolio intelligence cockpit.", priority: 1 }],
      }],
    });
    const result = runFormatGate(content);
    expect(result.violations.some(v => /outcome clause/.test(v.reason))).toBe(false);
  });

  it("collects ALL violations across the whole document, not just the first", () => {
    const content = baseContent({
      summary: "Shipped [bad] stuff",
      experience: [{
        company: "Acme AI", role: "Senior PM", tenure: "2021", location: "",
        bullets: [{ sourceBulletId: "e_1", text: "no punctuation and no outcome at all", priority: 1 }],
      }],
    });
    const result = runFormatGate(content);
    expect(result.violations.length).toBeGreaterThanOrEqual(3); // bracket + missing punctuation + missing outcome
  });
});

describe("formatGateFailureMessage", () => {
  it("renders a loud, itemized, human-readable message naming each violation's location and reason", () => {
    const result = runFormatGate(baseContent({ summary: "Shipped [bad] stuff" }));
    const msg = formatGateFailureMessage(result);
    expect(msg).toContain("FORMAT GATE FAILED");
    expect(msg).toContain("summary");
    expect(msg).toContain("bracket");
  });
});
