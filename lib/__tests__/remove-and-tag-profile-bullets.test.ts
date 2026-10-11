import { describe, it, expect } from "vitest";
import { planRemoval, parseIds } from "../../scripts/remove-profile-bullets";
import { planTagging, applyTagging } from "../../scripts/tag-imported-bullets";
import { removeBullets } from "../../scripts/audit-profile-bullets";
import { mergeEmployerEntries } from "../../scripts/merge-employer-entries";
import { applyBulletTags, EXPERIENCE_CANDIDATES } from "../../scripts/import-master-profile";
import { auditProfile } from "../../scripts/audit-profile-bullets";
import { bulletId } from "../profile-bullets";
import { getSeedProfile } from "../profile";
import type { Profile } from "../profile";

const bainSpec = EXPERIENCE_CANDIDATES.find(c => c.company === "Bain and Company")!.bullets;
const OG = bainSpec.find(b => b.startsWith("Led a concept selection study"))!;
const GREEN = bainSpec.find(b => b.startsWith("Led capital program readiness"))!;
const SOLAR = bainSpec.find(b => b.startsWith("Drove performance improvement"))!;
const LEGACY = "Earned a fast-track promotion within the first year.";

function profile(): Profile {
  return {
    ...getSeedProfile(),
    experience: [
      { id: "b", company: "Bain & Company", role: "PL", tenure: "2025 - Present", location: "", current: true, bullets: [LEGACY, OG].join("\n") },
      { id: "a", company: "Aranca", role: "Lead", tenure: "2022 - 2025", location: "Mumbai", current: false, bullets: "Aranca bullet one." },
    ],
  };
}
const id = (company: string, t: string) => bulletId("experience", company, t);

describe("remove-profile-bullets", () => {
  it("parses a comma-separated id list", () => {
    expect(parseIds(" e_a, e_b ,,e_c ")).toEqual(["e_a", "e_b", "e_c"]);
  });

  it("previews each bullet's employer and full text, with no overlap requirement", () => {
    const plan = planRemoval(profile(), [id("Bain & Company", LEGACY), id("Aranca", "Aranca bullet one.")]);
    expect(plan.missing).toEqual([]);
    expect(plan.found).toEqual([
      { id: id("Bain & Company", LEGACY), company: "Bain & Company", text: LEGACY },
      { id: id("Aranca", "Aranca bullet one."), company: "Aranca", text: "Aranca bullet one." },
    ]);
  });

  it("reports unknown ids so the run can abort without writing", () => {
    const plan = planRemoval(profile(), [id("Bain & Company", LEGACY), "e_nope"]);
    expect(plan.missing).toEqual(["e_nope"]);
  });

  it("removal also clears the bullet's imported marker and category tag", () => {
    const p = profile();
    p.experience[0] = { ...p.experience[0], importedBullets: [OG], bulletTags: { [OG]: "consulting_engagement" } };
    const { profile: next } = removeBullets(p, new Set([id("Bain & Company", OG)]));
    expect(next.experience[0].importedBullets).toEqual([]);
    expect(next.experience[0].bulletTags).toEqual({});
  });
});

describe("merge:employer preserves the imported marker and category", () => {
  function split(): Profile {
    return {
      ...getSeedProfile(),
      experience: [
        { id: "l", company: "Bain & Company", role: "PL", tenure: "2025 - Present", location: "", current: true, bullets: LEGACY },
        // The reported case: imported consulting bullets arriving with no tags at all.
        { id: "i", company: "Bain and Company", role: "Project Leader", tenure: "Jun 2025 - Present", location: "", current: false, bullets: [OG, GREEN, SOLAR].join("\n") },
      ],
    };
  }

  it("folds spec bullets in as imported with their consulting_engagement category, even when the source entry had no tags", () => {
    const { profile: merged, preview } = mergeEmployerEntries(split(), "Bain & Company", "Bain and Company");
    const bain = merged.experience[0];
    expect(bain.importedBullets?.sort()).toEqual([OG, GREEN, SOLAR].sort());
    for (const t of [OG, GREEN, SOLAR]) expect(bain.bulletTags?.[t]).toBe("consulting_engagement");
    expect(preview.folded.every(f => f.imported)).toBe(true);
    const rows = auditProfile(merged);
    for (const t of [OG, GREEN, SOLAR]) expect(rows.find(r => r.text === t)!.origin).toBe("imported");
    expect(rows.find(r => r.text === LEGACY)!.origin).toBe("legacy");
  });

  it("carries a recorded marker for text that no longer matches the spec", () => {
    const edited = "Led a concept selection study for a national O&G company, authoring the C-suite decision document.";
    const p = split();
    p.experience[1] = { ...p.experience[1], bullets: edited, importedBullets: [edited], bulletTags: { [edited]: "consulting_engagement" } };
    const bain = mergeEmployerEntries(p, "Bain & Company", "Bain and Company").profile.experience[0];
    expect(bain.importedBullets).toEqual([edited]);
    expect(bain.bulletTags?.[edited]).toBe("consulting_engagement");
  });
});

describe("tag-imported-bullets (re-tagging bullets that lost their marker)", () => {
  function affected(): Profile {
    return {
      ...getSeedProfile(),
      experience: [{ id: "b", company: "Bain & Company", role: "PL", tenure: "2025 - Present", location: "", current: true, bullets: [LEGACY, OG, GREEN, SOLAR].join("\n") }],
    };
  }

  it("re-marks the three Bain consulting engagements as imported with the spec category", () => {
    const p = affected();
    const ids = [OG, GREEN, SOLAR].map(t => id("Bain & Company", t));
    const plan = planTagging(p, ids);
    expect(plan.missing).toEqual([]);
    expect(plan.items.map(i => i.category)).toEqual(["consulting_engagement", "consulting_engagement", "consulting_engagement"]);
    const next = applyTagging(p, plan.items);
    const rows = auditProfile(next);
    expect(rows.filter(r => r.origin === "imported").map(r => r.text).sort()).toEqual([OG, GREEN, SOLAR].sort());
  });

  it("falls back to the closest spec bullet when the live text was edited", () => {
    const edited = "Led a concept selection study for a national oil and gas company in South America, building the evaluation framework and authoring the C-suite decision document.";
    const p = { ...getSeedProfile(), experience: [{ id: "b", company: "Bain & Company", role: "PL", tenure: "x", location: "", current: true, bullets: edited }] } as Profile;
    const plan = planTagging(p, [id("Bain & Company", edited)]);
    expect(plan.items[0].category).toBe("consulting_engagement");
    expect(plan.items[0].source).toMatch(/closest master-spec bullet/);
  });

  it("leaves a bullet with no spec match uncategorised unless --category is given", () => {
    const p = affected();
    expect(planTagging(p, [id("Bain & Company", LEGACY)]).items[0].category).toBeNull();
    expect(planTagging(p, [id("Bain & Company", LEGACY)], "ai_build").items[0].category).toBe("ai_build");
  });

  it("reports unknown ids", () => {
    expect(planTagging(affected(), ["e_nope"]).missing).toEqual(["e_nope"]);
  });
});

describe("import tagging matches the employer by name", () => {
  it("tags spec bullets inside a 'Bain & Company' entry (exact-name lookup used to tag none)", () => {
    const p = { ...getSeedProfile(), experience: [{ id: "b", company: "Bain & Company", role: "PL", tenure: "x", location: "", current: true, bullets: [OG, LEGACY].join("\n") }] } as Profile;
    const bain = applyBulletTags(p).experience[0];
    expect(bain.bulletTags?.[OG]).toBe("consulting_engagement");
    expect(bain.importedBullets).toEqual([OG]);
  });
});
