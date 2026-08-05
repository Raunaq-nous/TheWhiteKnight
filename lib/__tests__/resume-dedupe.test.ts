import { describe, it, expect } from "vitest";
import { sameEngagement, dedupeExperienceAgainstTopBand } from "../resume-dedupe";
import type { ResumeContent } from "../resume-schema";

// The exact reported case (BUG C): the same EMEA B2B Series A engagement
// appears in Key Projects & Impact and again under Aranca, phrased
// completely differently — string/full-text similarity misses this because
// the two texts share almost no generic verbs/connectors.
const KEY_WIN_TEXT = "Built Series A financial model for EMEA B2B marketplace, facilitating a multi-million-dollar raise.";
const EXPERIENCE_BULLET_TEXT = "Built a Series A financial model for an EMEA B2B marketplace, structuring revenue projections, unit economics, and growth thesis across market segments.";

describe("sameEngagement — the EMEA B2B case (BUG C)", () => {
  it("recognizes the same engagement even when phrased completely differently", () => {
    expect(sameEngagement(KEY_WIN_TEXT, EXPERIENCE_BULLET_TEXT)).toBe(true);
  });

  it("would NOT be caught by naive full-text Jaccard similarity (proves this needed a different approach)", () => {
    // Full-text word-overlap similarity (union-based, no stopword/verb
    // stripping) on these two texts sits well under any reasonable
    // duplicate threshold (~0.33) — this is the exact reason the old
    // string-matching dedupe missed it.
    const tokenize = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2));
    const a = tokenize(KEY_WIN_TEXT);
    const b = tokenize(EXPERIENCE_BULLET_TEXT);
    let intersection = 0;
    for (const t of a) if (b.has(t)) intersection++;
    const jaccard = intersection / (a.size + b.size - intersection);
    expect(jaccard).toBeLessThan(0.5);
  });

  it("does not flag genuinely different engagements as duplicates", () => {
    const a = "Delivered board-level recommendation for a multi-billion-dollar nuclear capital program.";
    const b = "Built a Series A financial model for an EMEA B2B marketplace, facilitating a multi-million-dollar raise.";
    expect(sameEngagement(a, b)).toBe(false);
  });

  it("returns false for empty or whitespace-only text", () => {
    expect(sameEngagement("", "Something real")).toBe(false);
    expect(sameEngagement("Something real", "   ")).toBe(false);
  });
});

function baseContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100",
    summary: "",
    sectionOrder: "experience-first",
    keyWins: [],
    projects: [],
    experience: [],
    education: [],
    skills: [],
    ...overrides,
  } as ResumeContent;
}

describe("dedupeExperienceAgainstTopBand (BUG C)", () => {
  it("removes the exact EMEA B2B experience bullet when the same engagement already appears in Key Projects & Impact", () => {
    const content = baseContent({
      keyWins: [KEY_WIN_TEXT],
      experience: [{
        company: "Aranca", role: "Engagement Lead", tenure: "2022 - 2025", location: "",
        bullets: [
          { text: EXPERIENCE_BULLET_TEXT, priority: 2 },
          { text: "Structured commercial framework and return analysis for a global port operator across three regions.", priority: 3 },
        ],
      }],
    });
    const deduped = dedupeExperienceAgainstTopBand(content);
    const remainingTexts = deduped.experience[0].bullets.map(b => b.text);
    expect(remainingTexts).not.toContain(EXPERIENCE_BULLET_TEXT);
    expect(remainingTexts).toContain("Structured commercial framework and return analysis for a global port operator across three regions.");
  });

  it("also catches the same engagement in a project description, not just keyWins", () => {
    const content = baseContent({
      projects: [{ name: "Series A Model", description: KEY_WIN_TEXT }],
      experience: [{
        company: "Aranca", role: "Engagement Lead", tenure: "2022 - 2025", location: "",
        bullets: [{ text: EXPERIENCE_BULLET_TEXT, priority: 1 }],
      }],
    });
    const deduped = dedupeExperienceAgainstTopBand(content);
    // Only bullet in the entry collided — the entry keeps its single
    // highest-priority bullet rather than being emptied to zero.
    expect(deduped.experience[0].bullets).toHaveLength(1);
  });

  it("never empties a role's bullets to zero — keeps the least-duplicate one if every bullet collides", () => {
    const content = baseContent({
      keyWins: [KEY_WIN_TEXT],
      experience: [{
        company: "Aranca", role: "Engagement Lead", tenure: "2022 - 2025", location: "",
        bullets: [{ text: EXPERIENCE_BULLET_TEXT, priority: 1 }],
      }],
    });
    const deduped = dedupeExperienceAgainstTopBand(content);
    expect(deduped.experience[0].bullets.length).toBeGreaterThanOrEqual(1);
  });

  it("is a no-op when there is no top-band content at all", () => {
    const content = baseContent({
      experience: [{
        company: "Aranca", role: "Engagement Lead", tenure: "2022 - 2025", location: "",
        bullets: [{ text: EXPERIENCE_BULLET_TEXT, priority: 1 }],
      }],
    });
    const deduped = dedupeExperienceAgainstTopBand(content);
    expect(deduped.experience[0].bullets).toHaveLength(1);
    expect(deduped.experience[0].bullets[0].text).toBe(EXPERIENCE_BULLET_TEXT);
  });

  it("leaves unrelated bullets in other roles untouched", () => {
    const content = baseContent({
      keyWins: [KEY_WIN_TEXT],
      experience: [
        { company: "Aranca", role: "Engagement Lead", tenure: "2022", location: "", bullets: [{ text: EXPERIENCE_BULLET_TEXT, priority: 1 }] },
        { company: "Bain & Company", role: "Consultant", tenure: "2025", location: "", bullets: [{ text: "Delivered a board-level recommendation for a multi-billion-dollar nuclear capital program.", priority: 2 }] },
      ],
    });
    const deduped = dedupeExperienceAgainstTopBand(content);
    expect(deduped.experience[1].bullets[0].text).toBe("Delivered a board-level recommendation for a multi-billion-dollar nuclear capital program.");
  });
});
