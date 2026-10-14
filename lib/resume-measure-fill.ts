// MEASURE-AND-FILL. The selection (lib/resume-fill.ts) sizes content from
// an estimate; this loop checks it against the REAL rendered PDF on export.
//   2 pages, page two < 50% full -> add the next reserve bullets, re-render
//   3+ pages                     -> drop the lowest-ranked bullet(s), re-render
// The reserve holds only quality-eligible bullets above the relevance
// threshold, and additions respect the recency taper (lib/resume-budget.ts
// taperFor), so this never pads. When eligible content runs out before page
// two is half full, the loop stops and export proceeds WITH A WARNING:
// never padding, never blocking, never collapsing to one page.
// At most 8 measure/adjust iterations.
//
// The measurement is injected so the loop is testable without LibreOffice.

import type { ResumeContent, ReserveBullet } from "./resume-schema";
import type { ResumeArchetype } from "./resume-archetype";
import { FILL_TARGETS, taperFor } from "./resume-budget";
import { isSameEngagement } from "./resume-fill";
import { DOCX_METRICS } from "./resume-layout-estimate";
import { PAGE_TWO_MIN_FILL_PERCENT } from "./resume-pdf-extract-gate";

export type Measurement = { pageCount: number; pageTwoFillPercent: number | null };
export type MeasureFn = (content: ResumeContent, maxPages: number) => Promise<Measurement>;

export type FillStep = {
  iteration: number;
  pageCount: number;
  pageTwoFillPercent: number | null;
  action: "ok" | "added" | "dropped" | "iterations-exhausted" | "content-exhausted";
  ids: string[];
};

export type MeasureFillResult = {
  content: ResumeContent;
  maxPages: number;
  measurement: Measurement;
  steps: FillStep[];
  addedIds: string[];
  droppedIds: string[];
  // True when the final PDF still has page two under half full: export
  // proceeds anyway (the density check doesn't block) and `warning` says why.
  underfilledWithReserve: boolean;
  warning: string | null;
};

export const MAX_FILL_ITERATIONS = 8;

const bulletLines = (text: string) => Math.ceil(text.length / DOCX_METRICS[2].bulletChars) + 0.05;

function allBulletTexts(c: ResumeContent): string[] {
  return c.experience.flatMap(e => e.bullets.map(b => b.text));
}

/** Whether role `ei` may take one more bullet: within its taper, and not ahead of the current role unless that has run out. */
function canAdd(experience: ResumeContent["experience"], ei: number, reserve: ReserveBullet[]): boolean {
  const e = experience[ei];
  if (e.bullets.length >= taperFor(ei, e.role).cap) return false;
  if (ei === 0) return true;
  const current = experience[0];
  const currentExhausted = current.bullets.length >= taperFor(0, current.role).cap || !reserve.some(r => r.company === current.company);
  return currentExhausted || e.bullets.length + 1 <= current.bullets.length;
}

/**
 * Adds reserve bullets worth about `deficitLines`, best-ranked first, each
 * only where the taper allows. Returns the ids added (empty when no
 * eligible addition remains).
 */
export function addFromReserve(content: ResumeContent, deficitLines: number): { content: ResumeContent; ids: string[] } {
  const experience = content.experience.map(e => ({ ...e, bullets: [...e.bullets] }));
  let maxPriority = Math.max(0, ...experience.flatMap(e => e.bullets.map(b => b.priority)));
  const texts = allBulletTexts(content);
  // Reserve bullets repeating an engagement already on the page never fit.
  let reserve = (content.reserve ?? []).filter(r => !texts.some(t => isSameEngagement(t, r.text)));
  const ids: string[] = [];
  let gained = 0;

  while (!(gained >= deficitLines && ids.length > 0)) {
    const pick = reserve.find(r => {
      const ei = experience.findIndex(e => e.company === r.company);
      return ei >= 0 && canAdd(experience, ei, reserve);
    });
    if (!pick) break;
    const entry = experience.find(e => e.company === pick.company)!;
    entry.bullets.push({ sourceBulletId: pick.sourceBulletId, text: pick.text, priority: ++maxPriority, category: pick.category ?? null });
    texts.push(pick.text);
    ids.push(pick.sourceBulletId);
    gained += bulletLines(pick.text);
    reserve = reserve.filter(x => x !== pick && !isSameEngagement(pick.text, x.text));
  }
  return { content: { ...content, experience, reserve }, ids };
}

/**
 * Drops the lowest-ranked bullet, keeping every role at its taper floor
 * where possible, and never from the current role when that would leave an
 * earlier role ahead of it.
 */
