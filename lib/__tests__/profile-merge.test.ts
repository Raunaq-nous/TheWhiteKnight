import { describe, it, expect } from "vitest";
import type { Profile } from "../profile";
import {
  diffExtractionAgainstProfile,
  applyMergeDiffItem,
  namesMatch,
  normalizeName,
  ExtractedProfileData,
} from "../profile-merge";

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

describe("normalizeName / namesMatch", () => {
  it("strips corporate suffixes and punctuation", () => {
    expect(normalizeName("Bain & Company")).toBe("bain company");
    expect(normalizeName("Acme Inc.")).toBe("acme");
  });

  it("matches exact, substring-contains, and suffix variants", () => {
    expect(namesMatch("Bain", "Bain & Company")).toBe(true);
    expect(namesMatch("Acme Inc.", "Acme")).toBe(true);
    expect(namesMatch("MIT", "Stanford")).toBe(false);
  });

  it("does not match empty strings", () => {
    expect(namesMatch("", "Acme")).toBe(false);
    expect(namesMatch("Acme", "")).toBe(false);
  });
});

describe("diffExtractionAgainstProfile — experience", () => {
  it("proposes 'add' for a company not on the profile", () => {
    const profile = baseProfile();
    const extracted: ExtractedProfileData = {
      experience: [{ company: "Acme Corp", role: "Engineer", tenure: "2020-2022", bullets: ["Shipped the thing"] }],
    };
    const diff = diffExtractionAgainstProfile(extracted, profile);
    expect(diff).toHaveLength(1);
    expect(diff[0].entityType).toBe("experience");
    expect(diff[0].action).toBe("add");
  });

  it("proposes 'enrich' with only the genuinely new bullets for a matched company", () => {
    const profile = baseProfile({
      experience: [{
        id: "e1", company: "Bain & Company", role: "Consultant", tenure: "2020-2022",
        location: "", current: false, bullets: "Led the India market entry project",
      }],
    });
    const extracted: ExtractedProfileData = {
      experience: [{
        company: "Bain",
        role: "Consultant",
        tenure: "2020-2022",
        bullets: [
          "Led the India market entry project", // near-duplicate — should be filtered out
          "Closed a $10M partnership deal", // genuinely new
        ],
      }],
    };
    const diff = diffExtractionAgainstProfile(extracted, profile);
    expect(diff).toHaveLength(1);
    expect(diff[0].action).toBe("enrich");
    expect(diff[0].preview).toContain("$10M partnership deal");
    expect(diff[0].preview).not.toContain("India market entry");
  });

  it("silently drops entries with nothing new to add (no diff item, not an error)", () => {
    const profile = baseProfile({
      experience: [{
        id: "e1", company: "Acme", role: "Engineer", tenure: "2020-2022",
        location: "", current: false, bullets: "Shipped the thing",
      }],
    });
    const extracted: ExtractedProfileData = {
      experience: [{ company: "Acme", role: "Engineer", tenure: "2020-2022", bullets: ["Shipped the thing"] }],
    };
    const diff = diffExtractionAgainstProfile(extracted, profile);
    expect(diff).toHaveLength(0);
  });

  it("tolerates null fields on candidates (schema allows null, not just undefined)", () => {
    const profile = baseProfile();
    const extracted: ExtractedProfileData = {
      experience: [{ company: "Acme", role: "Engineer", tenure: "2022", location: null, bullets: ["Did a thing"] }],
    };
    expect(() => diffExtractionAgainstProfile(extracted, profile)).not.toThrow();
  });
});

