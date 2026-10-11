// Experience sub-labels (spec Part 8/9): CONSULTING ENGAGEMENTS, then AI
// BUILDS AND PROCESS REINVENTION. Client-safe (no docx dependency), so the
// on-screen preview and the DOCX builder group bullets with ONE rule.

import type { ResumeBullet, ResumeContent } from "./resume-schema";
import type { ResumeArchetype } from "./resume-archetype";

export const CONSULTING_ENGAGEMENTS_LABEL = "CONSULTING ENGAGEMENTS";
export const AI_BUILDS_LABEL = "AI BUILDS AND PROCESS REINVENTION";
export type SubLabel = typeof CONSULTING_ENGAGEMENTS_LABEL | typeof AI_BUILDS_LABEL;

// Deterministic, content-derived fallback for bullets with no explicit tag:
// a bullet naming a build/platform/tool reads as an AI build; anything else
// reads as a client engagement. Never changes which bullets were selected.
const AI_BUILD_PATTERN = /\b(ai|artificial intelligence|platform|toolkit|cockpit|studio|agent|agentic|algorithm|automat\w*|software|engine|dashboard|application|generative|machine learning|\bml\b|pipeline|knowledge graph)\b/i;

export function classifyExperienceBulletLabel(text: string): SubLabel {
  return AI_BUILD_PATTERN.test(text) ? AI_BUILDS_LABEL : CONSULTING_ENGAGEMENTS_LABEL;
}

/** An explicit category tag (from the profile's bulletTags) always wins over the keyword heuristic. */
export function resolveExperienceBulletLabel(bullet: Pick<ResumeBullet, "text" | "category"> & Partial<ResumeBullet>): SubLabel {
  if (bullet.category === "ai_build") return AI_BUILDS_LABEL;
  if (bullet.category === "consulting_engagement") return CONSULTING_ENGAGEMENTS_LABEL;
  return classifyExperienceBulletLabel(bullet.text);
}

/**
 * Sub-labels render for the consulting archetype, and for any resume whose
 * bullets carry explicit category tags (the tags are a real fact about the
 * bullet, so they shouldn't disappear just because detection picked a
 * different archetype).
 */
export function usesSubLabels(content: Pick<ResumeContent, "experience">, archetype?: ResumeArchetype | null): boolean {
  if (archetype === "consulting") return true;
  return content.experience.some(e => e.bullets.some(b => b.category === "consulting_engagement" || b.category === "ai_build"));
}

/** A role's bullets in render order, grouped under sub-labels; a band with no bullets is omitted. */
export function groupBulletsBySubLabel<B extends Pick<ResumeBullet, "text" | "category" | "priority">>(bullets: B[]): { label: SubLabel; bullets: B[] }[] {
  const sorted = [...bullets].sort((a, b) => a.priority - b.priority);
  return ([CONSULTING_ENGAGEMENTS_LABEL, AI_BUILDS_LABEL] as SubLabel[])
    .map(label => ({ label, bullets: sorted.filter(b => resolveExperienceBulletLabel(b) === label) }))
    .filter(g => g.bullets.length > 0);
}
