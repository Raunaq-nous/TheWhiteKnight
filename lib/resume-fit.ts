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
 * left to trim.
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
 */
export function decideFitAction(
  content: ResumeContent,
  ratio: number,
  currentDensity: number,
  underflowThreshold = 0.94,
): FitAction {
  if (ratio > 1) {
    const trimmed = trimLowestPriorityBullet(content);
    if (trimmed) return { kind: "trim", content: trimmed };
    return { kind: "done" }; // nothing left to trim; accept slight overflow
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
