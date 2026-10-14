// OUTCOME CLAUSE — the quality filter for resume eligibility (and the
// dedupe survivor rule). An outcome is what the work produced or changed:
// a number or scope marker, a consequence ("unlocking investment",
// "informing the roadmap"), or a named decision. Deliberately NOT the format
// gate's broader hasIdentifiableOutcome, whose "delivered artifact" family
// counts "Built ... framework" / "Developed ... strategy" as an outcome; for
// a consulting bullet that phrase is the activity itself.

import { impactDensity } from "./resume-bullet-relevance";

const RESULT_CONSEQUENCE =
  /\b(enabling|enabled|resulting in|which led to|leading to|led to|used for|adopted by|driving|drove|informing|informed|guiding|guided|shaping|shaped|pinpointing|pinpointed|identifying|identified|unlocking|unlocked|securing|secured|lifting|lifted|cutting|reducing|reduced|increasing|increased|improving|improved|contributing to|winning|won|closing|closed|tripling|tripled|doubling|doubled|reforming|replacing|automating|automates|giving|in place of)\b/i;
const RESULT_DECISION =
  /\bboard[- ]level (recommendation|decision)\b|\binvestment commitment\b|\bc-suite (decision|decision document|recommendation)\b|\binvestment-committee\b/i;

export function hasOutcomeClause(text: string): boolean {
  return impactDensity(text) > 0 || RESULT_CONSEQUENCE.test(text) || RESULT_DECISION.test(text);
}
