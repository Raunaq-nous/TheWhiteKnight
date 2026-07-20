// Pure, unit-testable one-page fit logic. The actual DOM measurement lives in
// app/resume-document.tsx (real browser layout); this module only decides
// WHAT to trim or expand once given a fit signal, so the decision logic can
// be tested without a browser.

import { ResumeContent } from "./resume-schema";

export type FitAction =
  | { kind: "trim"; content: ResumeContent }
  | { kind: "expand"; density: number }
  | { kind: "done" };

export const MIN_DENSITY = 1.0;
export const MAX_DENSITY = 1.25;
export const DENSITY_STEP = 0.05;

/**
 * Returns a copy of the content with the single lowest-priority (highest
 * priority number = least relevant) bullet removed, across all experience
 * entries. Never removes an entry's last remaining bullet, and never removes
 * an experience entry itself — only trims bullets. Returns null if nothing
 * left to trim (every entry is already down to 1 bullet).
 */
export function trimLowestPriorityBullet(content: ResumeContent): ResumeContent | null {
  let worst: { entryIdx: number; bulletIdx: number; priority: number } | null = null;

  content.experience.forEach((entry, entryIdx) => {
    if (entry.bullets.length <= 1) return; // never fully empty a role
    entry.bullets.forEach((bullet, bulletIdx) => {
      if (!worst || bullet.priority > worst.priority) {
        worst = { entryIdx, bulletIdx, priority: bullet.priority };
      }
    });
  });

  if (!worst) return null;

  const { entryIdx, bulletIdx } = worst as { entryIdx: number; bulletIdx: number; priority: number };
  const experience = content.experience.map((entry, i) => {
    if (i !== entryIdx) return entry;
    return { ...entry, bullets: entry.bullets.filter((_, j) => j !== bulletIdx) };
  });

  return { ...content, experience };
}

/**
 * Full trim cascade for the one-page fit loop. trimLowestPriorityBullet
 * alone can only shrink experience — it has no way to reduce keyWins,
 * projects, leadership, or certifications, so a resume that overflows
 * because of those sections (not experience bullet count) would exhaust
 * every bullet trim, still overflow, and the fit loop would silently give
 * up and report "fitted" while genuinely printing a 2nd page. This tries,
 * in order, every kind of trimmable content until something actually
 * shrinks, or returns null once truly nothing is left to cut.
 *
 * Order: experience bullets (down to 1/role) -> keyWins -> projects ->
 * leadership -> certifications. Bullets go first because they're the most
 * numerous/least individually load-bearing; the other sections are cut
 * from the end (assumed already ordered most-to-least relevant upstream).
 */
export function trimLowestPriorityItem(content: ResumeContent): ResumeContent | null {
  const bulletTrimmed = trimLowestPriorityBullet(content);
  if (bulletTrimmed) return bulletTrimmed;

  if (content.keyWins && content.keyWins.length > 0) {
    return { ...content, keyWins: content.keyWins.slice(0, -1) };
  }
  if (content.projects && content.projects.length > 0) {
    return { ...content, projects: content.projects.slice(0, -1) };
  }
  if (content.leadership && content.leadership.length > 0) {
    return { ...content, leadership: content.leadership.slice(0, -1) };
  }
  if (content.certifications && content.certifications.length > 0) {
    return { ...content, certifications: content.certifications.slice(0, -1) };
  }
  return null;
}

/** Next density step up, capped at MAX_DENSITY. Returns null if already maxed. */
export function nextDensity(current: number): number | null {
  const next = Math.round((current + DENSITY_STEP) * 100) / 100;
  if (next > MAX_DENSITY) return null;
  return next;
}

/**
 * Decide the next fit action given a measured overflow ratio:
 * ratio = renderedHeight / targetHeight. > 1 means overflow (must trim),
 * meaningfully < 1 means underflow (may expand density to fill the page).
 * "done" while ratio > 1 only happens when trimLowestPriorityItem returns
 * null — i.e. there is truly nothing left in the document to cut.
 */
export function decideFitAction(
  content: ResumeContent,
  ratio: number,
  currentDensity: number,
  underflowThreshold = 0.94,
): FitAction {
  if (ratio > 1) {
    const trimmed = trimLowestPriorityItem(content);
    if (trimmed) return { kind: "trim", content: trimmed };
    return { kind: "done" }; // nothing left to trim; accept the overflow as a last resort
  }
  if (ratio < underflowThreshold) {
    const next = nextDensity(currentDensity);
    if (next !== null) return { kind: "expand", density: next };
  }
  return { kind: "done" };
}

/** Rough word count across summary + all bullets — used for quick sanity checks, not layout. */
export function estimateWordCount(content: ResumeContent): number {
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  let total = words(content.summary);
  for (const e of content.experience) for (const b of e.bullets) total += words(b.text);
  return total;
}
