import { describe, it, expect } from "vitest";
import { mergeAtsIssuesIntoDeductions } from "../resume-audit";
import type { ResumeAuditResult } from "../schemas";

function baseAudit(overrides: Partial<ResumeAuditResult> = {}): ResumeAuditResult {
  return {
    categories: [
      { category: "jd_requirement_coverage", label: "JD Requirement Coverage", score: 3, evidence: [] },
      { category: "quantified_impact", label: "Quantified Impact", score: 3, evidence: [] },
      { category: "clarity_and_structure", label: "Clarity & Structure", score: 4, evidence: [] },
      { category: "seniority_signal", label: "Seniority Signal", score: 3, evidence: [] },
    ],
    bonusPoints: [],
    deductions: [],
    overallScore: 6,
    verdict: "borderline",
    summary: "A middling resume.",
    ...overrides,
  };
}

describe("mergeAtsIssuesIntoDeductions", () => {
  it("appends deterministic ATS issues as formatting_problem deductions", () => {
    const audit = baseAudit();
    const merged = mergeAtsIssuesIntoDeductions(audit, [{ detail: "Em dash found", severity: "major" }]);
    expect(merged.deductions).toHaveLength(1);
    expect(merged.deductions[0]).toEqual({ type: "formatting_problem", detail: "Em dash found", severity: "major" });
  });

  it("does not duplicate an issue the model already reported verbatim", () => {
    const audit = baseAudit({
      deductions: [{ type: "formatting_problem", detail: "Em dash found", severity: "major" }],
    });
    const merged = mergeAtsIssuesIntoDeductions(audit, [{ detail: "Em dash found", severity: "major" }]);
    expect(merged.deductions).toHaveLength(1);
  });

  it("leaves the audit untouched (same reference) when there are no ATS issues", () => {
    const audit = baseAudit();
    const merged = mergeAtsIssuesIntoDeductions(audit, []);
    expect(merged).toBe(audit);
  });

  it("preserves the model's own deductions alongside the merged ones", () => {
    const audit = baseAudit({
      deductions: [{ type: "vague_bullet", detail: "Worked on various initiatives.", severity: "minor" }],
    });
    const merged = mergeAtsIssuesIntoDeductions(audit, [{ detail: "No section headings found.", severity: "major" }]);
    expect(merged.deductions).toHaveLength(2);
    expect(merged.deductions.map(d => d.type)).toEqual(["vague_bullet", "formatting_problem"]);
  });

  it("merges multiple distinct ATS issues, skipping only the exact duplicates", () => {
    const audit = baseAudit({
      deductions: [{ type: "formatting_problem", detail: "Issue A", severity: "major" }],
    });
    const merged = mergeAtsIssuesIntoDeductions(audit, [
      { detail: "Issue A", severity: "major" },
      { detail: "Issue B", severity: "minor" },
    ]);
    expect(merged.deductions.map(d => d.detail)).toEqual(["Issue A", "Issue B"]);
  });
});