export function dropLowestRanked(content: ResumeContent): { content: ResumeContent; id: string | null } {
  const current = content.experience[0];
  const maxOther = Math.max(0, ...content.experience.slice(1).map(e => e.bullets.length));
  const pick = (respectFloors: boolean, protectCurrent: boolean) => {
    let best: { ei: number; bi: number; priority: number } | null = null;
    content.experience.forEach((e, ei) => {
      const minKeep = respectFloors ? taperFor(ei, e.role).floor : 1;
      if (e.bullets.length <= minKeep) return;
      if (protectCurrent && ei === 0 && current && current.bullets.length - 1 < maxOther) return;
      e.bullets.forEach((b, bi) => { if (!best || b.priority > best.priority) best = { ei, bi, priority: b.priority }; });
    });
    return best as { ei: number; bi: number; priority: number } | null;
  };
  const target = pick(true, true) ?? pick(true, false) ?? pick(false, false);
  if (!target) return { content, id: null };
  const removed = content.experience[target.ei].bullets[target.bi];
  const experience = content.experience.map((e, ei) => ei === target.ei ? { ...e, bullets: e.bullets.filter((_, bi) => bi !== target.bi) } : e);
  // Not returned to the reserve: re-adding it would only overflow again.
  return { content: { ...content, experience }, id: removed.sourceBulletId };
}

export const UNDERFILL_WARNING =
  "Page two is under half full: no further bullets meet the quality and JD-relevance bar, so the resume was exported without padding. Add outcome-backed bullets relevant to this JD to the profile to fill it.";

export async function measureAndFill(
  start: ResumeContent,
  _archetype: ResumeArchetype,
  maxPages: number,
  measure: MeasureFn,
  maxIterations: number = MAX_FILL_ITERATIONS,
): Promise<MeasureFillResult> {
  let content = start;
  const steps: FillStep[] = [];
  const addedIds: string[] = [];
  const droppedIds: string[] = [];
  let m: Measurement = { pageCount: 0, pageTwoFillPercent: null };
  let lastAdded = 0;

  for (let i = 1; i <= maxIterations; i++) {
    m = await measure(content, maxPages);
    const underfilled = maxPages >= 2 && m.pageCount === 2 && m.pageTwoFillPercent !== null && m.pageTwoFillPercent < PAGE_TWO_MIN_FILL_PERCENT;
    const overflow = m.pageCount > Math.max(1, maxPages);
    if (!underfilled && !overflow) { steps.push({ iteration: i, ...m, action: "ok", ids: [] }); break; }

    if (overflow) {
      if (i === maxIterations) { steps.push({ iteration: i, ...m, action: "iterations-exhausted", ids: [] }); break; }
      // When the overflow came straight from a multi-bullet addition, drop
      // half of that batch at once so the loop converges in a few renders.
      const count = lastAdded > 1 ? Math.ceil(lastAdded / 2) : 1;
      const ids: string[] = [];
      for (let k = 0; k < count; k++) {
        const r = dropLowestRanked(content);
        if (!r.id) break;
        content = r.content;
        ids.push(r.id);
      }
      droppedIds.push(...ids);
      lastAdded = 0;
      steps.push({ iteration: i, ...m, action: "dropped", ids });
      continue;
    }

    // Under-filled page two: add roughly the missing lines plus a margin;
    // after an overflow drop, one bullet at a time.
    const per = DOCX_METRICS[2].linesPerPage;
    const deficit = droppedIds.length > 0 ? 0 : Math.ceil(((PAGE_TWO_MIN_FILL_PERCENT + 8 - (m.pageTwoFillPercent ?? 0)) / 100) * per);
    const r = addFromReserve(content, deficit);
    if (r.ids.length === 0) {
      // Eligible content ran out: stop and export with a warning.
      steps.push({ iteration: i, ...m, action: "content-exhausted", ids: [] });
      break;
    }
    // No measurement left to check another addition against.
    if (i === maxIterations) { steps.push({ iteration: i, ...m, action: "iterations-exhausted", ids: [] }); break; }
    content = r.content;
    addedIds.push(...r.ids);
    lastAdded = r.ids.length;
    steps.push({ iteration: i, ...m, action: "added", ids: r.ids });
  }

  const stillUnderfilled = maxPages >= 2 && m.pageCount === 2 && m.pageTwoFillPercent !== null && m.pageTwoFillPercent < PAGE_TWO_MIN_FILL_PERCENT;
  return {
    content, maxPages, measurement: m, steps, addedIds, droppedIds,
    underfilledWithReserve: stillUnderfilled,
    warning: stillUnderfilled ? UNDERFILL_WARNING : null,
  };
}

// Kept for callers that size against the same constant.
export const MEASURE_FILL_LINES_PER_PAGE = FILL_TARGETS.linesPerPage;
