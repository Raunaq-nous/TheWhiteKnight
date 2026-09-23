import { describe, it, expect } from "vitest";
import { dedupeExperienceEntry, dedupeProfile } from "../../scripts/dedupe-profile-bullets";
import { getSeedProfile } from "../profile";
import type { ExperienceEntry, Profile } from "../profile";

function entry(overrides: Partial<ExperienceEntry> = {}): ExperienceEntry {
  return {
    id: "e1", company: "Aranca", role: "Engagement Lead", tenure: "2022 - 2025", location: "Mumbai", current: false,
    bullets: "",
    ...overrides,
  };
}

describe("dedupeExperienceEntry — the real reported bug: same engagement, phrased differently", () => {
  it("catches the EMEA B2B Series A engagement described twice with different wording, keeping the longer/fuller version", () => {
    const fuller = "Built a Series A financial model and investor business plan for an EMEA B2B marketplace, covering revenue projections, unit economics, and adjacent market sizing, contributing to a closed multi-million-dollar raise.";
    const shorter = "Advised a fast-growing EMEA B2B marketplace on its Series A fundraising round, building the investor-ready financial model and business plan that helped close a multi-million-dollar raise.";
    const e = entry({ bullets: `${fuller}\n${shorter}` });
    const result = dedupeExperienceEntry(e);
    expect(result.pairs).toHaveLength(1);
    expect(result.bullets).toHaveLength(1);
    expect(result.bullets[0]).toBe(fuller); // longer/more-detailed text survives
  });

  it("does NOT flag two genuinely distinct engagements under the same employer that merely share domain vocabulary", () => {
    const beverage = "Led marketing and launch strategy for a global beverage company entering ready-to-drink, covering consumer positioning, channel architecture, pricing, distributor model, and market-by-market sequencing.";
    const electronics = "Led go-to-market and repositioning for an EMEA consumer electronics brand, covering channel strategy, product architecture, and revenue diversification into adjacent categories.";
    const e = entry({ bullets: `${beverage}\n${electronics}` });
    const result = dedupeExperienceEntry(e);
    expect(result.pairs).toHaveLength(0);
    expect(result.bullets).toHaveLength(2);
  });

  it("carries an explicit bulletTags category from the dropped duplicate over to the surviving bullet when the survivor has none", () => {
    const fuller = "Built a Series A financial model and investor business plan for an EMEA B2B marketplace, covering revenue projections, unit economics, and adjacent market sizing, contributing to a closed multi-million-dollar raise.";
    const shorter = "Advised a fast-growing EMEA B2B marketplace on its Series A fundraising round, building the investor-ready financial model and business plan that helped close a multi-million-dollar raise.";
    const e = entry({ bullets: `${fuller}\n${shorter}`, bulletTags: { [shorter]: "consulting_engagement" } });
    const result = dedupeExperienceEntry(e);
    expect(result.bulletTags).toEqual({ [fuller]: "consulting_engagement" });
  });

  it("leaves a role with no internal duplicates untouched", () => {
    const e = entry({ bullets: "Led one engagement.\nLed a completely different engagement for another client entirely." });
    const result = dedupeExperienceEntry(e);
    expect(result.pairs).toHaveLength(0);
    expect(result.bullets).toHaveLength(2);
  });

  it("catches an exact near-duplicate (high Jaccard) as well as a loosely-worded one (containment)", () => {
    const e = entry({
      bullets: [
        "Led a market attractiveness analysis for an EMEA logistics firm, covering demand forecasts and business model evaluation.",
        "Led a market attractiveness study for an EMEA logistics firm, covering demand forecasts and business model evaluation.",
      ].join("\n"),
    });
    const result = dedupeExperienceEntry(e);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].reason).toBe("text_similarity");
  });
});

describe("dedupeProfile — scans every employer, reports a total count", () => {
  it("finds and reports duplicates across multiple employers", () => {
    const fuller = "Built a Series A financial model and investor business plan for an EMEA B2B marketplace, covering revenue projections, unit economics, and adjacent market sizing, contributing to a closed multi-million-dollar raise.";
    const shorter = "Advised a fast-growing EMEA B2B marketplace on its Series A fundraising round, building the investor-ready financial model and business plan that helped close a multi-million-dollar raise.";
    const profile: Profile = {
      ...getSeedProfile(),
      experience: [
        entry({ id: "e1", company: "Aranca", bullets: `${fuller}\n${shorter}` }),
        entry({ id: "e2", company: "Bain and Company", bullets: "A single unique bullet with no duplicate." }),
      ],
    };
    const { profile: deduped, pairs } = dedupeProfile(profile);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].company).toBe("Aranca");
    expect(deduped.experience.find(e => e.company === "Aranca")!.bullets.split("\n")).toHaveLength(1);
    expect(deduped.experience.find(e => e.company === "Bain and Company")!.bullets).toBe("A single unique bullet with no duplicate.");
  });

  it("is a no-op (returns an equivalent profile, zero pairs) on a profile with no duplicates", () => {
    const profile: Profile = {
      ...getSeedProfile(),
      experience: [entry({ bullets: "One engagement.\nA totally different engagement." })],
    };
    const { pairs } = dedupeProfile(profile);
    expect(pairs).toHaveLength(0);
  });
});
