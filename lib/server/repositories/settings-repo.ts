import "server-only";
import { getDb } from "../db";
import { DEFAULT_COMPANY_TARGETS } from "../../company-targets";
import type { ModelSettings } from "../../model-settings";
import type { IntegrationSettings } from "../../integration-settings";
import type { CompanyTarget } from "../../company-targets";
import type { BatchState } from "../../batch-runner";
import type { AutomationSettings, AutomationRunLog } from "../../automation-settings";
import type { SettingsRepository } from "./types";

const DEFAULT_MODEL: ModelSettings = { provider: "together", model: "deepseek-ai/DeepSeek-V4-Pro" };
const DEFAULT_AUTOMATION: AutomationSettings = { enabled: false, schedule: "24h", lastRunAt: null };
const MAX_AUTOMATION_RUNS = 20;

export const settingsRepo: SettingsRepository = {
  getModelSettings(userEmail) {
    return getSingleton<ModelSettings>(userEmail, "model_settings") ?? DEFAULT_MODEL;
  },
  saveModelSettings(userEmail, s) {
    setSingleton(userEmail, "model_settings", s);
  },

  getIntegrationSettings(userEmail) {
    return getSingleton<IntegrationSettings>(userEmail, "integration_settings") ?? {};
  },
  saveIntegrationSettings(userEmail, s) {
    setSingleton(userEmail, "integration_settings", s);
  },

  getCompanyTargets(userEmail) {
    return getSingleton<CompanyTarget[]>(userEmail, "company_targets") ?? DEFAULT_COMPANY_TARGETS;
  },
  saveCompanyTargets(userEmail, targets) {
    setSingleton(userEmail, "company_targets", targets);
  },

  getBatchState(userEmail) {
    return getSingleton<BatchState>(userEmail, "batch_state");
  },
  saveBatchState(userEmail, state) {
    if (state === null) {
      getDb().prepare("DELETE FROM singletons WHERE user_email = ? AND key = ?").run(userEmail, "batch_state");
    } else {
      setSingleton(userEmail, "batch_state", state);
    }
  },

  getAutomationSettings(userEmail) {
    return getSingleton<AutomationSettings>(userEmail, "automation_settings") ?? DEFAULT_AUTOMATION;
  },
  saveAutomationSettings(userEmail, s) {
    setSingleton(userEmail, "automation_settings", s);
  },

  getAutomationRuns(userEmail) {
    return getSingleton<AutomationRunLog[]>(userEmail, "automation_runs") ?? [];
  },
  appendAutomationRun(userEmail, run) {
    const existing = getSingleton<AutomationRunLog[]>(userEmail, "automation_runs") ?? [];
    const next = [run, ...existing].slice(0, MAX_AUTOMATION_RUNS);
    setSingleton(userEmail, "automation_runs", next);
  },
};

function getSingleton<T>(userEmail: string, key: string): T | null {
  const row = getDb().prepare(
    "SELECT data FROM singletons WHERE user_email = ? AND key = ?"
  ).get(userEmail, key) as { data: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.data) as T; } catch { return null; }
}

function setSingleton(userEmail: string, key: string, value: unknown) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO singletons (user_email, key, data, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_email, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(userEmail, key, JSON.stringify(value), now);
}
