import "server-only";
// FRESH-CONTEXT EVALUATOR GATE for resumes, cover letters and outreach
// drafts. A separate model call (task "evaluator", the structured-task
// model chain) that sees only the finished artifact and the JD's top
// requirements, never the generation prompt. The rubric is default-FAIL
// (lib/evaluation.ts). On FAIL the artifact is regenerated ONCE with the
// findings; if it still fails, the findings travel with it to the builder.
// Nothing ships silently: every result carries its verdict.

import { z } from "zod";
import { chatJSON, type ProviderSettings } from "../../ai-client";
import { evaluatorPrompt } from "../../prompts";
import {
  type ArtifactEvaluation, type CriterionId, type DeterministicCheck, type EvaluatedKind, type ModelCriterion,
  CRITERION_LABELS, MODEL_CRITERIA, criteriaFor, failingFindings, scoreEvaluation,
} from "../../evaluation";
import { runConfidentialityGate, loadProfileRulesConfig } from "../../resume-confidentiality";
import { resumeContentToMarkdown, type ResumeContent } from "../../resume-schema";
import { summaryViolations } from "../../resume-summary";
import { proofFigures } from "../../resume-fill";
import { isSameEngagement } from "../../resume-fill";
import { impactDensity } from "../../resume-bullet-relevance";
import type { ResumeArchetype } from "../../resume-archetype";

const EvaluatorSchema = z.object({
  criteria: z.array(z.object({ id: z.string(), pass: z.boolean(), evidence: z.array(z.string()).optional().default([]), finding: z.string().optional().default("") })),
});

const FLUFF = ["results-driven", "results-oriented", "first principles", "approaches every engagement", "leveraged", "spearheaded", "synergies", "dynamic professional", "seasoned professional"];

function fluffCheck(text: string): DeterministicCheck {
  const banned = [...(loadProfileRulesConfig().bannedPhrases ?? []), ...FLUFF];
  const hits = banned.filter(p => text.toLowerCase().includes(p.toLowerCase()));
  return hits.length
    ? { pass: false, evidence: [], finding: `Contains banned or filler phrase(s): ${hits.map(h => `"${h}"`).join(", ")}.` }
    : { pass: true, evidence: ["no banned or filler phrase found"], finding: "ok" };
}

function confidentialityCheck(text: string, archetype?: string): DeterministicCheck {
  const gate = runConfidentialityGate(text, undefined, archetype);
  return gate.ok
    ? { pass: true, evidence: ["confidentiality gate: no forbidden or never-cite term"], finding: "ok" }
    : { pass: false, evidence: [], finding: `Forbidden term(s): ${gate.blockedTerms.join(", ")}.` };
}

/** Deterministic checks for a resume. */
export function resumeChecks(content: ResumeContent, archetype: ResumeArchetype, requirementsCovered?: { requirement: string; bulletId: string | null }[], jdText?: string): Partial<Record<CriterionId, DeterministicCheck>> {
  const bullets = content.experience.flatMap(e => e.bullets.map(b => b.text));
  const text = resumeContentToMarkdown(content, archetype);
  const checks: Partial<Record<CriterionId, DeterministicCheck>> = {};

  const uncovered = (requirementsCovered ?? []).filter(r => !r.bulletId).map(r => r.requirement);
  if (requirementsCovered) {
    checks.covers_requirements = uncovered.length
      ? { pass: false, evidence: [], finding: `No bullet covers: ${uncovered.join("; ")}.` }
      : { pass: true, evidence: [], finding: "ok" };
  }

  const evidence = content.skillEvidence ?? [];
  const listed = content.skills.flatMap(g => g.items);
  const unevidenced = listed.filter(s => !evidence.find(e => e.skill === s && e.sourceBulletId));
  checks.skills_evidenced = listed.length === 0
    ? { pass: false, evidence: [], finding: "No skills are listed." }
    : unevidenced.length
      ? { pass: false, evidence: [], finding: `Skills with no evidencing bullet: ${unevidenced.join(", ")}.` }
      : { pass: true, evidence: evidence.map(e => `${e.skill} <- ${e.sourceBulletId}`), finding: "ok" };

  const quantified = bullets.filter(b => impactDensity(b) > 0).length;
  const needed = Math.max(3, Math.ceil(bullets.length * 0.4));
  checks.quantified_outcomes = quantified >= needed
    ? { pass: true, evidence: [`${quantified} of ${bullets.length} bullets carry a quantified outcome`], finding: "ok" }
    : { pass: false, evidence: [], finding: `Only ${quantified} of ${bullets.length} bullets are quantified (need ${needed}).` };

  const repeats: string[] = [];
  const seen = new Map<string, number>();
  bullets.forEach((b, i) => { for (const f of proofFigures(b)) { if (seen.has(f) && seen.get(f) !== i) repeats.push(f); else seen.set(f, i); } });
  for (let i = 0; i < bullets.length; i++) for (let j = i + 1; j < bullets.length; j++) if (isSameEngagement(bullets[i], bullets[j])) repeats.push(`engagement: "${bullets[j].slice(0, 60)}..."`);
  checks.no_repetition = repeats.length
    ? { pass: false, evidence: [], finding: `Repeated: ${[...new Set(repeats)].join("; ")}.` }
    : { pass: true, evidence: [], finding: "ok" };

  checks.no_fluff = fluffCheck(text);
  checks.confidentiality_clean = confidentialityCheck(text, archetype);
  const v = summaryViolations(content.summary, { bulletTexts: bullets, jdText });
  checks.summary_within_limits = !content.summary.trim()
    ? { pass: true, evidence: ["no summary for this archetype"], finding: "ok" }
    : v.length
      ? { pass: false, evidence: [], finding: `Summary: ${v.join("; ")}.` }
      : { pass: true, evidence: [content.summary.slice(0, 120)], finding: "ok" };
  return checks;
}

