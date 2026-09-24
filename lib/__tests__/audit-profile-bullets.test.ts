import { describe, it, expect } from "vitest";
import { auditProfile, duplicateEmployerEntries, removeBullets, sameEmployer, verifyRemoval, formatBand, employerCounts } from "../../scripts/audit-profile-bullets";
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

describe("audit-profile-bullets — removal verification against the live profile", () => {
  const NUCLEAR = "Delivered multi-plant capital program strategy for North American nuclear utility: delivered board-level recommendation for a multi-billion-dollar program";
  const COCKPIT_FORBIDDEN = "Built a portfolio intelligence cockpit on a $10.45B portfolio of 16 projects.";
  const DISTINCT = "Earned multiple Star Performance awards and a fast-track promotion.";
  function profile(): Profile {
    return {
      ...getSeedProfile(),
      experience: [{
        id: "b", company: "Bain & Company", role: "Consultant", tenure: "2025 - Present", location: "", current: true,
        bullets: [LEGACY_AI_PLATFORM, LEGACY_OG, NUCLEAR, COCKPIT_FORBIDDEN, DISTINCT, ...importedBain].join("\n"),
      }],
    };
  }
  const id = (t: string) => bulletId("experience", "Bain & Company", t);

  it("flags forbidden terms per bullet", () => {
    const rows = auditProfile(profile());
    expect(rows.find(r => r.text === NUCLEAR)!.forbiddenTerms).toContain("nuclear utility");
    expect(rows.find(r => r.text === COCKPIT_FORBIDDEN)!.forbiddenTerms).toContain("$10.45B");
    expect(rows.find(r => r.text === DISTINCT)!.forbiddenTerms).toEqual([]);
  });

  it("passes a high-overlap id, a tool-placement id and a forbidden-term id at min overlap 0.8", () => {
    const checks = verifyRemoval(auditProfile(profile()), [id(LEGACY_OG), id(LEGACY_AI_PLATFORM), id(NUCLEAR)], 0.8);
    expect(checks.map(c => c.ok)).toEqual([true, true, true]);
    expect(checks[1].reason).toMatch(/Document intelligence engine/);
    expect(checks[2].reason).toMatch(/nuclear utility/);
  });

  it("fails an id that is missing, imported, or a distinct legacy bullet below the overlap floor", () => {
    const checks = verifyRemoval(auditProfile(profile()), ["e_doesnotexist", id(importedBain[0]), id(DISTINCT)], 0.8);
    expect(checks.map(c => c.ok)).toEqual([false, false, false]);
    expect(checks[0].reason).toMatch(/not found/);
    expect(checks[1].reason).toMatch(/imported/);
    expect(checks[2].reason).toMatch(/below 0.8/);
  });

  it("formatBand lists legacy bullets in the band with both texts, excluding ones outside it", () => {
    const out = formatBand(auditProfile(profile()), 0.5, 0.8);
    expect(out).not.toContain(LEGACY_OG); // 0.90, above the band
    expect(out).not.toContain(DISTINCT);
    expect(out).toMatch(/LEGACY: .*\n  IMPORTED: /);
  });

  it("employerCounts reports total, imported and legacy per employer", () => {
    expect(employerCounts(profile())).toEqual([{ company: "Bain & Company", total: 5 + importedBain.length, imported: importedBain.length, legacy: 5 }]);
  });
});

describe("audit-profile-bullets --band argument parsing", () => {
  it("defaults to 0.50-0.79 when no bounds are given (the reported NaN bug)", async () => {
    const { parseBand } = await import("../../scripts/audit-profile-bullets");
    expect(parseBand(undefined, undefined)).toEqual([0.5, 0.8]);
    expect(parseBand("--apply", undefined)).toEqual([0.5, 0.8]);
    expect(parseBand("0.6", "0.9")).toEqual([0.6, 0.9]);
    expect(parseBand("0.9", "0.6")).toEqual([0.5, 0.8]);
  });
});
