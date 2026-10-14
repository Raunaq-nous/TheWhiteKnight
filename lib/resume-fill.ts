// DETERMINISTIC SELECTION. The model ranks every candidate bullet id by JD
// relevance; this module builds the Experience section from that ranking.
//
//   1. QUALITY FILTER. A bullet is eligible only with an outcome clause
//      (lib/resume-outcome.ts), or when config names it eligible without
//      one (resumeEligibility.eligibleWithoutOutcome). Scope lines are not
//      bullets: they render once under the role title.
//   2. JD RELEVANCE FIRST. Eligible bullets are ordered by the model's JD
//      relevance; impact density only breaks ties. (Impact-first ranking is
//      why every resume used to look the same: the same quantified bullets
//      won for every JD.) A bullet the model did not rank gets a
//      deterministic keyword-overlap relevance against the JD.
//   3. TAPER, NO PADDING. Per-role caps and floors by recency
//      (FILL_TARGETS / taperFor); above a role's floor a bullet must clear
//      the relevance threshold. No earlier role outnumbers the current role
//      unless the current role has run out. Nothing is added to reach a
//      line count; the fill only stops short of a third page.
//   4. ORDER. Within each employer, bullets run in JD-relevance order. For an
//      AI-related JD, configured bullets (the internal AI strategy team)
//      are pinned first in their group.
//
// Selection, not writing: every bullet is a real profile bullet id, and its
// text always comes from the profile.

import type { Profile, ExperienceEntry } from "./profile";
import { listProfileBullets } from "./profile-bullets";
import type { ResumeContent, ResumeBullet, ReserveBullet, ResumeExperienceEntry } from "./resume-schema";
import type { ResumeArchetype } from "./resume-archetype";
import { budgetForMaxPages, FILL_TARGETS, clampBulletPreservingOutcome, taperFor } from "./resume-budget";
import { impactDensity, outcomeBucket } from "./resume-bullet-relevance";
import { hasOutcomeClause } from "./resume-outcome";
import { sameEngagement } from "./resume-dedupe";
import { textSimilarity, namesMatch } from "./profile-merge";
import { violatesToolPlacement } from "./resume-tool-placement";
import { estimateDocxLines } from "./resume-layout-estimate";
import { keywordOverlap } from "./resume-jd";
import profileRulesConfig from "../config/profile-rules.json";

type EligibilityConfig = { eligibleWithoutOutcome?: string[]; pinFirstInAiBuildsWhenAiJd?: string[] };
const ELIGIBILITY: EligibilityConfig = (profileRulesConfig as { resumeEligibility?: EligibilityConfig }).resumeEligibility ?? {};
const SCOPE_PATTERNS: RegExp[] = ((profileRulesConfig as { scopeLinePatterns?: string[] }).scopeLinePatterns ?? []).map(p => new RegExp(p, "i"));
const SCOPE_LINES: Record<string, string> = (profileRulesConfig as { scopeLines?: Record<string, string> }).scopeLines ?? {};
const FOUNDER_ROLE = /\b(co-?founder|founder|owner)\b/i;

export type FillCandidate = {
  id: string;
  company: string;
  text: string;
  category: ResumeBullet["category"];
  relevance: number;
  ranked: boolean;
  density: number;
  pinned: boolean;
};

export type FillStats = {
  modelRankedIds: number;
  modelRankedUsable: number;
  selectedFromModel: number;
  // Selected bullets the model did not rank (relevance from JD keyword overlap).
  addedByFill: number;
  addedByFillIds: string[];
  eligibleBullets: number;
  ineligibleBullets: number;
  relevanceThreshold: number;
  pinnedIds: string[];
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
  keyWinCompanies: string[];
  reserve: ReserveBullet[];
  stats: FillStats;
};

export type FillOptions = {
  // Server-side confidentiality hook: return false for text that would
  // fail the gate even after substitution (block-only terms, never-cite).
  isTextAllowed?: (text: string) => boolean;
  // JD terms for the deterministic relevance of bullets the model didn't rank.
  jdTerms?: Set<string>;
  // AI-related JD: pin the configured AI-strategy bullets first.
  aiJd?: boolean;
};

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

/** Impact: the tiebreak among bullets of equal JD relevance. */
export function impactFactor(text: string): number {
  return 1 + 0.25 * Math.min(3, impactDensity(text)) + 0.1 * outcomeBucket(text);
}

export function isSameEngagement(a: string, b: string): boolean {
  return textSimilarity(a, b) >= 0.6 || sameEngagement(a, b);
}

const includesAny = (text: string, needles: string[] | undefined) =>
  (needles ?? []).some(n => text.toLowerCase().includes(n.toLowerCase()));

