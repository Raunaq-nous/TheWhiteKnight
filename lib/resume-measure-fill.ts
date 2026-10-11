// MEASURE-AND-FILL. The fill (lib/resume-fill.ts) sizes content from an
// estimate; this loop corrects it against the REAL rendered PDF on export.
//   2 pages, page two < 50% full  -> add the next-best reserve bullets, re-render
//   3+ pages                      -> drop the lowest-ranked bullet(s), re-render
// At most 8 measure/adjust iterations. Falls back to one page only when the
// reserve is exhausted and page two is still under-filled. Under-fill never
// blocks export while unused bullets exist.
//
// The measurement is injected so the loop is testable without LibreOffice.

import type { ResumeContent } from "./resume-schema";
import type { ResumeArchetype } from "./resume-archetype";
import { clampToOnePageBudget, FILL_TARGETS } from "./resume-budget";
import { isSameEngagement } from "./resume-fill";
import { DOCX_METRICS } from "./resume-layout-estimate";
import { PAGE_TWO_MIN_FILL_PERCENT } from "./resume-pdf-extract-gate";

export type Measurement = { pageCount: number; pageTwoFillPercent: number | null };
export type MeasureFn = (content: ResumeContent, maxPages: number) => Promise<Measurement>;

export type FillStep = {
  iteration: number;
  pageCount: number;
  pageTwoFillPercent: number | null;
  action: "ok" | "added" | "dropped" | "fallback-one-page" | "iterations-exhausted" | "reserve-exhausted";
  ids: string[];
};

export type MeasureFillResult = {
  content: ResumeContent;
  maxPages: number;
  measurement: Measurement;
  steps: FillStep[];
  addedIds: string[];
  droppedIds: string[];
  // True when the final PDF is still under-filled AND reserve bullets remain
  // (iterations ran out). Export proceeds; the density check doesn't block.
  underfilledWithReserve: boolean;
};

export const MAX_FILL_ITERATIONS = 8;

const bulletLines = (text: string) => Math.ceil(text.length / DOCX_METRICS[2].bulletChars) + 0.05;

function allBulletTexts(c: ResumeContent): string[] {
  return [...c.experience.flatMap(e => e.bullets.map(b => b.text)), ...(c.keyWins ?? [])];
}

/**
 * Adds reserve bullets worth about `deficitLines`, best-ranked first, while
 * keeping roles level: a per-role cap starts one above the smallest role and
 * rises a step at a time, so additions spread across employers instead of
 * all landing on the role with the deepest reserve. Returns the ids added.
 */
export function addFromReserve(content: ResumeContent, deficitLines: number): { content: ResumeContent; ids: string[] } {
  let reserve = [...(content.reserve ?? [])];
  const experience = content.experience.map(e => ({ ...e, bullets: [...e.bullets] }));
  let maxPriority = Math.max(0, ...experience.flatMap(e => e.bullets.map(b => b.priority)));
  const texts = allBulletTexts(content);
  const ids: string[] = [];
  let gained = 0;
  const done = () => gained >= deficitLines && ids.length > 0;

  // Reserve bullets that repeat an engagement already on the page never fit.
  reserve = reserve.filter(r => !texts.some(t => isSameEngagement(t, r.text)));
  const hasEntry = (company: string) => experience.some(e => e.company === company);
  const startCap = Math.max(FILL_TARGETS.perRoleTarget, Math.min(...experience.map(e => e.bullets.length))) + 1;
  const topCap = Math.max(startCap, ...experience.map(e => e.bullets.length)) + reserve.length;

  for (let cap = startCap; cap <= topCap && !done() && reserve.some(r => hasEntry(r.company)); cap++) {
    for (const r of [...reserve]) {
      if (done()) break;
      const entry = experience.find(e => e.company === r.company);
      if (!entry || entry.bullets.length >= cap) continue;
      if (texts.some(t => isSameEngagement(t, r.text))) { reserve = reserve.filter(x => x !== r); continue; }
      entry.bullets.push({ sourceBulletId: r.sourceBulletId, text: r.text, priority: ++maxPriority, category: r.category ?? null });
      texts.push(r.text);
      ids.push(r.sourceBulletId);
      gained += bulletLines(r.text);
      reserve = reserve.filter(x => x !== r);
    }
  }
  return { content: { ...content, experience, reserve }, ids };
}

