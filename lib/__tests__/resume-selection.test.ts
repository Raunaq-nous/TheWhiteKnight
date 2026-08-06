import { describe, it, expect } from "vitest";
import { resolveBulletText, resolveResumeSelections } from "../resume-selection";
import { bulletId, listProfileBullets, profileBulletIndex } from "../profile-bullets";
import type { Profile } from "../profile";
import type { ResumeContent } from "../resume-schema";

// The exact reported O&G bullet (BUG B) — its outcome clause must survive
// selection + resolution even though the full bullet is well over the
// per-bullet char budget.
const OG_BULLET =
  "Led concept selection study for South American national O&G company: designed AI-augmented evaluation framework across financial, technical, and regulatory dimensions; structured C-suite decision document enabling investment commitment on a previously non-feasible project";

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
        id: "bain-1", company: "Bain & Company", role: "Project Leader", tenure: "Jun 2025 - Present",
        location: "Gurgaon", current: true,
        bullets: `${OG_BULLET}\nManaged a smaller internal workstream with no notable result`,
      },
    ],
    education: [],
    skills: {},
    projects: [{ id: "p1", name: "Cost Tracker", description: "Built a capital spend dashboard for a $10.45B portfolio", stack: "Python", outcomes: "" }],
    publications: [],
    certifications: [],
    voiceNotes: "",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as Profile;
}

function baseRawContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100",
    summary: "A candidate summary the model is allowed to write freely.",
    sectionOrder: "experience-first",
    experience: [],
    education: [],
    skills: [],
    projects: [],
    keyWins: [],
    keyWinIds: [],
    ...overrides,
  } as ResumeContent;
}

describe("resolveBulletText", () => {
  it("returns the exact profile text verbatim when it fits", () => {
    const profile = baseProfile();
    const index = profileBulletIndex(profile);
    const id = bulletId("experience", "Bain & Company", "Managed a smaller internal workstream with no notable result");
    expect(resolveBulletText(id, index, 240)).toBe("Managed a smaller internal workstream with no notable result");
  });

  it("compresses a too-long bullet while preserving its outcome clause (BUG B, real O&G example)", () => {
    const profile = baseProfile();
    const index = profileBulletIndex(profile);
    const id = bulletId("experience", "Bain & Company", OG_BULLET);
    const resolved = resolveBulletText(id, index, 240);
    expect(resolved).not.toBeNull();
    expect(resolved!.length).toBeLessThanOrEqual(240);
    expect(resolved).toContain("enabling investment commitment on a previously non-feasible project");
  });

  it("returns null for an id that doesn't match any real profile bullet — never fabricates", () => {
    const profile = baseProfile();
    const index = profileBulletIndex(profile);
    expect(resolveBulletText("e_totally_made_up", index, 240)).toBeNull();
  });

  it("returns null for a missing/undefined id", () => {
    const profile = baseProfile();
    const index = profileBulletIndex(profile);
    expect(resolveBulletText(undefined, index, 240)).toBeNull();
    expect(resolveBulletText(null, index, 240)).toBeNull();
  });
});

