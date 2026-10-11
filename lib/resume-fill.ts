// DETERMINISTIC FILL. The model ranks every candidate bullet id by JD
// relevance; this module builds the actual resume selection from that
// ranking and FILLS it to the page target. Before this, the model's own
// pre-trimmed selection was final, and a light selection (13 of 45 bullets)
// produced a two-page PDF with page two ~5% full.
//
// Selection, not writing, is unchanged: every bullet is a real profile
// bullet id, and its text always comes from the profile.

import type { Profile } from "./profile";
import { listProfileBullets } from "./profile-bullets";
import type { ResumeContent, ResumeBullet, ReserveBullet, ResumeExperienceEntry } from "./resume-schema";
import { RESUME_SPECS, type ResumeArchetype } from "./resume-archetype";
import { budgetForMaxPages, FILL_TARGETS, clampBulletPreservingOutcome, OUTCOME_MARKER_PATTERN } from "./resume-budget";
import { impactDensity, outcomeBucket } from "./resume-bullet-relevance";
import { sameEngagement } from "./resume-dedupe";
import { textSimilarity, namesMatch } from "./profile-merge";
import { violatesToolPlacement } from "./resume-tool-placement";
import { estimateDocxLines, DOCX_METRICS } from "./resume-layout-estimate";

export type FillCandidate = {
  id: string;
  company: string;
  text: string;
  category: ResumeBullet["category"];
  relevance: number;
  ranked: boolean;
  density: number;
  score: number;
};

export type FillStats = {
  modelRankedIds: number;
  modelRankedUsable: number;
  selectedFromModel: number;
  addedByFill: number;
  addedByFillIds: string[];
  perEmployer: Record<string, number>;
  experienceBullets: number;
  keyImpactItems: number;
  estimatedLines: number;
  targetLines: number;
  reserveSize: number;
};

export type FillResult = {
  experience: ResumeExperienceEntry[];
  keyWinIds: string[];
  keyWins: string[];
  reserve: ReserveBullet[];
  stats: FillStats;
};

export type FillOptions = {
  // Server-side confidentiality hook: return false for text that would
  // fail the gate even after substitution (block-only terms, never-cite).
  isTextAllowed?: (text: string) => boolean;
};

// Unranked bullets still compete, on impact alone: this is what fills the
// page when the model returns too few ids.
const UNRANKED_RELEVANCE = 0.15;

/** 0..1 relevance per id: bulletRanking first, then any ids the model placed directly (legacy selection output). */
export function rankingFromModel(raw: Pick<ResumeContent, "bulletRanking" | "experience" | "keyWinIds">): Map<string, number> {
  const ranking = new Map<string, number>();
  const put = (id: string | null | undefined, r: number) => {
    if (!id) return;
    const v = Math.max(0, Math.min(1, r));
    ranking.set(id, Math.max(ranking.get(id) ?? 0, v));
  };
  for (const r of raw.bulletRanking ?? []) put(r?.sourceBulletId, r.relevance > 1 ? r.relevance / 100 : r.relevance);
  for (const id of raw.keyWinIds ?? []) put(id, 0.95);
  for (const e of raw.experience ?? []) for (const b of e.bullets ?? []) put(b.sourceBulletId, 0.9 - Math.min(0.5, ((b.priority ?? 1) - 1) * 0.03));
  return ranking;
}

export function impactFactor(text: string): number {
  return 1 + 0.25 * Math.min(3, impactDensity(text)) + 0.1 * outcomeBucket(text);
}

export function isSameEngagement(a: string, b: string): boolean {
  return textSimilarity(a, b) >= 0.6 || sameEngagement(a, b);
}

export function buildCandidates(profile: Profile, ranking: Map<string, number>, maxPages: number, opts: FillOptions = {}): FillCandidate[] {
  const maxChars = budgetForMaxPages(maxPages).bulletMaxChars;
  const out: FillCandidate[] = [];
  for (const ref of listProfileBullets(profile)) {
    if (ref.sourceType !== "experience") continue;
    const text = ref.text.length <= maxChars ? ref.text : clampBulletPreservingOutcome(ref.text, maxChars);
    if (!text) continue;
    if (opts.isTextAllowed && !opts.isTextAllowed(text)) continue;
    if (violatesToolPlacement(text, ref.sourceId)) continue;
    const ranked = ranking.has(ref.id);
    const relevance = ranked ? ranking.get(ref.id)! : UNRANKED_RELEVANCE;
    const density = impactDensity(text);
    out.push({ id: ref.id, company: ref.sourceId, text, category: ref.category ?? null, relevance, ranked, density, score: relevance * impactFactor(text) });
  }
  // Ties broken by profile order, so the result is deterministic.
  return out.map((c, i) => ({ c, i })).sort((a, b) => b.c.score - a.c.score || a.i - b.i).map(x => x.c);
}

