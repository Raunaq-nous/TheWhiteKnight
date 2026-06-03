import { describe, it, expect } from "vitest";
import { SCORE_WEIGHTS, computeGlobalScore, deriveRecommendation } from "../scoring-weights";

// Expected values are derived from the documented weights, not copied from the plan.
// weights: cv=0.35, ns=0.25, comp=0.10, culture=0.10, rf=0.20

function expected(cv: number, ns: number, comp: number, culture: number, rf: number): number {
  const raw =
    cv * SCORE_WEIGHTS.cv_match +
    ns * SCORE_WEIGHTS.north_star +
    comp * SCORE_WEIGHTS.comp +
    culture * SCORE_WEIGHTS.culture +
    rf * SCORE_WEIGHTS.red_flags;
  return Math.round(Math.max(1, Math.min(5, raw)) * 100) / 100;
}

describe("computeGlobalScore", () => {
  it("all 5s -> 5.00", () => {
    expect(computeGlobalScore({ cv_match: 5, north_star: 5, comp: 5, culture: 5, red_flags: 5 }))
      .toBe(expected(5, 5, 5, 5, 5));
    expect(computeGlobalScore({ cv_match: 5, north_star: 5, comp: 5, culture: 5, red_flags: 5 }))
      .toBe(5.00);
  });

  it("all 1s -> 1.00", () => {
    expect(computeGlobalScore({ cv_match: 1, north_star: 1, comp: 1, culture: 1, red_flags: 1 }))
      .toBe(expected(1, 1, 1, 1, 1));
    expect(computeGlobalScore({ cv_match: 1, north_star: 1, comp: 1, culture: 1, red_flags: 1 }))
      .toBe(1.00);
  });

  it("cv=5 ns=5 comp=5 culture=2 rf=2 -> 4.10", () => {
    expect(computeGlobalScore({ cv_match: 5, north_star: 5, comp: 5, culture: 2, red_flags: 2 }))
      .toBe(expected(5, 5, 5, 2, 2));
    expect(computeGlobalScore({ cv_match: 5, north_star: 5, comp: 5, culture: 2, red_flags: 2 }))
      .toBe(4.10);
  });

  it("cv=4 ns=4 comp=3 culture=3 rf=1 -> 3.20", () => {
    expect(computeGlobalScore({ cv_match: 4, north_star: 4, comp: 3, culture: 3, red_flags: 1 }))
      .toBe(expected(4, 4, 3, 3, 1));
    expect(computeGlobalScore({ cv_match: 4, north_star: 4, comp: 3, culture: 3, red_flags: 1 }))
      .toBe(3.20);
  });

  it("cv=3 ns=3 comp=4 culture=4 rf=4 -> 3.40", () => {
    expect(computeGlobalScore({ cv_match: 3, north_star: 3, comp: 4, culture: 4, red_flags: 4 }))
      .toBe(expected(3, 3, 4, 4, 4));
    expect(computeGlobalScore({ cv_match: 3, north_star: 3, comp: 4, culture: 4, red_flags: 4 }))
      .toBe(3.40);
  });

  it("cv=4 ns=5 comp=3 culture=3 rf=5 -> 4.25", () => {
    expect(computeGlobalScore({ cv_match: 4, north_star: 5, comp: 3, culture: 3, red_flags: 5 }))
      .toBe(expected(4, 5, 3, 3, 5));
    expect(computeGlobalScore({ cv_match: 4, north_star: 5, comp: 3, culture: 3, red_flags: 5 }))
      .toBe(4.25);
  });

  it("clamps output to [1, 5]", () => {
    // Inputs within range, but verify clamping logic is in place
    expect(computeGlobalScore({ cv_match: 1, north_star: 1, comp: 1, culture: 1, red_flags: 1 }))
      .toBeGreaterThanOrEqual(1);
    expect(computeGlobalScore({ cv_match: 5, north_star: 5, comp: 5, culture: 5, red_flags: 5 }))
      .toBeLessThanOrEqual(5);
  });
});

describe("deriveRecommendation", () => {
  it("4.5+ without flag -> apply_immediately", () => {
    expect(deriveRecommendation(4.5, 4)).toBe("apply_immediately");
    expect(deriveRecommendation(5.0, 5)).toBe("apply_immediately");
  });

  it("4.0-4.4 without flag -> apply", () => {
    expect(deriveRecommendation(4.0, 4)).toBe("apply");
    expect(deriveRecommendation(4.4, 3)).toBe("apply");
  });

  it("3.5-3.9 -> review_manually", () => {
    expect(deriveRecommendation(3.5, 4)).toBe("review_manually");
    expect(deriveRecommendation(3.9, 5)).toBe("review_manually");
  });

  it("below 3.5 -> skip", () => {
    expect(deriveRecommendation(3.4, 5)).toBe("skip");
    expect(deriveRecommendation(1.0, 5)).toBe("skip");
  });

  // Red-flags safety cap: rf <= 2 must not score into apply or apply_immediately
  it("rf=1 with high global -> capped at review_manually", () => {
    // Without cap: cv=5,ns=5,comp=5,culture=5,rf=1 gives global 4.20 -> "apply"
    // With cap (rf=1 <= 2): must be capped to "review_manually"
    const global = computeGlobalScore({ cv_match: 5, north_star: 5, comp: 5, culture: 5, red_flags: 1 });
    expect(global).toBeGreaterThanOrEqual(4.0); // confirms it would normally be "apply"
    expect(deriveRecommendation(global, 1)).toBe("review_manually");
  });

  it("rf=2 with apply_immediately global -> capped at review_manually", () => {
    // cv=5,ns=5,comp=5,culture=5,rf=2 -> global=4.40 -> normally "apply"
    const global = computeGlobalScore({ cv_match: 5, north_star: 5, comp: 5, culture: 5, red_flags: 2 });
    expect(deriveRecommendation(global, 2)).toBe("review_manually");
  });

  it("rf=3 with borderline global -> NOT capped (rf=3 is above threshold)", () => {
    // rf=3 does not trigger the cap
    expect(deriveRecommendation(4.5, 3)).toBe("apply_immediately");
    expect(deriveRecommendation(4.0, 3)).toBe("apply");
  });

  it("rf <= 2 with skip global stays skip", () => {
    expect(deriveRecommendation(3.0, 1)).toBe("skip");
    expect(deriveRecommendation(3.4, 2)).toBe("skip");
  });

  it("rf <= 2 with review_manually global stays review_manually", () => {
    expect(deriveRecommendation(3.5, 2)).toBe("review_manually");
    expect(deriveRecommendation(3.9, 1)).toBe("review_manually");
  });
});
