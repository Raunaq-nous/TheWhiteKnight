import { describe, it, expect } from "vitest";
import { bulletId, listProfileBullets, profileBulletIndex, renderAvailableBulletsBlock } from "../profile-bullets";
import type { Profile } from "../profile";

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Jordan Lee",
    headline: "",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    locationsOpenTo: "",
    yearsOfExperience: "5+",
    experience: [
      {
        id: "bain-1",
        company: "Bain & Company",
        role: "Consultant",
        tenure: "2020 - Present",
        location: "Gurgaon",
        current: true,
        bullets: "Led capital project reviews\nDelivered a board-level recommendation for a multi-billion-dollar program",
      },
    ],
    education: [],
    skills: {},
    projects: [
      { id: "p1", name: "Cost Tracker", description: "Built a capital spend dashboard", stack: "Python", outcomes: "" },
    ],
    publications: [],
    certifications: [],
    voiceNotes: "",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as Profile;
}

describe("bulletId", () => {
  it("is stable across repeated calls for the same source+text", () => {
    const a = bulletId("experience", "Bain & Company", "Led capital project reviews");
    const b = bulletId("experience", "Bain & Company", "Led capital project reviews");
    expect(a).toBe(b);
  });

  it("changes when the text changes — an edited bullet is a new bullet", () => {
    const a = bulletId("experience", "Bain & Company", "Led capital project reviews");
    const b = bulletId("experience", "Bain & Company", "Led capital project reviews for O&G clients");
    expect(a).not.toBe(b);
  });

  it("changes when the source (company/project) changes, even for identical text", () => {
    const a = bulletId("experience", "Bain & Company", "Delivered results");
    const b = bulletId("experience", "Aranca", "Delivered results");
    expect(a).not.toBe(b);
  });

  it("distinguishes experience from project bullets even with the same source id and text", () => {
    const a = bulletId("experience", "Acme", "Shipped the thing");
    const b = bulletId("project", "Acme", "Shipped the thing");
    expect(a).not.toBe(b);
  });

  it("is insensitive to leading/trailing whitespace and case in the source id", () => {
    const a = bulletId("experience", "Bain & Company", "Delivered results");
    const b = bulletId("experience", "  bain & company  ", "Delivered results");
    expect(a).toBe(b);
  });
});

describe("listProfileBullets", () => {
  it("lists one entry per experience bullet line and one per project description", () => {
    const bullets = listProfileBullets(baseProfile());
    expect(bullets).toHaveLength(3); // 2 experience bullets + 1 project
    expect(bullets.filter(b => b.sourceType === "experience")).toHaveLength(2);
    expect(bullets.filter(b => b.sourceType === "project")).toHaveLength(1);
  });

  it("excludes entries flagged excludeFromResume entirely", () => {
    const profile = baseProfile({
      experience: [
        {
          id: "hidden", company: "Hidden Co", role: "Analyst", tenure: "2019", location: "", current: false,
          bullets: "This should never be selectable", excludeFromResume: true,
        },
      ],
    });
    const bullets = listProfileBullets(profile);
    expect(bullets.find(b => b.text.includes("This should never be selectable"))).toBeUndefined();
  });

  it("skips blank bullet lines and empty project descriptions", () => {
    const profile = baseProfile({
      experience: [
        { id: "e1", company: "Acme", role: "PM", tenure: "2021", location: "", current: true, bullets: "Real bullet\n\n   \nAnother real bullet" },
      ],
      projects: [{ id: "p1", name: "Empty", description: "   ", stack: "", outcomes: "" }],
    });
    const bullets = listProfileBullets(profile);
    expect(bullets.filter(b => b.sourceType === "experience")).toHaveLength(2);
    expect(bullets.filter(b => b.sourceType === "project")).toHaveLength(0);
  });

  it("every listed bullet's id round-trips through profileBulletIndex", () => {
    const profile = baseProfile();
    const bullets = listProfileBullets(profile);
    const index = profileBulletIndex(profile);
    for (const b of bullets) {
      expect(index.get(b.id)).toEqual(b);
    }
  });
});

describe("renderAvailableBulletsBlock", () => {
  it("includes every bullet's id and text, grouped under its source label", () => {
    const block = renderAvailableBulletsBlock(baseProfile());
    expect(block).toContain("Bain & Company — Consultant:");
    expect(block).toContain("Led capital project reviews");
    expect(block).toContain("Cost Tracker:");
    expect(block).toContain("Built a capital spend dashboard");
    // Every real bullet's actual id must appear, bracketed, in the block.
    for (const b of listProfileBullets(baseProfile())) {
      expect(block).toContain(`[${b.id}]`);
    }
  });

  it("returns an empty string for a profile with no selectable bullets", () => {
    const profile = baseProfile({ experience: [], projects: [] });
    expect(renderAvailableBulletsBlock(profile)).toBe("");
  });
});
