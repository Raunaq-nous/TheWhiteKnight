import { describe, it, expect } from "vitest";
import type { Profile } from "../profile";
import { isQuantified, getWeakBulletCandidates } from "../profile-bullet-quality";

describe("isQuantified", () => {
  it("passes a bullet with a plain digit", () => {
    expect(isQuantified("Led a team of 12 engineers")).toBe(true);
  });

  it("passes a bullet with a percentage", () => {
    expect(isQuantified("Improved conversion by 18%")).toBe(true);
  });

  it("passes a bullet with a currency symbol", () => {
    expect(isQuantified("Closed a $10M partnership")).toBe(true);
  });

  it("passes a bullet with a scale keyword even without a digit", () => {
    expect(isQuantified("Grew revenue across the region")).toBe(true);
    expect(isQuantified("Managed headcount for the division")).toBe(true);
  });

  it("flags a generic bullet with no digit, %, currency, or scale keyword", () => {
    expect(isQuantified("Led the India market entry project")).toBe(false);
    expect(isQuantified("Managed the product roadmap")).toBe(false);
    expect(isQuantified("Worked with engineering on launches")).toBe(false);
  });

  it("treats empty text as already-quantified (nothing to ask about)", () => {
    expect(isQuantified("")).toBe(true);
  });
});

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Jordan Lee",
    headline: "",
    email: "jordan@example.com",
    phone: "",
    location: "",
    locationsOpenTo: "",
    yearsOfExperience: "5",
    experience: [],
    education: [],
    skills: {},
    projects: [],
    publications: [],
    certifications: [],
    voiceNotes: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getWeakBulletCandidates", () => {
  it("flags only the unquantified bullets within an experience entry", () => {
    const profile = baseProfile({
      experience: [{
        id: "e1", company: "Acme", role: "Consultant", tenure: "2020-2022", location: "", current: false,
        bullets: "Led the India market entry project\nClosed a $10M partnership deal\nImproved margins by 15%",
      }],
    });
    const candidates = getWeakBulletCandidates(profile);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      targetType: "experience",
      targetId: "Acme",
      currentText: "Led the India market entry project",
    });
  });

  it("returns nothing when every bullet is already quantified", () => {
    const profile = baseProfile({
      experience: [{
        id: "e1", company: "Acme", role: "Consultant", tenure: "2020-2022", location: "", current: false,
        bullets: "Closed a $10M partnership deal\nImproved margins by 15%\nGrew revenue 3x in one year",
      }],
    });
    expect(getWeakBulletCandidates(profile)).toHaveLength(0);
  });

  it("flags unquantified project descriptions", () => {
    const profile = baseProfile({
      projects: [
        { id: "p1", name: "AutoEval", description: "Built an internal evaluation tool", stack: "Python", outcomes: "" },
        { id: "p2", name: "ResumeAI", description: "Used by 1000+ candidates to tailor resumes", stack: "Next.js", outcomes: "" },
      ],
    });
    const candidates = getWeakBulletCandidates(profile);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ targetType: "project", targetId: "AutoEval" });
  });

  it("skips blank project descriptions rather than flagging them", () => {
    const profile = baseProfile({
      projects: [{ id: "p1", name: "Empty", description: "", stack: "", outcomes: "" }],
    });
    expect(getWeakBulletCandidates(profile)).toHaveLength(0);
  });

  it("combines candidates across multiple experience entries and projects", () => {
    const profile = baseProfile({
      experience: [
        { id: "e1", company: "Acme", role: "Eng", tenure: "2020", location: "", current: false, bullets: "Shipped a thing" },
        { id: "e2", company: "OtherCo", role: "Lead", tenure: "2018", location: "", current: false, bullets: "Cut costs by 20%" },
      ],
      projects: [{ id: "p1", name: "Proj", description: "Built a tool", stack: "", outcomes: "" }],
    });
    const candidates = getWeakBulletCandidates(profile);
    expect(candidates).toHaveLength(2); // "Shipped a thing" + "Built a tool"; "Cut costs by 20%" is quantified
    expect(candidates.map(c => c.targetId).sort()).toEqual(["Acme", "Proj"]);
  });
});