/** Quality filter: an outcome clause, or named eligible in config. */
export function isEligibleBullet(text: string): boolean {
  return hasOutcomeClause(text) || includesAny(text, ELIGIBILITY.eligibleWithoutOutcome);
}

/** A role-scope statement ("Primary client interface across 12+ mandates...") rather than an engagement. */
export function isScopeLine(text: string): boolean {
  return SCOPE_PATTERNS.some(p => p.test(text.trim()));
}

/** The one scope line shown under a role title: from the role's own bullets, else config. */
export function scopeLineFor(entry: Pick<ExperienceEntry, "company" | "bullets">): string | null {
  const fromBullets = entry.bullets.split("\n").map(b => b.trim()).find(isScopeLine);
  if (fromBullets) return fromBullets;
  const key = Object.keys(SCOPE_LINES).find(k => namesMatch(k, entry.company));
  return key ? SCOPE_LINES[key] : null;
}

/** Deterministic relevance (0..~0.6) for a bullet the model did not rank. */
export function fallbackRelevance(text: string, jdTerms?: Set<string>): number {
  if (!jdTerms || jdTerms.size === 0) return 0;
  return Math.min(0.6, 0.08 * keywordOverlap(text, jdTerms));
}

/** Candidates in selection order: JD relevance first, impact as tiebreak, profile order last. */
export function buildCandidates(profile: Profile, ranking: Map<string, number>, maxPages: number, opts: FillOptions = {}): { pool: FillCandidate[]; ineligible: number } {
  const maxChars = budgetForMaxPages(maxPages).bulletMaxChars;
  const out: FillCandidate[] = [];
  let ineligible = 0;
  for (const ref of listProfileBullets(profile)) {
    if (ref.sourceType !== "experience") continue;
    if (isScopeLine(ref.text)) continue;
    if (!isEligibleBullet(ref.text)) { ineligible++; continue; }
    const text = ref.text.length <= maxChars ? ref.text : clampBulletPreservingOutcome(ref.text, maxChars);
    if (!text) continue;
    if (opts.isTextAllowed && !opts.isTextAllowed(text)) continue;
    if (violatesToolPlacement(text, ref.sourceId)) continue;
    const ranked = ranking.has(ref.id);
    const relevance = ranked ? ranking.get(ref.id)! : fallbackRelevance(ref.text, opts.jdTerms);
    const pinned = Boolean(opts.aiJd) && includesAny(ref.text, ELIGIBILITY.pinFirstInAiBuildsWhenAiJd);
    out.push({ id: ref.id, company: ref.sourceId, text, category: ref.category ?? null, relevance, ranked, density: impactDensity(text), pinned });
  }
  const pool = out
    .map((c, i) => ({ c, i, impact: impactFactor(c.text) }))
    .sort((a, b) => b.c.relevance - a.c.relevance || b.impact - a.impact || a.i - b.i)
    .map(x => x.c);
  return { pool, ineligible };
}

/**
 * Builds Experience from the ranking. `base` supplies everything the fill
 * doesn't own (summary, skills, education, sequence) so the layout estimate
 * sees the whole document.
 */
