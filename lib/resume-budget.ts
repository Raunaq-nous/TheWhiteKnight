// Structural one-page guarantee — layer 2 of 3 (see lib/prompts.ts for layer
// 1's generation budget, app/resume-document.tsx for layer 3's fixed print
// layout). This is the deterministic backstop: it enforces hard content
// limits regardless of what the model actually returned, with NO browser
// measurement involved. Replaces the old measure-trim-expand JS fit loop,
// which patched around unbounded generation instead of bounding it upfront.

import { ResumeContent, ResumeBullet } from "./resume-schema";
import { RESUME_SPECS, ResumeArchetype } from "./resume-archetype";

export const ONE_PAGE_BUDGET = {
  // "Exactly 2 lines, max" for the summary — ~100 chars/line at this layout.
  summaryMaxChars: 200,
  keyImpactMaxItems: 4,
  keyImpactItemMaxChars: 150,
  // Per-entry ceiling: a role with several distinct engagements (e.g. a
  // consulting stint covering 4 separate client projects) can show up to 4
  // SEPARATE bullets — never collapsed into one generic summary bullet.
  bulletsPerRoleMax: 4,
  // Global ceiling across ALL entries combined — keeps the page one page
  // even when every entry maxes out its per-role count; trimmed by relevance
  // (lowest priority first, across entries) rather than per-entry, so the
  // most JD-relevant role keeps more bullets than a barely-relevant one.
  totalExperienceBulletsMax: 12,
  bulletMaxChars: 150,
  skillsMaxCategories: 3,
  skillsMaxItemsPerCategory: 6,
  educationMaxEntries: 2,
} as const;

/**
 * Cuts text to at most maxChars: prefers breaking at the end of the last
 * full sentence that fits, falls back to the last word boundary. Never cuts
 * mid-word and never appends an ellipsis or other filler.
 */
export function clampText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const window = trimmed.slice(0, maxChars);
  const lastSentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (lastSentenceEnd > maxChars * 0.4) return window.slice(0, lastSentenceEnd + 1).trim();
  const lastSpace = window.lastIndexOf(" ");
  if (lastSpace > 0) return window.slice(0, lastSpace).trim();
  return window.trim();
}

function topBulletsByPriority(bullets: ResumeBullet[], max: number): ResumeBullet[] {
  return [...bullets]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, max)
    .map(b => ({ ...b, text: clampText(b.text, ONE_PAGE_BUDGET.bulletMaxChars) }));
}

/**
 * Second-stage trim: after each entry is capped individually to
 * bulletsPerRoleMax, the TOTAL across all entries combined might still
 * exceed the one-page budget (e.g. 5 roles at 4 bullets each = 20). Trims
 * the single globally-lowest-priority bullet (highest priority number)
 * across ALL entries, one at a time, until the total fits — never emptying
 * an entry down to zero. This is the "final clamp trims the lowest-
 * relevance bullet if it still overflows" behavior: a deterministic,
 * one-shot pass over already-known data, not a browser measure-and-trim
 * loop — it never inspects rendered height and never iterates more than
 * the number of bullets that actually need trimming.
 */
function trimToGlobalBulletBudget(
  experience: ResumeContent["experience"],
  maxTotal: number,
): ResumeContent["experience"] {
  const entries = experience.map(e => ({ ...e, bullets: [...e.bullets] }));
  let total = entries.reduce((n, e) => n + e.bullets.length, 0);

  while (total > maxTotal) {
    let worst: { entryIdx: number; bulletIdx: number; priority: number } | null = null;
    entries.forEach((e, entryIdx) => {
      if (e.bullets.length <= 1) return; // never empty an entry entirely
      e.bullets.forEach((b, bulletIdx) => {
        if (!worst || b.priority > worst.priority) {
          worst = { entryIdx, bulletIdx, priority: b.priority };
        }
      });
    });
    if (!worst) break; // every entry is already down to its last bullet
    const { entryIdx, bulletIdx } = worst;
    entries[entryIdx] = { ...entries[entryIdx], bullets: entries[entryIdx].bullets.filter((_, j) => j !== bulletIdx) };
    total--;
  }

  return entries;
}

/**
 * Deterministically enforces the one-page content budget on generated resume
 * content, and nulls out any section this archetype's layout doesn't render.
 * The null-out step is what guarantees a section like "education" renders
 * LAST even though resolveSectionSequence's forgotten-content-bearing-key
 * safety net would otherwise re-append a stray section (e.g. leadership)
 * after it — nulled data renders nothing, regardless of where the key ends
 * up in the resolved sequence.
 *
 * Pure and idempotent — no DOM, no measurement. This is the structural
 * guarantee; it never needs to run more than once.
 */
