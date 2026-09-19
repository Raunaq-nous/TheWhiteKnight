import { describe, it, expect } from "vitest";
import { findDriftedBullets, replacementCandidates } from "../resume-bullet-drift";
import { bulletId } from "../profile-bullets";
import type { Profile } from "../profile";
import type { ResumeContent } from "../resume-schema";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Jordan Lee", headline: "", email: "j@example.com", phone: "", location: "", locationsOpenTo: "",
    yearsOfExperience: "5",
    experience: [{
      id: "e1", company: "Acme", role: "PM", tenure: "2020-Present", location: "Remote", current: true,
      bullets: "Shipped a new onboarding flow, cutting churn by 12%.\nLed a cross-functional launch.",
    }],
    education: [], skills: {}, projects: [], publications: [], certifications: [],
    voiceNotes: "", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  } as Profile;
}

const CURRENT_TEXT = "Shipped a new onboarding flow, cutting churn by 12%.";
const CURRENT_ID = bulletId("experience", "Acme", CURRENT_TEXT);

function baseContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Jordan Lee", contactLine: "j@example.com", summary: "", sectionOrder: "experience-first",
    experience: [{
      company: "Acme", role: "PM", tenure: "2020-Present", location: "",
      bullets: [{ sourceBulletId: CURRENT_ID, text: CURRENT_TEXT, priority: 1 }],
    }],
    education: [], skills: [], projects: [], keyWins: [], keyWinIds: [],
    ...overrides,
  } as ResumeContent;
}

describe("findDriftedBullets", () => {
  it("finds nothing drifted when every sourceBulletId still resolves against the current profile", () => {
    expect(findDriftedBullets(baseContent(), profile())).toEqual([]);
  });

  it("flags an experience bullet whose id no longer resolves (the profile bullet was edited)", () => {
    const staleId = bulletId("experience", "Acme", "An old, since-edited bullet.");
    const content = baseContent({
      experience: [{
        company: "Acme", role: "PM", tenure: "2020-Present", location: "",
        bullets: [{ sourceBulletId: staleId, text: "An old, since-edited bullet.", priority: 1 }],
      }],
    });
    const drifted = findDriftedBullets(content, profile());
    expect(drifted).toHaveLength(1);
    expect(drifted[0]).toMatchObject({ location: "experience", sourceBulletId: staleId, text: "An old, since-edited bullet.", company: "Acme" });
  });

  it("flags a drifted project", () => {
    const staleId = bulletId("project", "OldProj", "A project description that changed since.");
    const content = baseContent({
      projects: [{ sourceBulletId: staleId, name: "OldProj", description: "A project description that changed since." }],
    });
    const drifted = findDriftedBullets(content, profile());
    expect(drifted).toEqual([{ location: "project", sourceBulletId: staleId, text: "A project description that changed since." }]);
  });

  it("flags a drifted key win, aligned to its index in keyWins/keyWinIds", () => {
    const staleId = bulletId("experience", "Acme", "A stale key win.");
    const content = baseContent({ keyWins: ["A stale key win."], keyWinIds: [staleId] });
    const drifted = findDriftedBullets(content, profile());
    expect(drifted).toEqual([{ location: "keyWin", sourceBulletId: staleId, text: "A stale key win." }]);
  });

  it("never mutates the input content", () => {
    const staleId = bulletId("experience", "Acme", "Stale.");
    const content = baseContent({
      experience: [{ company: "Acme", role: "PM", tenure: "2020-Present", location: "", bullets: [{ sourceBulletId: staleId, text: "Stale.", priority: 1 }] }],
    });
    const snapshot = JSON.stringify(content);
    findDriftedBullets(content, profile());
    expect(JSON.stringify(content)).toBe(snapshot);
  });

  it("collects every drifted item, not just the first", () => {
    const staleExp = bulletId("experience", "Acme", "Stale exp.");
    const staleProj = bulletId("project", "P", "Stale proj.");
    const staleWin = bulletId("experience", "Acme", "Stale win.");
    const content = baseContent({
      experience: [{ company: "Acme", role: "PM", tenure: "2020-Present", location: "", bullets: [{ sourceBulletId: staleExp, text: "Stale exp.", priority: 1 }] }],
      projects: [{ sourceBulletId: staleProj, name: "P", description: "Stale proj." }],
      keyWins: ["Stale win."], keyWinIds: [staleWin],
    });
    expect(findDriftedBullets(content, profile())).toHaveLength(3);
  });
});

describe("replacementCandidates", () => {
  it("offers only current profile bullets from the SAME employer", () => {
    const p = profile({
      experience: [
        { id: "e1", company: "Acme", role: "PM", tenure: "2020-Present", location: "", current: true, bullets: "Bullet A.\nBullet B." },
        { id: "e2", company: "Globex", role: "PM", tenure: "2018-2020", location: "", current: false, bullets: "Unrelated bullet." },
      ],
    });
    const candidates = replacementCandidates(p, "Acme");
    expect(candidates).toHaveLength(2);
    expect(candidates.every(c => c.sourceLabel.startsWith("Acme —"))).toBe(true);
  });

  it("returns an empty list when the employer no longer has any bullets", () => {
    expect(replacementCandidates(profile({ experience: [] }), "Acme")).toEqual([]);
  });
});