const DRAFT_MIN_FIGURES: Partial<Record<EvaluatedKind, number>> = { "cover-letter": 2, "outreach-hm": 1, "ceo-cold-email": 1 };

/** Deterministic checks for a cover letter or outreach draft. */
export function draftChecks(kind: EvaluatedKind, text: string, archetype?: string): Partial<Record<CriterionId, DeterministicCheck>> {
  const checks: Partial<Record<CriterionId, DeterministicCheck>> = {
    no_fluff: fluffCheck(text),
    confidentiality_clean: confidentialityCheck(text, archetype),
  };
  const need = DRAFT_MIN_FIGURES[kind];
  if (need) {
    const figures = [...proofFigures(text)];
    checks.quantified_outcomes = figures.length >= need
      ? { pass: true, evidence: [`${figures.length} quantified figure(s)`], finding: "ok" }
      : { pass: false, evidence: [], finding: `Only ${figures.length} quantified figure(s) (need ${need}).` };
  }
  return checks;
}

/** One evaluator call plus the deterministic checks, scored default-FAIL. */
export async function evaluateArtifact(input: {
  kind: EvaluatedKind;
  artifact: string;
  requirements: string[];
  deterministic: Partial<Record<CriterionId, DeterministicCheck>>;
  providerSettings?: ProviderSettings;
}): Promise<Omit<ArtifactEvaluation, "attempts" | "regenerated" | "previousFindings">> {
  const modelCriteria = criteriaFor(input.kind).filter(c => MODEL_CRITERIA.includes(c));
  let model: ModelCriterion[] | null = null;
  let error: string | undefined;
  try {
    const data = await chatJSON<z.infer<typeof EvaluatorSchema>>(
      [{ role: "user", content: evaluatorPrompt({ kind: input.kind, artifact: input.artifact, requirements: input.requirements, criteria: modelCriteria.map(id => ({ id, label: CRITERION_LABELS[id] })) }) }],
      { temperature: 0, maxTokens: 1500, task: "evaluator" },
      input.providerSettings,
      EvaluatorSchema,
    );
    model = data.criteria;
  } catch (e) {
    error = (e as Error).message;
  }
  const scored = scoreEvaluation({ kind: input.kind, artifact: input.artifact, model, deterministic: input.deterministic, error });
  return { kind: input.kind, evaluatedAt: new Date().toISOString(), ...scored };
}

/**
 * The gate: generate, evaluate, and on FAIL regenerate ONCE with the
 * findings and evaluate again. An evaluator outage is not retried (a second
 * draft would not change it); its FAIL verdict is shown with the error.
 */
export async function withEvaluatorGate<T>(opts: {
  generate: (findings: string[] | null) => Promise<T>;
  evaluate: (artifact: T) => Promise<Omit<ArtifactEvaluation, "attempts" | "regenerated" | "previousFindings">>;
}): Promise<{ artifact: T; evaluation: ArtifactEvaluation }> {
  const first = await opts.generate(null);
  const e1 = await opts.evaluate(first);
  if (e1.verdict === "PASS" || e1.error) return { artifact: first, evaluation: { ...e1, attempts: 1, regenerated: false } };
  const findings = failingFindings(e1);
  console.warn(`[CareerOS] evaluator FAILED the ${e1.kind} draft; regenerating once with ${findings.length} finding(s).`);
  const second = await opts.generate(findings);
  const e2 = await opts.evaluate(second);
  return { artifact: second, evaluation: { ...e2, attempts: 2, regenerated: true, previousFindings: findings } };
}
