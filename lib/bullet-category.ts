// WRITE-TIME BULLET CATEGORIES. A bullet's sub-label category is assigned
// ONCE, when the bullet is written into the profile, and stored in its
// entry's bulletTags; rendering only reads it (lib/resume-sublabels.ts) and
// never guesses. Client-safe: every profile write path runs in the browser.
//
// Where the category comes from, per write path:
//   - enrich-from-text, portfolio pull: classified server-side by the model
//     (lib/server/bullet-classifier.ts) and carried on the candidate as
//     bulletCategories, stored when the merge item is accepted
//     (applyMergeDiffItem).
//   - gap-fill: the gap-answer route classifies the new bullet.
//   - interviewer (rewrite in place): the rewritten bullet keeps the old
//     bullet's stored category; an untagged legacy bullet takes the
//     rewrite route's classification.
// Anything that still arrives without a category is stored as a consulting
// engagement, the same meaning an untagged bullet has at render time.

import type { BulletCategory, ExperienceEntry } from "./profile";

export const DEFAULT_BULLET_CATEGORY: BulletCategory = "consulting_engagement";

/** Any model/route value to a stored category: only an explicit "ai_build" is an AI build. */
export function parseBulletCategory(value: unknown): BulletCategory {
  return value === "ai_build" ? "ai_build" : DEFAULT_BULLET_CATEGORY;
}

/** Stores a category for each given bullet text on the entry (texts not in the entry are ignored). */
export function storeBulletCategories<E extends Pick<ExperienceEntry, "bullets" | "bulletTags">>(
  entry: E,
  categories: Record<string, BulletCategory | null | undefined> | Array<[string, BulletCategory | null | undefined]>,
): E {
  const present = new Set(entry.bullets.split("\n").map(b => b.trim()).filter(Boolean));
  const pairs = Array.isArray(categories) ? categories : Object.entries(categories);
  const bulletTags: Record<string, BulletCategory> = { ...(entry.bulletTags ?? {}) };
  for (const [text, category] of pairs) {
    const t = text.trim();
    if (present.has(t)) bulletTags[t] = parseBulletCategory(category);
  }
  return { ...entry, bulletTags };
}

/**
 * Moves a bullet's stored category (and imported marker) from its old text
 * to its rewritten text. When the old text had no category, `fallback` (the
 * rewrite route's classification) is stored instead.
 */
export function carryBulletCategory<E extends Pick<ExperienceEntry, "bulletTags" | "importedBullets">>(
  entry: E,
  oldText: string,
  newText: string,
  fallback?: BulletCategory | null,
): E {
  const tags: Record<string, BulletCategory> = { ...(entry.bulletTags ?? {}) };
  const category = tags[oldText.trim()] ?? parseBulletCategory(fallback);
  delete tags[oldText.trim()];
  tags[newText.trim()] = category;
  const imported = entry.importedBullets?.map(b => (b.trim() === oldText.trim() ? newText.trim() : b));
  return { ...entry, bulletTags: tags, ...(imported ? { importedBullets: imported } : {}) };
}
