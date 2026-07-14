/**
 * Regression tests for the "expected string, received null" class of bug:
 * a field the prompt explicitly tells the model can be "string or null" but
 * whose zod schema only had .optional() (which tolerates a missing key, not
 * a literal null value).
 */
import { describe, it, expect } from "vitest";
import { AFScoreResultSchema } from "../schemas";

function validScoreBlock() {
  return { score: 3, reasoning: "Reasonable fit." };
}

function baseAFScoreResult() {
  return {
    archetype: { primary: "AI Product Manager", secondary: null },
    scores: {
      cv_match: validScoreBlock(),
      north_star: validScoreBlock(),
      comp: validScoreBlock(),
      culture: validScoreBlock(),
      red_flags: validScoreBlock(),
    },
    global: 3,
    recommendation: "apply" as const,
    legitimacy: {
      tier: "high_confidence" as const,
      signals: [],
      notes: null,
    },
    jdParsed: {
      keyRequirements: [],
      technicalSkills: [],
      softSkills: [],
      yearsExperienceRequired: null,
      redFlags: [],
      keywords: [],
    },
    bucket: "ai-tech-pm",
    bucketName: "AI / Technical PM",
  };
}

describe("AFScoreResultSchema", () => {
  it("accepts archetype.secondary === null", () => {
    const result = AFScoreResultSchema.safeParse(baseAFScoreResult());
    expect(result.success).toBe(true);
  });

  it("accepts legitimacy.notes === null", () => {
    const result = AFScoreResultSchema.safeParse(baseAFScoreResult());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.legitimacy.notes).toBeNull();
  });

  it("still accepts archetype.secondary omitted entirely", () => {
    const input = baseAFScoreResult();
    delete (input.archetype as any).secondary;
    const result = AFScoreResultSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("still accepts a real archetype.secondary string", () => {
    const input = baseAFScoreResult();
    input.archetype.secondary = "Growth PM" as any;
    const result = AFScoreResultSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.archetype.secondary).toBe("Growth PM");
  });

  it("still rejects a non-string, non-null value for archetype.secondary", () => {
    const input = baseAFScoreResult();
    (input.archetype as any).secondary = 42;
    const result = AFScoreResultSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
