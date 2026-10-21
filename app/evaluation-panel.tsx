"use client";
// Shows the fresh-context evaluator's verdict for an artifact (lib/evaluation.ts):
// PASS/FAIL, every criterion with its quoted evidence or its finding, and
// whether the draft was regenerated once. A FAIL is never hidden.
import type { ArtifactEvaluation } from "../lib/evaluation";

export function EvaluationPanel({ evaluation, compact = false }: { evaluation: ArtifactEvaluation | null | undefined; compact?: boolean }) {
  if (!evaluation) return null;
  const pass = evaluation.verdict === "PASS";
  const color = pass ? "var(--success, #8fd19e)" : "var(--error, #e08a8a)";
  const failing = evaluation.criteria.filter(c => !c.pass);
  return (
    <div data-testid="evaluation-panel" data-verdict={evaluation.verdict}
      style={{ border: `1px solid ${color}`, borderRadius: "var(--radius, 6px)", padding: 12, margin: "12px 0", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ color, fontWeight: 700, letterSpacing: "0.06em" }}>INDEPENDENT REVIEW: {evaluation.verdict}</span>
        <span style={{ color: "var(--text-tertiary)" }}>
          {evaluation.criteria.length - failing.length}/{evaluation.criteria.length} criteria
          {evaluation.regenerated ? " · regenerated once after a failed first draft" : ""}
        </span>
      </div>
      {evaluation.error && <div style={{ color }}>Evaluator unavailable: {evaluation.error}</div>}
      {!pass && (
        <div style={{ color: "var(--text-secondary)", marginBottom: 6 }}>
          Still failing after {evaluation.attempts} attempt{evaluation.attempts === 1 ? "" : "s"}. Review these before using it:
        </div>
      )}
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {(compact && pass ? [] : evaluation.criteria).map(c => (
          <li key={c.id} style={{ marginBottom: 4, color: c.pass ? "var(--text-secondary)" : color }}>
            {c.pass ? "PASS" : "FAIL"} · {c.label}
            {!c.pass && c.finding ? <span>: {c.finding}</span> : null}
            {c.pass && c.evidence.length > 0 && !compact ? <span style={{ color: "var(--text-tertiary)" }}> — “{c.evidence[0].slice(0, 120)}”</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
