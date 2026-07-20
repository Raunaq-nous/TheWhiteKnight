import { describe, it, expect } from "vitest";
import { injectGapAnswerIntoResume } from "../resume-gap-fill";
import type { ResumeContent } from "../resume-schema";

function baseResumeContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100",
    summary: "",
    sectionOrder: "experience-first",
    experience: [
      {
        company: "Bain & Company",
        role: "Consultant",
        tenure: "2020 - Present",
        location: "",
        bullets: [{ text: "Led capital project reviews", priority: 1 }],
      },
    ],
    education: [],
    skills: [],
    projects: [{ name: "Cost Tracker", description: "Built a capital spend dashboard" }],
    ...overrides,
  };
}

describe("injectGapAnswerIntoResume — experience", () => {
  it("appends the new bullet at priority 1 to the matching experience entry", () => {
    const content = baseResumeContent();
    const { content: next, applied } = injectGapAnswerIntoResume(content, "experience", "Bain & Company", "Delivered $12M in cost savings across 3 capital programs");
    expect(applied).toBe(true);
    expect(next.experience[0].bullets).toHaveLength(2);
    expect(next.experience[0].bullets[1]).toEqual({ text: "Delivered $12M in cost savings across 3 capital programs", priority: 1 });
    // Existing bullet is untouched.
    expect(next.experience[0].bullets[0].text).toBe("Led capital project reviews");
  });

  it("matches fuzzily via namesMatch (e.g. 'Bain' matches 'Bain & Company')", () => {
    const content = baseResumeContent();
    const { applied } = injectGapAnswerIntoResume(content, "experience", "Bain", "New detail");
    expect(applied).toBe(true);
  });

  it("returns applied:false and leaves content unchanged when no experience matches", () => {
    const content = baseResumeContent();
    const { content: next, applied } = injectGapAnswerIntoResume(content, "experience", "Nonexistent Corp", "New detail");
    expect(applied).toBe(false);
    expect(next).toEqual(content);
  });

  it("only injects into the FIRST matching entry, not every entry", () => {
    const content = baseResumeContent({
      experience: [
        { company: "Bain & Company", role: "Consultant", tenure: "2020", location: "", bullets: [{ text: "A", priority: 1 }] },
        { company: "Bain Capital", role: "Analyst", tenure: "2018", location: "", bullets: [{ text: "B", priority: 1 }] },
      ],
    });
    const { content: next } = injectGapAnswerIntoResume(content, "experience", "Bain", "New detail");
    const totalBullets = next.experience.reduce((n, e) => n + e.bullets.length, 0);
    expect(totalBullets).toBe(3); // exactly one bullet added, not two
  });

  it("does not mutate the input content", () => {
    const content = baseResumeContent();
    const snapshot = JSON.stringify(content);
    injectGapAnswerIntoResume(content, "experience", "Bain & Company", "New detail");
    expect(JSON.stringify(content)).toBe(snapshot);
  });
});

describe("injectGapAnswerIntoResume — project", () => {
  it("appends the new detail onto the matching project's description", () => {
    const content = baseResumeContent();
    const { content: next, applied } = injectGapAnswerIntoResume(content, "project", "Cost Tracker", "Tracked $4M in identified savings.");
    expect(applied).toBe(true);
    expect(next.projects![0].description).toBe("Built a capital spend dashboard Tracked $4M in identified savings.");
  });

  it("returns applied:false when no project matches", () => {
    const content = baseResumeContent();
    const { applied } = injectGapAnswerIntoResume(content, "project", "Nonexistent Project", "New detail");
    expect(applied).toBe(false);
  });

  it("handles a resume with no projects at all without throwing", () => {
    const content = baseResumeContent({ projects: undefined });
    expect(() => injectGapAnswerIntoResume(content, "project", "Anything", "New detail")).not.toThrow();
    const { applied } = injectGapAnswerIntoResume(content, "project", "Anything", "New detail");
    expect(applied).toBe(false);
  });
});
