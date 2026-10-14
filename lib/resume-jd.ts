// JD signals used deterministically by the resume pipeline. JD text is
// untrusted data: it is only tokenised and pattern-matched here, never
// interpreted as instructions.

import type { Application } from "./store";
import type { ResumeArchetype } from "./resume-archetype";

const AI_PATTERN = /\b(ai|artificial intelligence|gen ?ai|generative|machine learning|ml|llms?|agentic|agents?|automation|data science|intelligent automation)\b/gi;
const TECHNICAL_ROLE_PATTERN = /\b(engineer(ing)?|developer|architect|data scientist|scientist|ml|machine learning|technical|software|programmer|devops|sre)\b/i;

function haystack(app: Pick<Application, "role" | "jdParsed">, requirements: string[] = []): string {
  return [
    app.role ?? "",
    ...(app.jdParsed?.keyRequirements ?? []),
    ...(app.jdParsed?.keywords ?? []),
    ...(app.jdParsed?.technicalSkills ?? []),
    ...requirements,
  ].join(" \n ");
}

/** An AI-related JD: the role title, requirements or keywords mention AI work (or the raw JD does, repeatedly). */
export function isAiRelatedJd(app: Pick<Application, "role" | "jdParsed" | "jdRaw">, requirements: string[] = []): boolean {
  if ((haystack(app, requirements).match(AI_PATTERN) ?? []).length > 0) return true;
  return ((app.jdRaw ?? "").match(AI_PATTERN) ?? []).length >= 3;
}

/** A technical role: engineering/ML archetype, or a technical role title. */
export function isTechnicalJd(app: Pick<Application, "role">, archetype?: ResumeArchetype | null): boolean {
  return archetype === "ai_ml_engineering" || TECHNICAL_ROLE_PATTERN.test(app.role ?? "");
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "into", "over", "across", "your", "you", "are", "was",
  "were", "has", "have", "had", "will", "our", "their", "they", "who", "able", "years", "year", "experience",
  "strong", "ability", "work", "working", "including", "such", "other", "role", "team", "teams", "within",
]);

export function tokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2 && !STOPWORDS.has(t)),
  );
}

/** Token set describing what this JD asks for: its top requirements first, then the parsed JD. */
export function jdRelevanceTerms(app: Pick<Application, "role" | "jdParsed">, requirements: string[] = []): Set<string> {
  return tokens(haystack(app, requirements));
}

/** How many JD terms a text shares: a deterministic relevance signal for bullets the model did not rank. */
export function keywordOverlap(text: string, terms: Set<string>): number {
  let n = 0;
  for (const t of tokens(text)) if (terms.has(t)) n++;
  return n;
}