export function clampToOnePageBudget(content: ResumeContent, archetype: ResumeArchetype): ResumeContent {
  const seq = RESUME_SPECS[archetype].sectionSequence;
  const usesSelectedImpact = seq.includes("selectedImpact");

  const perEntryCapped = content.experience.map(e => ({
    ...e,
    bullets: topBulletsByPriority(e.bullets, ONE_PAGE_BUDGET.bulletsPerRoleMax),
  }));

  const clamped: ResumeContent = {
    ...content,
    summary: content.summary ? clampText(content.summary, ONE_PAGE_BUDGET.summaryMaxChars) : content.summary,
    experience: trimToGlobalBulletBudget(perEntryCapped, ONE_PAGE_BUDGET.totalExperienceBulletsMax),
    skills: content.skills
      .slice(0, ONE_PAGE_BUDGET.skillsMaxCategories)
      .map(g => ({ ...g, items: g.items.slice(0, ONE_PAGE_BUDGET.skillsMaxItemsPerCategory) })),
    education: content.education
      .slice(0, ONE_PAGE_BUDGET.educationMaxEntries)
      .map(ed => ({ ...ed, achievements: null })),
  };

  if (!seq.includes("leadership")) clamped.leadership = null;
  if (!seq.includes("certifications")) clamped.certifications = null;

  if (usesSelectedImpact) {
    // Combined Key Projects & Impact band — the total item count across both
    // arrays is what's capped, since they render together as one list.
    const keptWins = (content.keyWins ?? []).slice(0, ONE_PAGE_BUDGET.keyImpactMaxItems);
    const remaining = ONE_PAGE_BUDGET.keyImpactMaxItems - keptWins.length;
    const keptProjects = remaining > 0 ? (content.projects ?? []).slice(0, remaining) : [];
    clamped.keyWins = keptWins.map(w => clampText(w, ONE_PAGE_BUDGET.keyImpactItemMaxChars));
    clamped.projects = keptProjects.map(p => ({ ...p, description: clampText(p.description, ONE_PAGE_BUDGET.keyImpactItemMaxChars) }));
  } else {
    clamped.keyWins = seq.includes("keyWins")
      ? (content.keyWins ?? []).slice(0, ONE_PAGE_BUDGET.keyImpactMaxItems).map(w => clampText(w, ONE_PAGE_BUDGET.keyImpactItemMaxChars))
      : null;
    clamped.projects = seq.includes("projects")
      ? (content.projects ?? []).slice(0, ONE_PAGE_BUDGET.keyImpactMaxItems).map(p => ({ ...p, description: clampText(p.description, ONE_PAGE_BUDGET.keyImpactItemMaxChars) }))
      : null;
  }

  return clamped;
}

// Rough line-count estimate for the rendered document, used only to verify
// (in tests) that budget-clamped content structurally fits a single letter
// page — a proxy for the real browser measurement, since this repo's test
// environment has no DOM/print renderer available.
const CHARS_PER_LINE = 92;
const textLines = (s: string) => Math.max(1, Math.ceil(s.length / CHARS_PER_LINE));

export function estimateResumeLineCount(content: ResumeContent, archetype: ResumeArchetype): number {
  const seq = RESUME_SPECS[archetype].sectionSequence;
  let lines = 2; // name + contact line

  for (const key of seq) {
    if (key === "summary" && content.summary?.trim()) {
      lines += 1 + textLines(content.summary);
    } else if (key === "selectedImpact") {
      const items = (content.keyWins?.length ?? 0) + (content.projects?.length ?? 0);
      if (items > 0) lines += 1 + items;
    } else if (key === "keyWins" && content.keyWins?.length) {
      lines += 1 + content.keyWins.length;
    } else if (key === "projects" && content.projects?.length) {
      lines += 1 + content.projects.length;
    } else if (key === "experience" && content.experience.length > 0) {
      lines += 1;
      for (const e of content.experience) {
        lines += 1 + (e.location ? 1 : 0) + e.bullets.length;
      }
    } else if (key === "education" && content.education.length > 0) {
      lines += 1;
      for (const ed of content.education) lines += 2 + (ed.achievements?.length ?? 0);
    } else if (key === "skills" && content.skills.length > 0) {
      lines += 1 + content.skills.length;
    } else if (key === "leadership" && content.leadership?.length) {
      lines += 1 + content.leadership.length;
    } else if (key === "certifications" && content.certifications?.length) {
      lines += 1 + content.certifications.length;
    }
  }

  return lines;
}

// A letter page's usable height at the fixed print font/line-height in
// app/resume-document.tsx comfortably holds this many text lines with
// margin to spare — used as the pass/fail line in tests, not at runtime.
export const MAX_LINES_PER_PAGE = 55;
