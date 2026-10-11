// A profile with the SAME SHAPE as the operator's live profile after cleanup
// (Bain 9, Aranca 20, Evalueserve 8, Tecnova 5, Madcue 3 = 45 bullets): the
// master-spec bullets plus synthetic, fictional bullets of similar length to
// make up the difference. No real data: the live profile lives only in the
// operator's own database. Used to calibrate and test the two-page fill.
import { EXPERIENCE_CANDIDATES, applyBulletTags } from "../../../scripts/import-master-profile";
import { getSeedProfile, type Profile } from "../../profile";

export const LIVE_SHAPE: Record<string, number> = {
  "Bain and Company": 9, Aranca: 20, Evalueserve: 8, "Tecnova India": 5, Madcue: 3,
};

const SYNTHETIC: Record<string, string[]> = {
  "Bain and Company": [
    "Led a procurement diagnostic for a regional cement producer, benchmarking spend across 14 categories and sizing a savings pipeline the client took into its annual operating plan.",
  ],
  Aranca: [
    "Built a competitor benchmarking model for a Gulf fertiliser group, comparing cost curves across 9 producers and informing its capacity expansion decision with a board-ready scenario view.",
    "Led a vendor due diligence for a Southeast Asian logistics platform, assessing unit economics across 6 cities and shaping the investor narrative for a growth equity round.",
    "Designed a pricing study for a European specialty chemicals business, segmenting 1,200 customer accounts and identifying margin leakage the commercial team acted on within a quarter.",
  ],
  Evalueserve: [
    "Mapped the partner ecosystem for a global networking vendor across 5 Asian markets, profiling 40+ channel partners and recommending a tiered enablement model for the regional sales team.",
    "Ran a win-loss analysis for an enterprise software client, interviewing 25 buyers and synthesising the findings into a positioning brief adopted by the product marketing team.",
    "Built a market sizing model for industrial IoT adoption in Indian manufacturing, triangulating top-down and bottom-up estimates across 8 sectors for a client's entry business case.",
  ],
};

/** The master-spec profile, extended to the live profile's per-employer counts. */
export function liveShapedProfile(): Profile {
  return applyBulletTags({
    ...getSeedProfile(),
    name: "Test Candidate",
    email: "candidate@example.com",
    yearsOfExperience: "8+",
    experience: EXPERIENCE_CANDIDATES.map((c, i) => {
      const bullets = [...c.bullets, ...(SYNTHETIC[c.company] ?? [])];
      return {
        id: `x${i}`, company: c.company, role: c.role, tenure: c.tenure, location: c.location ?? "",
        current: i === 0, bullets: bullets.join("\n"),
      };
    }),
  });
}
