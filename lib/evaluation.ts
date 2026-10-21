// FRESH-CONTEXT EVALUATOR — shared types and the pure, default-FAIL rubric.
// Client-safe: the builder and application page render these results.
//
// Every criterion starts FALSE. A criterion passes only when:
//   - model criteria: the evaluator says pass AND quotes at least one piece
//     of evidence that appears VERBATIM in the artifact (a quote the
//     artifact doesn't contain is a fabrication and fails the criterion),
//     AND any deterministic check for that criterion also passes;
//   - deterministic criteria: the check passes, with its evidence recorded.
// A criterion the model omits fails. An evaluator error fails everything.

export type EvaluatedKind = "resume" | "cover-letter" | "outreach-hm" | "linkedin-dm" | "referral-dm" | "ceo-cold-email";

export const EVALUATED_DRAFT_KINDS: EvaluatedKind[] = ["cover-letter", "outreach-hm", "linkedin-dm", "referral-dm", "ceo-cold-email"];

export type CriterionId =
  | "covers_requirements"
  | "skills_evidenced"
  | "quantified_outcomes"
  | "no_repetition"
  | "no_fluff"
  | "confidentiality_clean"
  | "summary_within_limits";

export const CRITERION_LABELS: Record<CriterionId, string> = {
  covers_requirements: "Covers each top JD requirement",
  skills_evidenced: "Every listed skill is evidenced",
  quantified_outcomes: "Enough quantified outcomes for the length",
  no_repetition: "No figure or engagement repeated",
  no_fluff: "No fluff or banned phrases",
  confidentiality_clean: "Confidentiality clean",
  summary_within_limits: "Summary within its limits",
};

/** Criteria judged by the evaluator model (always also checked deterministically where a check exists). */
export const MODEL_CRITERIA: CriterionId[] = ["covers_requirements", "quantified_outcomes", "no_repetition", "no_fluff"];

/** Which criteria apply to an artifact kind. */
export function criteriaFor(kind: EvaluatedKind): CriterionId[] {
  const base: CriterionId[] = ["covers_requirements", "quantified_outcomes", "no_repetition", "no_fluff", "confidentiality_clean"];
  return kind === "resume" ? [...base.slice(0, 1), "skills_evidenced", ...base.slice(1), "summary_within_limits"] : base;
}

export type CriterionResult = {
  id: CriterionId;
  label: string;
  pass: boolean;
  evidence: string[];
  finding: string;
  source: "model" | "deterministic" | "model+deterministic";
};

export type ArtifactEvaluation = {
  kind: EvaluatedKind;
  verdict: "PASS" | "FAIL";
  criteria: CriterionResult[];
  evaluatedAt: string;
  // 1 = the first draft was judged; 2 = it failed, was regenerated once with
  // the findings, and the second draft was judged.
  attempts: 1 | 2;
  regenerated: boolean;
  // Findings from the failed first draft, when regenerated.
  previousFindings?: string[];
  // Set when the evaluator call itself failed (verdict is then FAIL).
  error?: string;
};

export type ModelCriterion = { id: string; pass: boolean; evidence?: string[]; finding?: string };
export type DeterministicCheck = { pass: boolean; evidence: string[]; finding: string };

const normalise = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** True only when every quote is non-trivial and appears verbatim in the artifact. */
export function quotesAreVerbatim(quotes: string[], artifact: string): boolean {
  const hay = normalise(artifact);
  const usable = quotes.map(normalise).filter(q => q.length >= 3);
  return usable.length > 0 && usable.length === quotes.length && usable.every(q => hay.includes(q));
}

/** Applies the default-FAIL rubric. Deterministic checks are AND-ed with the model for model criteria, and stand alone otherwise. */
export function scoreEvaluation(input: {
  kind: EvaluatedKind;
  artifact: string;
  model: ModelCriterion[] | null;
  deterministic: Partial<Record<CriterionId, DeterministicCheck>>;
  error?: string;
}): Pick<ArtifactEvaluation, "verdict" | "criteria" | "error"> {
  const criteria: CriterionResult[] = criteriaFor(input.kind).map(id => {
    const label = CRITERION_LABELS[id];
    const det = input.deterministic[id];
    if (!MODEL_CRITERIA.includes(id)) {
      if (!det) return { id, label, pass: false, evidence: [], finding: "No check ran for this criterion.", source: "deterministic" };
      return { id, label, pass: det.pass, evidence: det.evidence, finding: det.finding, source: "deterministic" };
    }
    const m = input.model?.find(x => x.id === id);
    const quotes = (m?.evidence ?? []).filter(q => typeof q === "string");
    const modelPass = !!m && m.pass === true && quotesAreVerbatim(quotes, input.artifact);
    const findings: string[] = [];
    if (!m) findings.push(input.error ? `Evaluator unavailable: ${input.error}` : "The evaluator did not assess this criterion.");
    else if (m.pass && !quotesAreVerbatim(quotes, input.artifact)) findings.push("Marked as passing without evidence quoted verbatim from the artifact.");
    else if (!m.pass) findings.push(m.finding || "Failed.");
    if (det && !det.pass) findings.push(det.finding);
    return {
      id, label,
      pass: modelPass && (!det || det.pass),
      evidence: [...(modelPass ? quotes : []), ...(det?.pass ? det.evidence : [])],
      finding: findings.join(" ") || (m?.finding ?? ""),
      source: det ? "model+deterministic" : "model",
    };
  });
  return { verdict: criteria.every(c => c.pass) ? "PASS" : "FAIL", criteria, ...(input.error ? { error: input.error } : {}) };
}

/** The failing criteria as short findings, for the regeneration prompt and the UI. */
export function failingFindings(e: Pick<ArtifactEvaluation, "criteria">): string[] {
  return e.criteria.filter(c => !c.pass).map(c => `${c.label}: ${c.finding}`);
}
