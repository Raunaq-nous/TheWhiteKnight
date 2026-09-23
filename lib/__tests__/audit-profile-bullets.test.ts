import { describe, it, expect } from "vitest";
import { auditProfile, duplicateEmployerEntries, removeBullets, sameEmployer } from "../../scripts/audit-profile-bullets";
import { EXPERIENCE_CANDIDATES } from "../../scripts/import-master-profile";
import { bulletId } from "../profile-bullets";
import { getSeedProfile } from "../profile";
import type { Profile } from "../profile";

const LEGACY_AI_PLATFORM =
  "Built and shipped integrated agentic AI platform: RAG-based document intelligence engine for contract and regulatory libraries, multi-agent automated workplan generator, AI financial and cost modeling engine.";
const LEGACY_OG =
  "Led concept selection study for national O&G company in South America: designed AI-augmented evaluation framework across financial, technical, and regulatory criteria, structured C-suite decision document enabling investment commitment on a previously non-feasible project";
const importedBain = EXPERIENCE_CANDIDATES.find(c => c.company === "Bain and Company")!.bullets;

function mixedProfile(): Profile {
  return {
    ...getSeedProfile(),
    experience: [
      { id: "b1", company: "Bain & Company", role: "Consultant", tenure: "2025 - Present", location: "", current: true, bullets: [LEGACY_AI_PLATFORM, LEGACY_OG].join("\n") },
      { id: "b2", company: "Bain and Company", role: "Project Leader", tenure: "Jun 2025 - Present", location: "", current: false, bullets: importedBain.join("\n") },
    ],
  };
}

describe("audit-profile-bullets", () => {
  it("treats '&' and 'and' as the same employer", () => {
    expect(sameEmployer("Bain & Company", "Bain and Company")).toBe(true);
    expect(sameEmployer("Bain & Company", "Aranca")).toBe(false);
  });

  it("detects the same employer stored as two separate entries", () => {
    expect(duplicateEmployerEntries(mixedProfile())).toEqual([["Bain & Company", "Bain and Company"]]);
  });

  it("classifies imported vs legacy bullets by exact master-spec text", () => {
    const rows = auditProfile(mixedProfile());
    expect(rows.filter(r => r.origin === "imported")).toHaveLength(importedBain.length);
    expect(rows.filter(r => r.origin === "legacy").map(r => r.text)).toEqual([LEGACY_AI_PLATFORM, LEGACY_OG]);
  });

  it("flags the legacy AI-platform bullet for naming Aranca's document intelligence engine under Bain", () => {
    const row = auditProfile(mixedProfile()).find(r => r.text === LEGACY_AI_PLATFORM)!;
    expect(row.toolViolations).toEqual([{ tool: "Document intelligence engine", belongsTo: "Aranca" }]);
  });

  it("flags a legacy bullet superseded by an imported one, even across the '&' vs 'and' entry split", () => {
    const row = auditProfile(mixedProfile()).find(r => r.text === LEGACY_OG)!;
    expect(row.superseded).toBe(true);
    expect(row.bestImportedMatch!.text).toMatch(/^Led a concept selection study for a national oil and gas company/);
  });

  it("never flags an imported bullet as superseded", () => {
    expect(auditProfile(mixedProfile()).filter(r => r.origin === "imported" && r.superseded)).toHaveLength(0);
  });

  it("removeBullets removes exactly the named ids and nothing else", () => {
    const profile = mixedProfile();
    const target = bulletId("experience", "Bain & Company", LEGACY_AI_PLATFORM);
    const { profile: next, removed } = removeBullets(profile, new Set([target]));
    expect(removed).toEqual([{ company: "Bain & Company", text: LEGACY_AI_PLATFORM }]);
    expect(next.experience[0].bullets).toBe(LEGACY_OG);
    expect(next.experience[1].bullets).toBe(profile.experience[1].bullets);
  });

  it("removeBullets is a no-op for an empty or unknown id set", () => {
    const profile = mixedProfile();
    expect(removeBullets(profile, new Set()).removed).toHaveLength(0);
    expect(removeBullets(profile, new Set(["e_doesnotexist"])).profile).toEqual(profile);
  });
});
