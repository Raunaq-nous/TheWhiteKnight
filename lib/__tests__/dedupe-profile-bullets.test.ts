import { describe, it, expect } from "vitest";
import { dedupeExperienceEntry, dedupeProfile, compareSurvivor, isVerbLed } from "../../scripts/dedupe-profile-bullets";
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

describe("survivor rule — which duplicate is kept", () => {
  const T_FRAG = "$10B French conglomerate: India market entry across automotive, pharma, and consumer electronics simultaneously";
  const T_FULL = "Led full market entry for a $10B French conglomerate across automotive, pharma, and consumer electronics simultaneously. M&A/JV targets, partner origination, competitive intelligence";
  const E_FRAG = "Competitive intelligence and market analysis for Fortune 1000 technology clients. Dense, deadline-driven work translating complex multi-source data into executive-actionable insights";

  it("detects verb-led sentences vs fragments (figure label, noun phrase, client name)", () => {
    expect(isVerbLed(T_FULL)).toBe(true);
    expect(isVerbLed("Co-founded and scaled a creator economy platform.")).toBe(true);
    expect(isVerbLed(T_FRAG)).toBe(false);
    expect(isVerbLed(E_FRAG)).toBe(false);
    expect(isVerbLed("Accenture: led the GTM workstream.")).toBe(false);
  });

  it("real reported Tecnova pair: keeps the full verb-led sentence, drops the '$10B ...:' fragment", () => {
    const { bullets, pairs } = dedupeExperienceEntry(entry({ company: "Tecnova India", bullets: `${T_FRAG}\n${T_FULL}` }));
    expect(bullets).toEqual([T_FULL]);
    expect(pairs[0]).toMatchObject({ keptText: T_FULL, droppedText: T_FRAG, whyKept: "full sentence over fragment" });
  });

  it("never keeps a fragment over a full sentence, even when the fragment has more impact markers", () => {
    const denseFragment = "$10B conglomerate: 3 sectors, 12 mandates, 40% growth, India market entry for the French conglomerate";
    const plainSentence = "Led India market entry for the French conglomerate across three sectors";
    expect(compareSurvivor(plainSentence, denseFragment)).toBeLessThan(0);
  });

  it("between two full sentences, prefers one with an outcome clause, then higher impact density", () => {
    const noOutcome = "Led a market analysis for a logistics firm covering demand and supply";
    const withOutcome = "Led a market analysis for a logistics firm, cutting cost by 12% across 4 sites";
    const lessDense = "Led a market analysis for a logistics firm, cutting cost by 12%";
    expect(compareSurvivor(withOutcome, noOutcome)).toBeLessThan(0);
    expect(compareSurvivor(withOutcome, lessDense)).toBeLessThan(0);
  });

  it("uses imported master-spec text only as a tiebreak, then length", () => {
    const imported = "Built an M&A roadmap for a global IT services firm, sequencing acquisition targets to improve the valuation multiple and enabling private equity investment.";
    const legacySameRank = "Built an M&A roadmap for a global IT services firm, sequencing acquisition targets to lift the valuation multiple and enabling PE investment for the owners today.";
    expect(compareSurvivor(imported, legacySameRank)).toBeLessThan(0);
  });

  it("every KEEP shown is a final survivor: a bullet kept in one pair is never dropped by another", () => {
    const { bullets, pairs } = dedupeExperienceEntry(entry({ company: "Tecnova India", bullets: [T_FRAG, T_FULL, "Led India market entry strategy for a $10 billion French conglomerate across automotive, pharmaceuticals, and consumer electronics simultaneously, covering M&A and joint venture targets, partner origination, and competitive intelligence."].join("\n") }));
    for (const p of pairs) expect(bullets).toContain(p.keptText);
    for (const p of pairs) expect(bullets).not.toContain(p.droppedText);
  });

  it("'Fortune 1000' is a list name, not a scope figure", () => {
    const { pairs } = dedupeExperienceEntry(entry({ company: "Evalueserve", bullets: `${E_FRAG}\nLed competitive intelligence and market analysis for Fortune 1000 technology clients, translating multi-source data into executive-actionable insights that shaped 3 product roadmaps.` }));
    expect(pairs).toHaveLength(1);
    expect(pairs[0].droppedText).toBe(E_FRAG);
  });
});