export function buildFilledSelection(
  profile: Profile,
  base: ResumeContent,
  archetype: ResumeArchetype,
  maxPages: number,
  opts: FillOptions = {},
): FillResult {
  const ranking = rankingFromModel(base);
  const { pool, ineligible } = buildCandidates(profile, ranking, maxPages, opts);
  const threshold = FILL_TARGETS.relevanceThreshold;

  const entries = profile.experience.filter(e => !e.excludeFromResume);
  const roleOf = (c: FillCandidate) => entries.find(e => e.company === c.company) ?? entries.find(e => namesMatch(e.company, c.company));
  const roleBullets = new Map<string, FillCandidate[]>(entries.map(e => [e.company, []]));
  const chosen: FillCandidate[] = [];
  const isDup = (c: FillCandidate) => chosen.some(x => isSameEngagement(x.text, c.text));
  const usable = (c: FillCandidate) => !chosen.includes(c) && !isDup(c) && Boolean(roleOf(c));
  const countOf = (company: string) => roleBullets.get(company)?.length ?? 0;
  const taper = (e: ExperienceEntry) => taperFor(entries.indexOf(e), e.role);
  const add = (c: FillCandidate) => { roleBullets.get(roleOf(c)!.company)!.push(c); chosen.push(c); };

  const rank = new Map(pool.map((c, i) => [c.id, i + 1]));
  const assemble = (): ResumeContent => ({
    ...base,
    keyWinIds: [], keyWins: [], keyWinCompanies: [], projects: [],
    experience: entries
      .filter(e => countOf(e.company) > 0)
      .map(e => {
        const scope = scopeLineFor(e);
        return {
          company: e.company, role: e.role, tenure: e.tenure, location: e.location,
          scope: scope && (!opts.isTextAllowed || opts.isTextAllowed(scope)) ? scope : null,
          // Pinned first, then JD-relevance order.
          bullets: [...roleBullets.get(e.company)!]
            .sort((a, b) => Number(b.pinned) - Number(a.pinned) || rank.get(a.id)! - rank.get(b.id)!)
            .map(c => ({ sourceBulletId: c.id, text: c.text, priority: c.pinned ? 0 : rank.get(c.id)!, category: c.category ?? null })),
        };
      }),
  });
  const lines = () => estimateDocxLines(assemble(), archetype, maxPages);

  // a. Pins (AI-related JD only), within the role's cap.
  for (const c of pool) {
    if (!c.pinned || !usable(c)) continue;
    const e = roleOf(c)!;
    if (countOf(e.company) < taper(e).cap) add(c);
  }
  // b. Floors: each role's best eligible bullets, so no role shows empty.
  //    A role whose eligible bullets span both sub-label categories (Bain
  //    and Aranca) first gets its best of each, so both CONSULTING
  //    ENGAGEMENTS and AI BUILDS render there; founder roles never split.
  for (const e of entries) {
    if (FOUNDER_ROLE.test(e.role ?? "")) continue;
    const mine = pool.filter(c => roleOf(c)?.company === e.company);
    const hasBuild = mine.some(c => c.category === "ai_build");
    const hasEngagement = mine.some(c => c.category !== "ai_build");
    if (!hasBuild || !hasEngagement) continue;
    for (const wantBuild of [false, true]) {
      if (roleBullets.get(e.company)!.some(c => (c.category === "ai_build") === wantBuild)) continue;
      const best = mine.find(c => (c.category === "ai_build") === wantBuild && usable(c));
      if (best && countOf(e.company) < taper(e).cap) add(best);
    }
  }
  for (const e of entries) {
    for (const c of pool) {
      if (countOf(e.company) >= taper(e).floor) break;
      if (roleOf(c)?.company === e.company && usable(c)) add(c);
    }
  }
  // c. Above the floors: relevance order, above the threshold, within the
  //    taper, the current role leading, short of a third page.
  const current = entries[0];
  const currentExhausted = () => !current || countOf(current.company) >= taper(current).cap
    || !pool.some(c => usable(c) && c.relevance >= threshold && roleOf(c)?.company === current.company);
  for (const c of pool) {
    if (c.relevance < threshold || !usable(c)) continue;
    const e = roleOf(c)!;
    if (countOf(e.company) >= taper(e).cap) continue;
    if (current && e !== current && !currentExhausted() && countOf(e.company) + 1 > countOf(current.company)) continue;
    add(c);
    if (lines() > FILL_TARGETS.maxLines) { roleBullets.get(e.company)!.pop(); chosen.pop(); break; }
  }

  const content = assemble();
  // Export's measure-and-fill may only add what clears the same bar.
  const reserve: ReserveBullet[] = pool
    .filter(c => !chosen.includes(c) && !isDup(c) && roleOf(c) && c.relevance >= threshold)
    .map(c => ({ sourceBulletId: c.id, company: roleOf(c)!.company, text: c.text, category: c.category ?? null, score: Math.round(c.relevance * 1000) / 1000 }));

  const experienceIds = content.experience.flatMap(e => e.bullets.map(b => b.sourceBulletId));
  const addedByFillIds = experienceIds.filter(id => !ranking.has(id));
  return {
    experience: content.experience,
    keyWinIds: [], keyWins: [], keyWinCompanies: [],
    reserve,
    stats: {
      modelRankedIds: ranking.size,
      modelRankedUsable: pool.filter(c => c.ranked).length,
      selectedFromModel: experienceIds.length - addedByFillIds.length,
      addedByFill: addedByFillIds.length,
      addedByFillIds,
      eligibleBullets: pool.length,
      ineligibleBullets: ineligible,
      relevanceThreshold: threshold,
      pinnedIds: chosen.filter(c => c.pinned).map(c => c.id),
      perEmployer: Object.fromEntries(content.experience.map(e => [e.company, e.bullets.length])),
      experienceBullets: experienceIds.length,
      keyImpactItems: 0,
      estimatedLines: lines(),
      targetLines: FILL_TARGETS.targetLines,
      reserveSize: reserve.length,
    },
  };
}

// ─── Figures (summary vs bullets) ────────────────────────────────────────

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

/** The bare numbers in text ("80%" -> "80", "$10 billion" -> "10"), years and tenure excluded. */
export function bareNumbers(text: string): Set<string> {
  const out = new Set<string>();
  for (const f of proofFigures(text)) {
    const n = f.match(/\d[\d.,]*/)?.[0];
    if (n) out.add(n.replace(/[.,]$/, "").replace(/,/g, ""));
  }
  return out;
}
