import "server-only";
// DETERMINISTIC, ZERO-TOKEN pre-filter — runs on scanned jobs BEFORE any
// model call (scoreJob), so an obviously off-target posting never spends a
// cent of LLM budget. Two stages, applied in order (recency then location);
// seniority/keyword exclusion already happens earlier, inside scanJobs'
// relevance scoring (lib/server/services/scan-service.ts's excludeTokens),
// which is itself zero-token — this module adds the two stages that
// weren't filtered anywhere yet.
//
// Both filters are PERMISSIVE on ambiguity: a job with no/unknown posted
// date, or no/unclear location, always survives. This is a rejection
// filter for CLEAR mismatches only (a posting that's plainly stale, or
// plainly in a place the candidate isn't open to) — never a positive
// match requirement that could silently starve a run of real candidates.
import type { JobResult } from "./scan-service";
import type { Profile } from "../../profile";

export type RulesFilterStage = "recency" | "location";

export type RulesFilterRejection = {
  stage: RulesFilterStage;
  title: string;
  company?: string;
  reason: string;
};

export type RulesFilterResult = {
  survivors: JobResult[];
  rejected: RulesFilterRejection[];
};

// A posting still listed after this many days reads as either stale or a
// perpetual/evergreen listing not worth chasing on an automated cadence —
// deliberately generous so a real, recent opening is never falsely dropped.
export const MAX_POSTING_AGE_DAYS = 45;

function daysSince(dateStr: string | undefined, now: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
}

/** Drops postings with a KNOWN publish date clearly older than maxAgeDays. Unknown dates always pass. */
export function applyRecencyFilter(
  jobs: JobResult[],
  now: Date,
  maxAgeDays: number = MAX_POSTING_AGE_DAYS,
): { survivors: JobResult[]; rejected: RulesFilterRejection[] } {
  const survivors: JobResult[] = [];
  const rejected: RulesFilterRejection[] = [];
  for (const j of jobs) {
    const age = daysSince(j.publishedDate, now);
    if (age !== null && age > maxAgeDays) {
      rejected.push({
        stage: "recency",
        title: j.title,
        company: j.company,
        reason: `Posted ${Math.round(age)} days ago, older than the ${maxAgeDays}-day cutoff`,
      });
    } else {
      survivors.push(j);
    }
  }
  return { survivors, rejected };
}

function candidateLocationTokens(profile: Profile): string[] {
  return `${profile.location ?? ""} ${profile.locationsOpenTo ?? ""}`
    .toLowerCase()
    .split(/[,/|]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** Drops postings whose location string names a real, different place the candidate has no signal of accepting. Remote/blank/ambiguous locations always pass. */
export function applyLocationFilter(
  jobs: JobResult[],
  profile: Profile,
): { survivors: JobResult[]; rejected: RulesFilterRejection[] } {
  const openTo = candidateLocationTokens(profile);
  const acceptsAnywhere = openTo.length === 0 || /anywhere|worldwide|global|open to relocat/i.test(profile.locationsOpenTo ?? "");
  const survivors: JobResult[] = [];
  const rejected: RulesFilterRejection[] = [];
  for (const j of jobs) {
    const loc = (j.location ?? "").trim();
    if (!loc || acceptsAnywhere || /remote/i.test(loc)) { survivors.push(j); continue; }
    const locLower = loc.toLowerCase();
    const matches = openTo.some(t => t.length > 2 && (locLower.includes(t) || t.includes(locLower)));
    if (matches) {
      survivors.push(j);
    } else {
      rejected.push({
        stage: "location",
        title: j.title,
        company: j.company,
        reason: `Job location "${loc}" does not match any candidate open-to location (${openTo.join(", ") || "none set"})`,
      });
    }
  }
  return { survivors, rejected };
}

/** Runs both stages in order (recency, then location) — the required pipeline order for automation-service.ts. */
export function runRulesPreFilter(jobs: JobResult[], profile: Profile, now: Date): RulesFilterResult {
  const recency = applyRecencyFilter(jobs, now);
  const location = applyLocationFilter(recency.survivors, profile);
  return { survivors: location.survivors, rejected: [...recency.rejected, ...location.rejected] };
}
