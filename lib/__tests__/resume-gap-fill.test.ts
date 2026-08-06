import { describe, it, expect } from "vitest";
import { injectGapAnswerIntoResume } from "../resume-gap-fill";
import { appendGapAnswerToProfile } from "../profile-enrichment";
import { resumePrompt } from "../prompts";
import { bulletId } from "../profile-bullets";
import type { ResumeContent } from "../resume-schema";
import type { Profile } from "../profile";
import type { Application } from "../store";

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
    expect(next.experience[0].bullets[1]).toEqual({
      sourceBulletId: bulletId("experience", "Bain & Company", "Delivered $12M in cost savings across 3 capital programs"),
      text: "Delivered $12M in cost savings across 3 capital programs",
      priority: 1,
    });
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

describe("end-to-end gap-fill answer persistence (BUG 2 regression)", () => {
  // Exercises the SAME two writes ResumeGapFillBox.submitAnswer performs for
  // one answer: (c) inject into the in-progress resume, (d) write back to the
  // canonical profile. The actual reported bug was that step (c)'s downstream
  // server persistence (persistResumeContent -> updateApplication) was
  // fire-and-forget in app/application/page.tsx — not unit-testable here since
  // this repo's vitest config runs node-only (no jsdom/RTL for that component),
  // but the data-layer contract both writes must agree on IS testable here.
  function profileWithBainBullet(): Profile {
    return {
      name: "Jordan Lee", headline: "", email: "jordan@example.com", phone: "",
      location: "", locationsOpenTo: "", yearsOfExperience: "7",
      experience: [{
        id: "e1", company: "Bain & Company", role: "Consultant", tenure: "2020 - Present",
        location: "", current: true, bullets: "Led capital project reviews",
      }],
      education: [], skills: {}, projects: [], publications: [], certifications: [],
      voiceNotes: "", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
    } as Profile;
  }

  it("the same new bullet text lands in BOTH the in-progress resume and the canonical profile", () => {
    const resumeContent = baseResumeContent();
    const profile = profileWithBainBullet();
    const newBulletText = "Delivered $12M in cost savings across 3 capital programs";

    const { content: nextResume, applied: appliedToResume } = injectGapAnswerIntoResume(
      resumeContent, "experience", "Bain & Company", newBulletText,
    );
    const { profile: nextProfile, applied: appliedToProfile } = appendGapAnswerToProfile(
      profile, "experience", "Bain & Company", newBulletText,
    );

    expect(appliedToResume).toBe(true);
    expect(appliedToProfile).toBe(true);
    expect(nextResume.experience[0].bullets.map(b => b.text)).toContain(newBulletText);
    expect(nextProfile.experience[0].bullets).toContain(newBulletText);
    // Original content survives in both places — this is additive, not destructive.
    expect(nextResume.experience[0].bullets.map(b => b.text)).toContain("Led capital project reviews");
    expect(nextProfile.experience[0].bullets).toContain("Led capital project reviews");
  });

  it("a persisted Q&A answer reaches subsequent resume generation (the profile write-back is what generation reads from)", () => {
    const profile = profileWithBainBullet();
    const newBulletText = "Delivered $12M in cost savings across 3 capital programs";

    const { profile: nextProfile, applied } = appendGapAnswerToProfile(
      profile, "experience", "Bain & Company", newBulletText,
    );
    expect(applied).toBe(true);

    const app: Application = {
      id: "app1", slug: "bain-capital-excellence", company: "McKinsey", role: "Capital Excellence Consultant",
      location: "New York, NY", remote: false, status: "sourced", score: 0, bucket: "strategy",
      bucketName: "Strategy / Consulting", sector: "consulting", seniority: "senior", sourceUrl: "",
      capturedAt: "2025-01-01T00:00:00.000Z", jdRaw: "",
      jdParsed: {
        keyRequirements: ["capital project delivery", "cost and schedule optimization"],
        technicalSkills: [], softSkills: [], yearsExperienceRequired: null, redFlags: [],
        keywords: ["capital", "cost", "savings"],
      },
      nextAction: "", contacts: [], interviews: [], reminders: [], resumeVersions: [], notes: "",
      emailEvents: [], createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
    } as Application;

    // Generation reads the canonical profile — never the in-progress resume state —
    // so the write-back from appendGapAnswerToProfile is what makes the answer
    // available to every future resume generated for this or any other job.
    const prompt = resumePrompt(nextProfile, app, "consulting");
    expect(prompt).toContain(newBulletText);
  });
});