/** Drops the lowest-ranked bullet, from a role that keeps at least the per-employer floor where possible. */
export function dropLowestRanked(content: ResumeContent): { content: ResumeContent; id: string | null } {
  const floor = FILL_TARGETS.perEmployerMin;
  const pick = (minKeep: number) => {
    let best: { ei: number; bi: number; priority: number } | null = null;
    content.experience.forEach((e, ei) => {
      if (e.bullets.length <= minKeep) return;
      e.bullets.forEach((b, bi) => { if (!best || b.priority > best.priority) best = { ei, bi, priority: b.priority }; });
    });
    return best as { ei: number; bi: number; priority: number } | null;
  };
  const target = pick(floor) ?? pick(1);
  if (!target) return { content, id: null };
  const removed = content.experience[target.ei].bullets[target.bi];
  const experience = content.experience.map((e, ei) => ei === target.ei ? { ...e, bullets: e.bullets.filter((_, bi) => bi !== target.bi) } : e);
  // Not returned to the reserve: re-adding it would only overflow again.
  return { content: { ...content, experience }, id: removed.sourceBulletId };
}

export async function measureAndFill(
  start: ResumeContent,
  archetype: ResumeArchetype,
  maxPages: number,
  measure: MeasureFn,
  maxIterations: number = MAX_FILL_ITERATIONS,
): Promise<MeasureFillResult> {
  let content = start;
  let pages = maxPages;
  const steps: FillStep[] = [];
  const addedIds: string[] = [];
  const droppedIds: string[] = [];
  let m: Measurement = { pageCount: 0, pageTwoFillPercent: null };
  let lastAdded = 0;

  for (let i = 1; i <= maxIterations; i++) {
    m = await measure(content, pages);
    const underfilled = pages >= 2 && m.pageCount === 2 && m.pageTwoFillPercent !== null && m.pageTwoFillPercent < PAGE_TWO_MIN_FILL_PERCENT;
    const overflow = m.pageCount >= 3;
    if (!underfilled && !overflow) { steps.push({ iteration: i, ...m, action: "ok", ids: [] }); break; }

    if (overflow) {
      if (i === maxIterations) { steps.push({ iteration: i, ...m, action: "iterations-exhausted", ids: [] }); break; }
      // Drop the lowest-ranked bullet. When the overflow came straight from a
      // multi-bullet addition, drop half of that batch at once (those are the
      // lowest-ranked bullets on the page) so the loop converges in a few
      // iterations instead of one bullet per re-render.
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

    // Under-filled page two: add roughly the missing lines plus a margin.
    // Once something has been dropped for overflow, add one bullet at a time
    // so the loop converges instead of bouncing between 2 and 3 pages.
    const per = DOCX_METRICS[2].linesPerPage;
    const deficit = droppedIds.length > 0 ? 0 : Math.ceil(((PAGE_TWO_MIN_FILL_PERCENT + 8 - (m.pageTwoFillPercent ?? 0)) / 100) * per);
    const r = addFromReserve(content, deficit);
    if (r.ids.length === 0) {
      // Candidates exhausted: the honest result is one page. Checked before
      // the iteration cap, so an empty reserve always falls back.
      steps.push({ iteration: i, ...m, action: "reserve-exhausted", ids: [] });
      content = clampToOnePageBudget(content, archetype, 1);
      pages = 1;
      m = await measure(content, pages);
      steps.push({ iteration: i + 1, ...m, action: "fallback-one-page", ids: [] });
      break;
    }
    // No measurement left to check another addition against.
    if (i === maxIterations) { steps.push({ iteration: i, ...m, action: "iterations-exhausted", ids: [] }); break; }
    content = r.content;
    addedIds.push(...r.ids);
    lastAdded = r.ids.length;
    steps.push({ iteration: i, ...m, action: "added", ids: r.ids });
  }

  const stillUnderfilled = pages >= 2 && m.pageCount === 2 && m.pageTwoFillPercent !== null && m.pageTwoFillPercent < PAGE_TWO_MIN_FILL_PERCENT;
  return {
    content, maxPages: pages, measurement: m, steps, addedIds, droppedIds,
    underfilledWithReserve: stillUnderfilled && (content.reserve?.length ?? 0) > 0,
  };
}
