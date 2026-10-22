// ATTRIBUTION AND CONVERSION BY SOURCE. Every application stores the source
// it came from; /analytics shows response and interview rates per source,
// and scans order sources by the conversion observed for this user,
// defaulting to company-direct first until there is enough data. Pure.

import type { Application } from "./store";
import { hasResponded } from "./analytics";
import { SOURCE_META, CATEGORY_PRIORITY, type JobSource } from "./job-sources";

export const MIN_SAMPLE_FOR_RANKING = 5;

export type SourceConversion = {
  source: string;
  label: string;
  total: number;
  applied: number;
  responded: number;
  interviewed: number;
  responseRate: number | null;
  interviewRate: number | null;
};

const reachedApplied = (a: Application) => a.status !== "sourced" && a.status !== "reviewed";
const reachedInterview = (a: Application) => a.status === "interview" || a.status === "offer" || (a.interviews?.length ?? 0) > 0;

export function sourceOf(a: Pick<Application, "source">): string {
  return a.source ?? "manual";
}

export function computeSourceConversion(apps: Application[]): SourceConversion[] {
  const by = new Map<string, Application[]>();
  for (const a of apps) {
    const s = sourceOf(a);
    by.set(s, [...(by.get(s) ?? []), a]);
  }
  return [...by].map(([source, list]) => {
    const applied = list.filter(reachedApplied);
    const responded = applied.filter(hasResponded).length;
    const interviewed = applied.filter(reachedInterview).length;
    return {
      source,
      label: SOURCE_META[source as JobSource]?.label ?? source,
      total: list.length,
      applied: applied.length,
      responded,
      interviewed,
      responseRate: applied.length ? responded / applied.length : null,
      interviewRate: applied.length ? interviewed / applied.length : null,
    };
  }).sort((a, b) => b.applied - a.applied || a.source.localeCompare(b.source));
}

// Interview-rate priors per category, from the appendix's Huntr data
// (company career page 6.87%, Google Jobs 6.60%, boards ~2.9%, LinkedIn
// 1.95%). They lead until this user's own data outweighs them.
export const CATEGORY_PRIOR_INTERVIEW_RATE: Record<string, number> = {
  "company-direct": 0.0687, "google-jobs": 0.066, "remote-board": 0.029, aggregator: 0.029, "alert-email": 0.0195, search: 0.0195, manual: 0.03,
};
const PRIOR_WEIGHT = MIN_SAMPLE_FOR_RANKING;

/** Expected interview rate: observed rate shrunk toward the category prior (weight = MIN_SAMPLE applications). */
export function expectedInterviewRate(source: string, stat?: SourceConversion): number {
  const category = SOURCE_META[source as JobSource]?.category ?? "manual";
  const prior = CATEGORY_PRIOR_INTERVIEW_RATE[category] ?? 0.02;
  const applied = stat?.applied ?? 0;
  return ((stat?.interviewed ?? 0) + prior * PRIOR_WEIGHT) / (applied + PRIOR_WEIGHT);
}

/**
 * Sources in scan order: best expected interview rate first; ties by the
 * active career tracks' preferred categories, then category priority
 * (company-direct first).
 */
export function rankSources(stats: SourceConversion[], sources: string[], preferredCategories: string[] = []): string[] {
  const stat = new Map(stats.map(s => [s.source, s]));
  const cat = (s: string) => {
    const c = SOURCE_META[s as JobSource]?.category ?? "manual";
    const pref = preferredCategories.indexOf(c);
    return (pref >= 0 ? pref : preferredCategories.length) * 10 + CATEGORY_PRIORITY[c];
  };
  return [...sources].sort((a, b) => (expectedInterviewRate(b, stat.get(b)) - expectedInterviewRate(a, stat.get(a))) || cat(a) - cat(b));
}
