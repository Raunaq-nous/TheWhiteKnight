import { describe, it, expect } from "vitest";
import { replaceBulletInProfile, appendGapAnswerToProfile } from "../profile-enrichment";
import type { Profile } from "../profile";

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Jordan Lee",
    headline: "",
    email: "jordan@example.com",
    phone: "",
    location: "",
    locationsOpenTo: "",
    yearsOfExperience: "7",
    experience: [
      {
        id: "e1", company: "Bain & Company", role: "Consultant", tenure: "2020 - Present",
        location: "", current: true, bullets: "Led capital project reviews",
      },
    ],
    education: [],
    skills: {},
    projects: [{ id: "p1", name: "Cost Tracker", description: "Built a capital spend dashboard", stack: "", outcomes: "" }],
    publications: [],
    certifications: [],
    voiceNotes: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("replaceBulletInProfile", () => {
  it("replaces the exact matching bullet in the matching experience entry", () => {
    const profile = baseProfile();
    const next = replaceBulletInProfile(profile, "experience", "Bain & Company", "Led capital project reviews", "Led capital project reviews, delivering $12M in savings");
    expect(next.experience[0].bullets).toBe("Led capital project reviews, delivering $12M in savings");
  });

  it("appends rather than drops the answer if the original bullet text has drifted", () => {
    const profile = baseProfile();
    const next = replaceBulletInProfile(profile, "experience", "Bain & Company", "A bullet that no longer exists verbatim", "New bullet text");
    expect(next.experience[0].bullets).toContain("Led capital project reviews");
    expect(next.experience[0].bullets).toContain("New bullet text");
  });

  it("does not mutate the input profile", () => {
    const profile = baseProfile();
    const snapshot = JSON.stringify(profile);
    replaceBulletInProfile(profile, "experience", "Bain & Company", "Led capital project reviews", "Changed");
    expect(JSON.stringify(profile)).toBe(snapshot);
  });
});

describe("appendGapAnswerToProfile — the job-time write-back (resume rebuild #5)", () => {
  it("appends a genuinely new bullet to the matching experience entry", () => {
    const profile = baseProfile();
    const result = appendGapAnswerToProfile(profile, "experience", "Bain & Company", "Delivered $12M in cost savings across 3 capital programs");
    expect(result.applied).toBe(true);
    expect(result.summary).toContain("Bain & Company");
    expect(result.profile.experience[0].bullets).toContain("Delivered $12M in cost savings across 3 capital programs");
    expect(result.profile.experience[0].bullets).toContain("Led capital project reviews"); // original preserved
  });

  it("matches fuzzily via namesMatch (e.g. 'Bain' matches 'Bain & Company')", () => {
    const profile = baseProfile();
    const result = appendGapAnswerToProfile(profile, "experience", "Bain", "New detail with a $5M figure");
    expect(result.applied).toBe(true);
  });

  it("dedupes — reuses the SAME similarity rule as the extraction merge engine, never adds a near-duplicate bullet", () => {
    const profile = baseProfile();
    // Near-duplicate phrasing of the existing bullet (>= 0.6 Jaccard word
    // overlap with "Led capital project reviews" — same rule
    // lib/profile-merge.ts's diffExperience() uses).
    const result = appendGapAnswerToProfile(profile, "experience", "Bain & Company", "Led the capital project reviews");
    expect(result.applied).toBe(false);
    expect(result.summary.toLowerCase()).toContain("duplicate");
    expect(result.profile).toEqual(profile); // nothing changed
  });

  it("returns applied:false with a clear summary when no matching experience exists", () => {
    const profile = baseProfile();
    const result = appendGapAnswerToProfile(profile, "experience", "Nonexistent Corp", "Some detail");
    expect(result.applied).toBe(false);
    expect(result.summary).toContain("No matching role");
    expect(result.profile).toEqual(profile);
  });

  it("appends to a matching project's description", () => {
    const profile = baseProfile();
    const result = appendGapAnswerToProfile(profile, "project", "Cost Tracker", "Tracked $4M in identified savings.");
    expect(result.applied).toBe(true);
    expect(result.profile.projects[0].description).toContain("Tracked $4M in identified savings.");
    expect(result.profile.projects[0].description).toContain("Built a capital spend dashboard"); // original preserved
  });

  it("returns applied:false with a clear summary when no matching project exists", () => {
    const profile = baseProfile();
    const result = appendGapAnswerToProfile(profile, "project", "Nonexistent Project", "Some detail");
    expect(result.applied).toBe(false);
    expect(result.summary).toContain("No matching project");
  });

  it("does not mutate the input profile on success", () => {
    const profile = baseProfile();
    const snapshot = JSON.stringify(profile);
    appendGapAnswerToProfile(profile, "experience", "Bain & Company", "A brand new fact with a $9M figure");
    expect(JSON.stringify(profile)).toBe(snapshot);
  });
});
