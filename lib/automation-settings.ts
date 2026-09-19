// Client-facing type + get/save for the scheduled automation layer
// (scan -> score -> draft -> stage, never send). Persisted the same way as
// every other setting (lib/integration-settings.ts, lib/company-targets.ts):
// a write-through cache backed by /api/data/settings/automation_settings.

import { getCache, updateCacheAutomationSettings, wt_saveSettings } from "./data-cache";
import { showToast } from "./toast";

export type AutomationSchedule = "6h" | "12h" | "24h" | "72h" | "168h";

export const AUTOMATION_SCHEDULE_HOURS: Record<AutomationSchedule, number> = {
  "6h": 6,
  "12h": 12,
  "24h": 24,
  "72h": 72,
  "168h": 168,
};

export const AUTOMATION_SCHEDULE_LABELS: Record<AutomationSchedule, string> = {
  "6h": "Every 6 hours",
  "12h": "Every 12 hours",
  "24h": "Daily",
  "72h": "Every 3 days",
  "168h": "Weekly",
};

// Per-run rate-limit safety: default cap on how many NEW jobs a single
// invocation will score/draft, and a hard ceiling no configured value can
// exceed (protects against a misconfigured huge number exhausting API
// quota or making the cron endpoint run too long). Anything beyond the cap
// is simply left for the next run — see automation-service.ts's ledger.
// Small batches so a single cron invocation reliably finishes inside the
// HTTP timeout (see app/api/cron/automation/route.ts's maxDuration): each
// job in the sequential loop can take real wall-clock time (JD fetch, a
// scoring model call, a drafting model call, plus the inter-job delay), so
// the default and the hard ceiling are both kept low rather than "as many
// as the rate limit theoretically allows."
export const DEFAULT_MAX_JOBS_PER_RUN = 2;
export const MAX_JOBS_PER_RUN_CEILING = 5;

export type AutomationSettings = {
  enabled: boolean;
  schedule: AutomationSchedule;
  lastRunAt: string | null;
  maxJobsPerRun: number;
};

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  enabled: false,
  schedule: "24h",
  lastRunAt: null,
  maxJobsPerRun: DEFAULT_MAX_JOBS_PER_RUN,
};

export type AutomationRunStatus = "ok" | "error" | "skipped";

// Every stage a scanned job passes through, in order, so a run's log can
// show exactly where jobs fell out: fetched -> keyword -> recency ->
// location -> dedup -> scored -> staged. "keyword" survivors is jobsFound
// below (the scan's own relevance filter, already zero-token); "dedup"
// survivors is jobsFound - jobsSkippedDuplicate. jobsFetched/jobsAfter*
// below fill in the two stages that previously weren't counted at all.
export type RulesFilterRejectionLog = { stage: "recency" | "location"; title: string; company?: string; reason: string };

export type AutomationRunLog = {
  id: string;
  startedAt: string;
  finishedAt: string;
  status: AutomationRunStatus;
  reason?: string; // set when status is "skipped" or "error"
  // Raw union across all sources, before the scan's own keyword/relevance
  // filter — the "fetched" stage.
  jobsFetched?: number;
  jobsFound: number;
  // Survivors after the deterministic, zero-token recency filter
  // (lib/server/services/rules-prefilter.ts) — the "recency" stage.
  jobsAfterRecencyFilter?: number;
  // Survivors after the deterministic, zero-token location filter — the
  // "location" stage, immediately before dedup and any LLM scoring call.
  jobsAfterLocationFilter?: number;
  // Every job the rules pre-filter rejected, with its stage and reason —
  // capped defensively but expected to be small given the new small-batch
  // defaults (DEFAULT_MAX_JOBS_PER_RUN / MAX_JOBS_PER_RUN_CEILING above).
  filteredOut?: RulesFilterRejectionLog[];
  jobsScored: number;
  jobsStaged: number; // good-fit jobs: drafted + queued for approval
  jobsSourced: number; // total new applications created (staged + not-good-fit)
  jobsSkippedDuplicate: number;
  // AI scoring failed for this job (e.g. the reasoning-model token-budget
  // exhaustion class of failure) but the job was still saved to the ledger,
  // marked unscored, rather than silently dropped and crashing the run.
  jobsUnscored?: number;
  errors: string[];
};

export function getAutomationSettings(): AutomationSettings {
  return getCache().automationSettings ?? DEFAULT_AUTOMATION_SETTINGS;
}

export async function saveAutomationSettings(s: AutomationSettings): Promise<boolean> {
  updateCacheAutomationSettings(s);
  try {
    await wt_saveSettings("automation_settings", s);
    return true;
  } catch (e: any) {
    console.error("[CareerOS] saveAutomationSettings failed:", e);
    showToast(e?.message ?? "Failed to save automation settings", "error");
    return false;
  }
}