describe("resolveResumeSelections — every rendered bullet maps to a real profile bullet id (test required by BUG B/C architecture change)", () => {
  it("resolves a valid experience selection to the real profile text, tagged with its id", () => {
    const profile = baseProfile();
    const id = bulletId("experience", "Bain & Company", OG_BULLET);
    const raw = baseRawContent({
      experience: [{
        company: "Bain & Company", role: "Project Leader", tenure: "Jun 2025 - Present", location: "Gurgaon",
        bullets: [{ sourceBulletId: id, text: "MODEL SHOULD NOT SEE THIS TEXT USED", priority: 1 }],
      }],
    });
    const resolved = resolveResumeSelections(raw, profile);
    expect(resolved.experience).toHaveLength(1);
    expect(resolved.experience[0].bullets).toHaveLength(1);
    expect(resolved.experience[0].bullets[0].sourceBulletId).toBe(id);
    // The model's own free-typed "text" is discarded — resolution is the
    // only source of truth, so it never appears in the output.
    expect(resolved.experience[0].bullets[0].text).not.toContain("MODEL SHOULD NOT SEE THIS TEXT USED");
    expect(resolved.experience[0].bullets[0].text).toContain("enabling investment commitment on a previously non-feasible project");
  });

  it("drops a bullet whose id does not match any real profile bullet — fabrication is structurally impossible", () => {
    const profile = baseProfile();
    const raw = baseRawContent({
      experience: [{
        company: "Bain & Company", role: "Project Leader", tenure: "Jun 2025 - Present", location: "Gurgaon",
        bullets: [
          { sourceBulletId: "e_invented_by_model", text: "A fabricated claim with a made up $50M number", priority: 1 },
          { sourceBulletId: bulletId("experience", "Bain & Company", "Managed a smaller internal workstream with no notable result"), text: "ignored", priority: 2 },
        ],
      }],
    });
    const resolved = resolveResumeSelections(raw, profile);
    expect(resolved.experience[0].bullets).toHaveLength(1);
    expect(resolved.experience[0].bullets[0].text).not.toContain("$50M");
    expect(resolved.experience[0].bullets[0].text).toBe("Managed a smaller internal workstream with no notable result");
  });

  it("drops an entire experience entry whose every selected id was invalid", () => {
    const profile = baseProfile();
    const raw = baseRawContent({
      experience: [{
        company: "Bain & Company", role: "Project Leader", tenure: "Jun 2025 - Present", location: "Gurgaon",
        bullets: [{ sourceBulletId: "e_nonexistent", text: "made up", priority: 1 }],
      }],
    });
    const resolved = resolveResumeSelections(raw, profile);
    expect(resolved.experience).toHaveLength(0);
  });

  it("resolves a valid project selection, filling name/description/repoUrl from the profile, not the model", () => {
    const profile = baseProfile();
    const id = bulletId("project", "Cost Tracker", "Built a capital spend dashboard for a $10.45B portfolio");
    const raw = baseRawContent({
      projects: [{ sourceBulletId: id, name: "WRONG NAME", description: "WRONG DESCRIPTION", repoUrl: "https://evil.example.com" }],
    });
    const resolved = resolveResumeSelections(raw, profile);
    expect(resolved.projects).toHaveLength(1);
    expect(resolved.projects![0].name).toBe("Cost Tracker");
    expect(resolved.projects![0].description).toContain("$10.45B");
    expect(resolved.projects![0].repoUrl).not.toBe("https://evil.example.com");
  });

  it("drops a project whose sourceBulletId does not resolve to a real project bullet", () => {
    const profile = baseProfile();
    const raw = baseRawContent({
      projects: [{ sourceBulletId: "p_invented", name: "Fake Project", description: "Fabricated.", repoUrl: null }],
    });
    const resolved = resolveResumeSelections(raw, profile);
    expect(resolved.projects).toHaveLength(0);
  });

  it("resolves keyWinIds into parallel, index-aligned keyWins/keyWinIds arrays", () => {
    const profile = baseProfile();
    const id = bulletId("experience", "Bain & Company", OG_BULLET);
    const raw = baseRawContent({ keyWinIds: [id, "e_bad_id"] });
    const resolved = resolveResumeSelections(raw, profile);
    expect(resolved.keyWinIds).toEqual([id]);
    expect(resolved.keyWins).toHaveLength(1);
    expect(resolved.keyWins![0]).toContain("enabling investment commitment on a previously non-feasible project");
  });

  it("an id used in keyWinIds and an id used in experience are independent selections — dedupe against this happens downstream (lib/resume-dedupe.ts), not here", () => {
    const profile = baseProfile();
    const id = bulletId("experience", "Bain & Company", OG_BULLET);
    const raw = baseRawContent({
      keyWinIds: [id],
      experience: [{
        company: "Bain & Company", role: "Project Leader", tenure: "Jun 2025 - Present", location: "Gurgaon",
        bullets: [{ sourceBulletId: id, text: "ignored", priority: 1 }],
      }],
    });
    const resolved = resolveResumeSelections(raw, profile);
    // Resolution itself doesn't dedupe — both resolve successfully; the
    // one-page clamp pipeline (dedupeExperienceAgainstTopBand) is what
    // removes the experience copy once both bands are known together.
    expect(resolved.keyWinIds).toEqual([id]);
    expect(resolved.experience[0].bullets[0].sourceBulletId).toBe(id);
  });

  it("never touches the freely-written summary field", () => {
    const profile = baseProfile();
    const raw = baseRawContent({ summary: "A totally free-form summary sentence." });
    const resolved = resolveResumeSelections(raw, profile);
    expect(resolved.summary).toBe("A totally free-form summary sentence.");
  });
});
