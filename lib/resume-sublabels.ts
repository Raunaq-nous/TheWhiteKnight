// Experience sub-labels (spec Part 8/9): CONSULTING ENGAGEMENTS, then AI
// BUILDS AND PROCESS REINVENTION. Client-safe (no docx dependency), so the
// on-screen preview, the DOCX builder and the layout estimate share ONE rule.
//
// Categories are STORED, never guessed: a bullet's category comes from its
// profile entry's bulletTags, assigned once when the bullet is written
// (lib/bullet-category.ts). An untagged bullet is a consulting engagement;
// there is no keyword fallback, because keywords misfile real work (a
// go-to-market engagement that mentions "AI-based" platforms is still an
// engagement).

import type { ResumeBullet } from "./resume-schema";

export const CONSULTING_ENGAGEMENTS_LABEL = "CONSULTING ENGAGEMENTS";
export const AI_BUILDS_LABEL = "AI BUILDS AND PROCESS REINVENTION";
export type SubLabel = typeof CONSULTING_ENGAGEMENTS_LABEL | typeof AI_BUILDS_LABEL;

/** The stored category decides; untagged means consulting engagement. */
export function resolveExperienceBulletLabel(bullet: Pick<ResumeBullet, "category"> & Partial<ResumeBullet>): SubLabel {
  return bullet.category === "ai_build" ? AI_BUILDS_LABEL : CONSULTING_ENGAGEMENTS_LABEL;
}

// A founder/owner role is not a consulting engagement list, whatever its
// bullets are tagged: it always renders flat.
const FOUNDER_ROLE_PATTERN = /\b(co-?founder|founder|owner)\b/i;

type Groupable = Pick<ResumeBullet, "text" | "category" | "priority">;

/**
 * A role's bullets grouped under sub-labels, or null when the role renders a
 * flat list. Sub-labels appear only on a role with bullets in BOTH
 * categories (and never on a founder role); a single-category role is flat.
 * Consulting first, then AI builds; priority order within each group.
 */
export function roleSubLabelGroups<B extends Groupable>(entry: { role?: string | null; bullets: B[] }): { label: SubLabel; bullets: B[] }[] | null {
  if (FOUNDER_ROLE_PATTERN.test(entry.role ?? "")) return null;
  const sorted = [...entry.bullets].sort((a, b) => a.priority - b.priority);
  const groups = ([CONSULTING_ENGAGEMENTS_LABEL, AI_BUILDS_LABEL] as SubLabel[])
    .map(label => ({ label, bullets: sorted.filter(b => resolveExperienceBulletLabel(b) === label) }));
  return groups.every(g => g.bullets.length > 0) ? groups : null;
}

/** True when at least one role in the content renders sub-labels. */
export function anyRoleUsesSubLabels(experience: { role?: string | null; bullets: Groupable[] }[]): boolean {
  return experience.some(e => roleSubLabelGroups(e) !== null);
}