function usesImpactBand(archetype: ResumeArchetype): boolean {
  const spec = RESUME_SPECS[archetype];
  return spec.sectionSequence.includes("selectedImpact") || Boolean(spec.includeKeyWins);
}

function targetsFor(maxPages: number) {
  const budget = budgetForMaxPages(maxPages);
  if (maxPages >= 2) {
    return {
      keyImpactMin: FILL_TARGETS.keyImpactMin, keyImpactMax: FILL_TARGETS.keyImpactMax,
      perEmployerMin: FILL_TARGETS.perEmployerMin, perRoleTarget: FILL_TARGETS.perRoleTarget,
      totalMin: FILL_TARGETS.totalMin, totalTarget: FILL_TARGETS.totalTarget,
      targetLines: FILL_TARGETS.targetLines,
    };
  }
  const per = DOCX_METRICS[1].linesPerPage;
  return {
    keyImpactMin: Math.min(3, budget.keyImpactMaxItems), keyImpactMax: budget.keyImpactMaxItems,
    perEmployerMin: 2, perRoleTarget: budget.bulletsPerRoleMax,
    totalMin: Math.min(8, budget.totalExperienceBulletsMax), totalTarget: budget.totalExperienceBulletsMax,
    targetLines: Math.round(per * 0.92),
  };
}

/**
 * Builds experience + Key Projects from the ranking and fills to the page
 * target. `base` supplies everything the fill doesn't own (summary, skills,
 * education, sequence) so the layout estimate sees the whole document.
 */
export function buildFilledSelection(
  profile: Profile,
  base: ResumeContent,
  archetype: ResumeArchetype,
  maxPages: number,
  opts: FillOptions = {},
): FillResult {
  const ranking = rankingFromModel(base);
  const pool = buildCandidates(profile, ranking, maxPages, opts);
  const t = targetsFor(maxPages);

  const chosen: FillCandidate[] = [];
  const isDup = (c: FillCandidate) => chosen.some(x => isSameEngagement(x.text, c.text));

  // 1. Key Projects band: the strongest quantified items, across employers.
  const band: FillCandidate[] = [];
  if (usesImpactBand(archetype)) {
    const perCompany = new Map<string, number>();
    const take = (requireNumber: boolean) => {
      for (const c of pool) {
        if (band.length >= t.keyImpactMax) break;
        if (band.includes(c) || (requireNumber && c.density === 0)) continue;
        if ((perCompany.get(c.company) ?? 0) >= 2 || isDup(c)) continue;
        band.push(c); chosen.push(c);
        perCompany.set(c.company, (perCompany.get(c.company) ?? 0) + 1);
      }
    };
    take(true);
    if (band.length < t.keyImpactMin) take(false);
  }

  // 2. Experience, every employer in profile order.
  const entries = profile.experience.filter(e => !e.excludeFromResume);
  const roleBullets = new Map<string, FillCandidate[]>(entries.map(e => [e.company, []]));
  const roleOf = (c: FillCandidate) => entries.find(e => e.company === c.company) ?? entries.find(e => namesMatch(e.company, c.company));
  const total = () => [...roleBullets.values()].reduce((n, l) => n + l.length, 0);
  const add = (c: FillCandidate) => { roleBullets.get(roleOf(c)!.company)!.push(c); chosen.push(c); };
  const usable = (c: FillCandidate) => !chosen.includes(c) && !isDup(c) && Boolean(roleOf(c));

  const assemble = (): ResumeContent => {
    const rank = new Map(pool.map((c, i) => [c.id, i + 1]));
    return {
      ...base,
      keyWinIds: band.map(c => c.id),
      keyWins: band.map(c => c.text),
      experience: entries
        .filter(e => (roleBullets.get(e.company) ?? []).length > 0)
        .map(e => ({
          company: e.company, role: e.role, tenure: e.tenure, location: e.location,
          bullets: roleBullets.get(e.company)!.map(c => ({ sourceBulletId: c.id, text: c.text, priority: rank.get(c.id)!, category: c.category ?? null })),
        })),
    };
  };
  const lines = () => estimateDocxLines(assemble(), archetype, maxPages);

  // 2a. Floor: every employer gets its best perEmployerMin bullets.
  for (const e of entries) {
    for (const c of pool) {
      if ((roleBullets.get(e.company) ?? []).length >= t.perEmployerMin) break;
      if (roleOf(c)?.company === e.company && usable(c)) add(c);
    }
  }
  // 2b. Up to perRoleTarget per role, by score, until the bullet target and
  //     the line target are both met (or totalTarget is reached).
  for (const c of pool) {
    if (total() >= t.totalTarget) break;
    if (total() >= t.totalMin && lines() >= t.targetLines) break;
    if (!usable(c) || roleBullets.get(roleOf(c)!.company)!.length >= t.perRoleTarget) continue;
    add(c);
  }
  // Going past perRoleTarget/totalTarget is deliberately NOT done here:
  // export measures the real PDF and adds from the reserve until page two
  // is at least half full (lib/resume-measure-fill.ts).

  const content = assemble();
  const reserve: ReserveBullet[] = pool
    .filter(c => !chosen.includes(c) && !isDup(c) && roleOf(c))
    .slice(0, 30)
    .map(c => ({ sourceBulletId: c.id, company: roleOf(c)!.company, text: c.text, category: c.category ?? null, score: Math.round(c.score * 1000) / 1000 }));

  const experienceIds = content.experience.flatMap(e => e.bullets.map(b => b.sourceBulletId));
  const selectedIds = [...band.map(c => c.id), ...experienceIds];
  const addedByFillIds = selectedIds.filter(id => !ranking.has(id));
  return {
    experience: content.experience,
    keyWinIds: content.keyWinIds ?? [],
    keyWins: content.keyWins ?? [],
    reserve,
    stats: {
      modelRankedIds: ranking.size,
      modelRankedUsable: pool.filter(c => c.ranked).length,
      selectedFromModel: selectedIds.length - addedByFillIds.length,
      addedByFill: addedByFillIds.length,
      addedByFillIds,
      perEmployer: Object.fromEntries(content.experience.map(e => [e.company, e.bullets.length])),
      experienceBullets: experienceIds.length,
      keyImpactItems: band.length,
      estimatedLines: lines(),
      targetLines: t.targetLines,
      reserveSize: reserve.length,
    },
  };
}

