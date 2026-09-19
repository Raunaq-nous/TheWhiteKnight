import { describe, it, expect } from "vitest";
import { RequirementCoverageSchema, ResumeRequirementMapSchema } from "../schemas";

function baseCoverage(overrides: Record<string, unknown> = {}) {
  return {
    requirement: "Experience with predictive analytics",
    rating: "strong",
    evidence: { sourceType: "experience", sourceId: "Acme", bulletText: "Built a forecasting model that cut churn by 12%." },
    reasoning: "Directly evidences the requirement.",
    ...overrides,
  };
}

describe("RequirementCoverageSchema — ATS language alignment (backlog item 7)", () => {
  it("accepts a requirement with no terminology mismatch (field omitted)", () => {
    expect(RequirementCoverageSchema.safeParse(baseCoverage()).success).toBe(true);
  });

  it("accepts a requirement with a terminology mismatch, both phrasings present", () => {
    const result = RequirementCoverageSchema.safeParse(baseCoverage({
      terminologyMismatch: { jdTerm: "predictive analytics", profileTerm: "forecasting model" },
    }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.terminologyMismatch).toEqual({ jdTerm: "predictive analytics", profileTerm: "forecasting model" });
    }
  });

  it("accepts an explicit null for terminologyMismatch (model omits vs. nulls the same field)", () => {
    expect(RequirementCoverageSchema.safeParse(baseCoverage({ terminologyMismatch: null })).success).toBe(true);
  });

  it("rejects a malformed terminologyMismatch missing a required phrasing", () => {
    const result = RequirementCoverageSchema.safeParse(baseCoverage({ terminologyMismatch: { jdTerm: "predictive analytics" } }));
    expect(result.success).toBe(false);
  });

  it("a full requirement map with a mix of matched and mismatched terminology parses", () => {
    const result = ResumeRequirementMapSchema.safeParse({
      requirements: [
        baseCoverage({ terminologyMismatch: { jdTerm: "predictive analytics", profileTerm: "forecasting model" } }),
        baseCoverage({ requirement: "Stakeholder management", reasoning: "Matches directly." }),
        { requirement: "Uncovered thing", rating: "none", reasoning: "Nothing in the profile addresses this." },
      ],
    });
    expect(result.success).toBe(true);
  });
});
