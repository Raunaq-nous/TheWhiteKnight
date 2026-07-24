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

export type AutomationSettings = {
  enabled: boolean;
  schedule: AutomationSchedule;
  lastRunAt: string | null;
};

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  enabled: false,
  schedule: "24h",
  lastRunAt: null,
};

export type AutomationRunStatus = "ok" | "error" | "skipped";

export type AutomationRunLog = {
  id: string;
  startedAt: string;
  finishedAt: string;
  status: AutomationRunStatus;
  reason?: string; // set when status is "skipped" or "error"
  jobsFound: number;
  jobsScored: number;
  jobsStaged: number; // good-fit jobs: drafted + queued for approval
  jobsSourced: number; // total new applications created (staged + not-good-fit)
  jobsSkippedDuplicate: number;
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