// ─── Summary vs top Key Projects item: never the same proof point ─────────

const FIGURE_PATTERN = /\$\s?\d[\d,.]*\s?(?:billion|million|thousand|bn|b|m|k)?|\d[\d,.]*\s?%|\b\d[\d,.]*\+?\s+[a-z-]+/gi;

/** Normalised figures in text: "$10 billion", "80%", "16 projects", "10+ sites" (but never "10+ years", a tenure, not a proof point). */
export function proofFigures(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.match(FIGURE_PATTERN) ?? []) {
    const norm = m.toLowerCase().replace(/[\s,]/g, "");
    if (/\+?(years?|yrs?|months?)$/.test(norm)) continue;
    out.add(norm);
  }
  return out;
}

function shareProofPoint(a: string, b: string): boolean {
  const fa = proofFigures(a);
  for (const f of proofFigures(b)) if (fa.has(f)) return true;
  return false;
}

/**
 * The summary must not lead with the same proof point as the top Key
 * Projects item. Reorders the band so its first item is one whose figures
 * the summary doesn't repeat; if every band item collides, swaps in the best
 * non-colliding quantified reserve bullet. Returns the content unchanged
 * when there's no collision. Never rewrites any text.
 */
export function separateSummaryProofPoint(content: ResumeContent): { content: ResumeContent; changed: boolean } {
  const wins = content.keyWins ?? [];
  const ids = content.keyWinIds ?? [];
  if (!content.summary || wins.length === 0 || !shareProofPoint(content.summary, wins[0])) return { content, changed: false };

  const free = wins.findIndex(w => !shareProofPoint(content.summary, w));
  if (free > 0) {
    const order = [free, ...wins.map((_, i) => i).filter(i => i !== free)];
    const keyWinIds = ids.length === wins.length ? order.map(i => ids[i]) : ids;
    return { content: { ...content, keyWins: order.map(i => wins[i]), keyWinIds }, changed: true };
  }
  const swap = (content.reserve ?? []).find(r => OUTCOME_MARKER_PATTERN.test(r.text) && !shareProofPoint(content.summary, r.text));
  if (!swap) return { content, changed: false };
  return {
    content: {
      ...content,
      keyWins: [swap.text, ...wins.slice(1)],
      keyWinIds: [swap.sourceBulletId, ...ids.slice(1)],
      reserve: (content.reserve ?? []).filter(r => r !== swap),
    },
    changed: true,
  };
}
