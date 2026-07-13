import { describe, it, expect } from "vitest";
import { trimLowestPriorityBullet, nextDensity, decideFitAction, estimateWordCount, MIN_DENSITY, MAX_DENSITY } from "../resume-fit";
import type { ResumeContent } from "../resume-schema";

function makeContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100 | Remote",
    summary: "Five years shipping products.",
    sectionOrder: "experience-first",
    experience: [
      {
        company: "Acme",
        role: "PM",
        tenure: "2022 - Present",
        location: "Remote",
        bullets: [
          { text: "Best bullet", priority: 1 },
          { text: "Mid bullet", priority: 2 },
          { text: "Worst bullet", priority: 3 },
        ],
      },
      {
        company: "OtherCo",
        role: "APM",
        tenure: "2020 - 2022",
        location: "Remote",
        bullets: [
          { text: "Only bullet", priority: 1 },
        ],
      },
    ],
    education: [],
    skills: [],
    ...overrides,
  };
}

describe("trimLowestPriorityBullet", () => {
  it("removes the single worst-priority bullet across all entries", () => {
    const content = makeContent();
    const trimmed = trimLowestPriorityBullet(content);
    expect(trimmed).not.toBeNull();
    expect(trimmed!.experience[0].bullets).toHaveLength(2);
    expect(trimmed!.experience[0].bullets.map(b => b.text)).not.toContain("Worst bullet");
    expect(trimmed!.experience[1].bullets).toHaveLength(1); // untouched
  });

  it("never removes an entry's last remaining bullet", () => {
    const content = makeContent({
      experience: [
        { company: "SoloCo", role: "IC", tenure: "2023", location: "", bullets: [{ text: "Only one", priority: 5 }] },
      ],
    });
    const trimmed = trimLowestPriorityBullet(content);
    expect(trimmed).toBeNull();
  });

  it("trims repeatedly in priority order until only protected bullets remain", () => {
    let content = makeContent();
    const trimmedOnce = trimLowestPriorityBullet(content)!;
    expect(trimmedOnce.experience[0].bullets.map(b => b.priority)).toEqual([1, 2]);
    const trimmedTwice = trimLowestPriorityBullet(trimmedOnce)!;
    // Only "Best bullet" (priority 1) and the untouched single-bullet entry remain trimmable-safe.
    expect(trimmedTwice.experience[0].bullets.map(b => b.priority)).toEqual([1]);
    // Nothing further to trim — entry 0 now has 1 bullet, entry 1 already has 1.
    expect(trimLowestPriorityBullet(trimmedTwice)).toBeNull();
  });
});

describe("nextDensity", () => {
  it("steps up and caps at MAX_DENSITY", () => {
    let d = MIN_DENSITY;
    let steps = 0;
    while (true) {
      const next = nextDensity(d);
      if (next === null) break;
      expect(next).toBeGreaterThan(d);
      d = next;
      steps++;
      expect(steps).toBeLessThan(20); // sanity bound against infinite loop
    }
    expect(d).toBeLessThanOrEqual(MAX_DENSITY);
  });
});

describe("decideFitAction", () => {
  it("trims when overflowing and a bullet is available", () => {
    const content = makeContent();
    const action = decideFitAction(content, 1.15, MIN_DENSITY);
    expect(action.kind).toBe("trim");
  });

  it("expands density when meaningfully underflowing", () => {
    const content = makeContent();
    const action = decideFitAction(content, 0.7, MIN_DENSITY);
    expect(action.kind).toBe("expand");
    if (action.kind === "expand") expect(action.density).toBeGreaterThan(MIN_DENSITY);
  });

  it("is done when close enough to a full page", () => {
    const content = makeContent();
    const action = decideFitAction(content, 0.97, MIN_DENSITY);
    expect(action.kind).toBe("done");
  });

  it("is done (not stuck) when overflowing but nothing left to trim", () => {
    const content = makeContent({
      experience: [{ company: "SoloCo", role: "IC", tenure: "2023", location: "", bullets: [{ text: "Only one", priority: 1 }] }],
    });
    const action = decideFitAction(content, 1.5, MIN_DENSITY);
    expect(action.kind).toBe("done");
  });
});

describe("estimateWordCount", () => {
  it("counts words across summary and all bullets", () => {
    const content = makeContent();
    // "Five years shipping products." = 4 words
    // "Best bullet" + "Mid bullet" + "Worst bullet" = 6 words
    // "Only bullet" = 2 words
    expect(estimateWordCount(content)).toBe(4 + 6 + 2);
  });
});
