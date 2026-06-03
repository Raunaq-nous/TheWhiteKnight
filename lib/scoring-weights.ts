// Phase 2: global score computed in code from the five LLM sub-scores.
// The LLM's own `global` field is discarded; this value replaces it.
//
// Weights rationale:
//   cv_match (35%) — primary gate; skills mismatch blocks everything else
//   north_star (25%) — career strategy alignment; off-archetype applications drain pipeline
//   red_flags (20%) — outsized weight because a suspicious posting poisons all other signals
//   culture (10%) — real signal but JD text is a weak proxy for actual culture
//   comp (10%) — often absent from JDs; negotiable; lower to avoid penalising omissions

export const SCORE_WEIGHTS = {
  cv_match: 0.35,
  north_star: 0.25,
  red_flags: 0.20,
  culture: 0.10,
  comp: 0.10,
} as const;

export type ScoreInputs = {
  cv_match: number;
  north_star: number;
  comp: number;
  culture: number;
  red_flags: number;
};

export function computeGlobalScore(scores: ScoreInputs): number {
  const raw =
    scores.cv_match * SCORE_WEIGHTS.cv_match +
    scores.north_star * SCORE_WEIGHTS.north_star +
    scores.comp * SCORE_WEIGHTS.comp +
    scores.culture * SCORE_WEIGHTS.culture +
    scores.red_flags * SCORE_WEIGHTS.red_flags;
  return Math.round(Math.max(1, Math.min(5, raw)) * 100) / 100;
}

export type Recommendation = "apply_immediately" | "apply" | "review_manually" | "skip";

// Derives the recommendation from the computed global.
// Safety cap: if red_flags <= 2 (many flags), the recommendation is capped at
// "review_manually" regardless of the global score, so no flagged posting
// can score into "apply" or "apply_immediately".
// Note: the LLM also returns a legitimacy tier, but that is advisory metadata
// displayed in the UI and is NOT used to enforce this cap — the cap is purely
// code-side on the red_flags sub-score.
export function deriveRecommendation(global: number, redFlagsScore: number): Recommendation {
  const base: Recommendation =
    global >= 4.5 ? "apply_immediately" :
    global >= 4.0 ? "apply" :
    global >= 3.5 ? "review_manually" : "skip";

  if (redFlagsScore <= 2 && (base === "apply_immediately" || base === "apply")) {
    return "review_manually";
  }
  return base;
}