describe("diffExtractionAgainstProfile — education/projects/publications/certifications/skills", () => {
  it("proposes 'add' for a new education entry, 'enrich' for a new GPA on an existing one", () => {
    const profile = baseProfile({
      education: [{ id: "ed1", institution: "State University", degree: "B.S.", field: "CS", years: "2014-2018" }],
    });
    const extracted: ExtractedProfileData = {
      education: [
        { institution: "State University", degree: "B.S.", years: "2014-2018", gpa: "3.8" },
        { institution: "Other College", degree: "M.S.", years: "2018-2020" },
      ],
    };
    const diff = diffExtractionAgainstProfile(extracted, profile);
    expect(diff).toHaveLength(2);
    const enrich = diff.find(d => d.action === "enrich")!;
    expect(enrich.targetLabel).toBe("State University");
    expect(enrich.preview).toContain("3.8");
    const add = diff.find(d => d.action === "add")!;
    expect(add.summary).toContain("Other College");
  });

  it("skips publications that already exist (immutable facts, no enrich)", () => {
    const profile = baseProfile({
      publications: [{ id: "p1", title: "A Paper About Things", publication: "IEEE", year: "2016" }],
    });
    const extracted: ExtractedProfileData = {
      publications: [
        { title: "A Paper About Things", publication: "IEEE", year: "2016" },
        { title: "A New Paper", publication: "ACM", year: "2020" },
      ],
    };
    const diff = diffExtractionAgainstProfile(extracted, profile);
    expect(diff).toHaveLength(1);
    expect(diff[0].summary).toContain("A New Paper");
  });

  it("dedupes skill items case-insensitively within a matched category", () => {
    const profile = baseProfile({ skills: { Technical: "Python, SQL" } });
    const extracted: ExtractedProfileData = {
      skills: [{ category: "Technical", items: ["python", "React"] }],
    };
    const diff = diffExtractionAgainstProfile(extracted, profile);
    expect(diff).toHaveLength(1);
    expect(diff[0].preview).toBe("React"); // "python" filtered as a dupe of existing "Python"
  });

  it("proposes a new skill category when nothing matches", () => {
    const profile = baseProfile({ skills: { Technical: "Python" } });
    const extracted: ExtractedProfileData = {
      skills: [{ category: "Leadership", items: ["Team management"] }],
    };
    const diff = diffExtractionAgainstProfile(extracted, profile);
    expect(diff).toHaveLength(1);
    expect(diff[0].action).toBe("add");
  });
});

describe("applyMergeDiffItem — non-destructive merge", () => {
  it("adding a new experience entry does not touch existing entries", () => {
    const profile = baseProfile({
      experience: [{ id: "e1", company: "Acme", role: "Eng", tenure: "2020", location: "", current: false, bullets: "Did a thing" }],
    });
    const diff = diffExtractionAgainstProfile(
      { experience: [{ company: "OtherCo", role: "Lead", tenure: "2022", bullets: ["New bullet"] }] },
      profile,
    );
    const next = applyMergeDiffItem(profile, diff[0]);
    expect(next.experience).toHaveLength(2);
    expect(next.experience[0]).toEqual(profile.experience[0]); // untouched
    expect(next.experience[1].company).toBe("OtherCo");
  });

  it("enriching an experience entry appends bullets without dropping existing ones", () => {
    const profile = baseProfile({
      experience: [{ id: "e1", company: "Acme", role: "Eng", tenure: "2020", location: "", current: false, bullets: "Bullet one" }],
    });
    const diff = diffExtractionAgainstProfile(
      { experience: [{ company: "Acme", role: "Eng", tenure: "2020", bullets: ["Bullet one", "Bullet two"] }] },
      profile,
    );
    const next = applyMergeDiffItem(profile, diff[0]);
    expect(next.experience[0].bullets).toBe("Bullet one\nBullet two");
  });

  it("filling a blank gpa never overwrites an already-set gpa", () => {
    const profile = baseProfile({
      education: [{ id: "ed1", institution: "State University", degree: "B.S.", field: "CS", years: "2014-2018", gpa: "3.5" }],
    });
    // Candidate proposes a different GPA — since the profile already has one, no diff item should be produced.
    const diff = diffExtractionAgainstProfile(
      { education: [{ institution: "State University", degree: "B.S.", years: "2014-2018", gpa: "4.0" }] },
      profile,
    );
    expect(diff).toHaveLength(0);
    // profile itself is never mutated by diffing.
    expect(profile.education[0].gpa).toBe("3.5");
  });

  it("adding a skill category never removes existing categories", () => {
    const profile = baseProfile({ skills: { Technical: "Python" } });
    const diff = diffExtractionAgainstProfile({ skills: [{ category: "Leadership", items: ["Coaching"] }] }, profile);
    const next = applyMergeDiffItem(profile, diff[0]);
    expect(next.skills.Technical).toBe("Python");
    expect(next.skills.Leadership).toBe("Coaching");
  });

  it("apply is pure — never mutates the input profile", () => {
    const profile = baseProfile({
      experience: [{ id: "e1", company: "Acme", role: "Eng", tenure: "2020", location: "", current: false, bullets: "Bullet one" }],
    });
    const snapshot = JSON.stringify(profile);
    const diff = diffExtractionAgainstProfile(
      { experience: [{ company: "Acme", role: "Eng", tenure: "2020", bullets: ["Bullet one", "Bullet two"] }] },
      profile,
    );
    applyMergeDiffItem(profile, diff[0]);
    expect(JSON.stringify(profile)).toBe(snapshot);
  });
});
