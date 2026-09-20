import { describe, it, expect } from "vitest";
import {
  buildExtraction, EXPERIENCE_CANDIDATES, BULLET_TAGS_BY_COMPANY, DELBOMBLR, applyBulletTags,
} from "../../scripts/import-master-profile";
import { diffExtractionAgainstProfile, applyMergeDiffItem } from "../profile-merge";
import { getSeedProfile } from "../profile";
import { runConfidentialityGate } from "../resume-confidentiality";

describe("import-master-profile — Part 4 career arc data", () => {
  it("has the exact bullet count per employer named in the backlog request", () => {
    const byCompany = Object.fromEntries(EXPERIENCE_CANDIDATES.map(c => [c.company, c.bullets.length]));
    expect(byCompany["Bain and Company"]).toBe(8); // 3 consulting + 5 AI builds
    expect(byCompany["Aranca"]).toBe(17); // 13 consulting + 4 AI builds
    expect(byCompany["Evalueserve"]).toBe(5);
    expect(byCompany["Tecnova India"]).toBe(5);
    expect(byCompany["Madcue"]).toBe(3);
  });

  it("tags exactly the AI-build bullets for Bain and Aranca as ai_build, everything else as consulting_engagement", () => {
    const bainAi = Object.values(BULLET_TAGS_BY_COMPANY["Bain and Company"]).filter(c => c === "ai_build").length;
    const bainConsulting = Object.values(BULLET_TAGS_BY_COMPANY["Bain and Company"]).filter(c => c === "consulting_engagement").length;
    expect(bainAi).toBe(5);
    expect(bainConsulting).toBe(3);

    const arancaAi = Object.values(BULLET_TAGS_BY_COMPANY["Aranca"]).filter(c => c === "ai_build").length;
    const arancaConsulting = Object.values(BULLET_TAGS_BY_COMPANY["Aranca"]).filter(c => c === "consulting_engagement").length;
    expect(arancaAi).toBe(4);
    expect(arancaConsulting).toBe(13);
  });

  it("does not include Delbomblr in the diff/merge candidates — added directly, separately, with no content", () => {
    expect(EXPERIENCE_CANDIDATES.some(c => c.company.includes("Delbomblr"))).toBe(false);
    expect(DELBOMBLR.company).toBe("Delbomblr Inc");
  });

  it("every candidate bullet passes the confidentiality gate (already-safe wording, e.g. no 'nuclear utility' or unrounded dollar figures)", () => {
    for (const entry of EXPERIENCE_CANDIDATES) {
      for (const bullet of entry.bullets) {
        const gate = runConfidentialityGate(bullet);
        expect(gate.ok, `"${bullet}" failed: ${gate.blockedTerms.join(", ")}`).toBe(true);
      }
    }
  });

  it("canonical employer locations match config/profile-rules.json (Aranca is Mumbai, not Bangalore or anywhere else)", () => {
    const byCompany = Object.fromEntries(EXPERIENCE_CANDIDATES.map(c => [c.company, c.location]));
    expect(byCompany["Bain and Company"]).toBe("Gurgaon");
    expect(byCompany["Aranca"]).toBe("Mumbai");
    expect(byCompany["Evalueserve"]).toBe("Gurgaon");
    expect(byCompany["Tecnova India"]).toBe("Gurgaon");
    expect(byCompany["Madcue"]).toBe("Bangalore");
    expect(DELBOMBLR.location).toBe("Delhi");
  });

  it("Part 5/6 candidates include the full 7 publications and both skill categories from the spec", () => {
    const extraction = buildExtraction();
    expect(extraction.publications).toHaveLength(7);
    expect(extraction.skills!.map(s => s.category)).toEqual(["Strategy and Transformation", "AI and Technology"]);
  });
});

describe("import-master-profile — merge behavior (non-destructive, deduped)", () => {
  it("adds all candidate experience as new roles into an empty profile", () => {
    const profile = getSeedProfile();
    const extraction = buildExtraction();
    const diff = diffExtractionAgainstProfile(extraction, profile);
    let merged = profile;
    for (const item of diff) merged = applyMergeDiffItem(merged, item);
    expect(merged.experience).toHaveLength(5); // Bain, Aranca, Evalueserve, Tecnova, Madcue
  });

  it("enriches an existing role with new bullets rather than duplicating or replacing it, when the company already exists", () => {
    const profile = {
      ...getSeedProfile(),
      experience: [{
        id: "existing-1", company: "Bain and Company", role: "Project Leader", tenure: "Jun 2025 - Present",
        location: "Gurgaon", current: true, bullets: "A pre-existing generic bullet that has nothing to do with the import.",
      }],
    };
    const extraction = buildExtraction();
    const diff = diffExtractionAgainstProfile(extraction, profile);
    let merged = profile;
    for (const item of diff) merged = applyMergeDiffItem(merged, item);

    expect(merged.experience).toHaveLength(5); // Bain enriched in place, not duplicated; 4 new roles added
    const bain = merged.experience.find(e => e.company === "Bain and Company")!;
    expect(bain.bullets).toContain("A pre-existing generic bullet that has nothing to do with the import.");
    expect(bain.bullets).toContain("Built the Workflow and Workforce Modernization Studio");
  });

  it("never re-adds a bullet that's already present (idempotent on a second run)", () => {
    const profile = getSeedProfile();
    const extraction = buildExtraction();
    let merged = profile;
    for (const item of diffExtractionAgainstProfile(extraction, merged)) merged = applyMergeDiffItem(merged, item);
    const afterFirstRun = merged;

    const secondDiff = diffExtractionAgainstProfile(extraction, afterFirstRun);
    expect(secondDiff).toEqual([]); // nothing new to merge — everything already present
  });
});

describe("applyBulletTags", () => {
  it("tags only bullets that are actually present in the entry's text — never invents a tag for absent text", () => {
    const profile = {
      ...getSeedProfile(),
      experience: [{
        id: "e1", company: "Bain and Company", role: "Project Leader", tenure: "Jun 2025 - Present",
        location: "Gurgaon", current: true,
        bullets: "Built the Workflow and Workforce Modernization Studio, turning a client's process taxonomy into a full AI transformation blueprint in a single working session, spanning current-state diagnosis, AI-first future-state design, workforce implications, a prioritised roadmap, and an EBITDA value bridge, demonstrated on a documented client session across 118 processes.",
      }],
    };
    const tagged = applyBulletTags(profile);
    const bain = tagged.experience[0];
    expect(Object.keys(bain.bulletTags ?? {})).toHaveLength(1);
    expect(Object.values(bain.bulletTags ?? {})[0]).toBe("ai_build");
  });

  it("is a no-op for a company with no configured tags", () => {
    const profile = {
      ...getSeedProfile(),
      experience: [{ id: "e1", company: "Some Other Firm", role: "Analyst", tenure: "2020", location: "", current: false, bullets: "Did something." }],
    };
    const tagged = applyBulletTags(profile);
    expect(tagged.experience[0].bulletTags).toBeUndefined();
  });
});
