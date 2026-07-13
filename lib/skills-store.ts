// Skill store — reads from cache, writes through to server.

import { getCache, updateCacheSkillPlan, updateCacheSkillStatus, wt_saveSettings } from "./data-cache";
import { showToast } from "./toast";

import type { SkillBuilderResult } from "./prompts";

export type SkillStatus = {
  manualLevel?: "novice" | "intermediate" | "advanced" | "expert";
  completedSteps: number[];
  notes?: string;
  lastUpdated?: string;
};

export type StoredPlan = {
  generatedAt: string;
  result: SkillBuilderResult;
};

export function getPlan(): StoredPlan | null {
  return getCache().skillPlan;
}

export async function savePlan(result: SkillBuilderResult): Promise<boolean> {
  const stored: StoredPlan = { generatedAt: new Date().toISOString(), result };
  updateCacheSkillPlan(stored);
  window.dispatchEvent(new Event("careeros-skill-change"));
  try {
    await wt_saveSettings("skill_plan", stored);
    return true;
  } catch (e: any) {
    console.error("[CareerOS] savePlan failed:", e);
    showToast(e?.message ?? "Failed to save skill plan", "error");
    return false;
  }
}

export function getStatuses(): Record<string, SkillStatus> {
  return getCache().skillStatus;
}

export async function setStatus(skillName: string, status: SkillStatus): Promise<boolean> {
  const all = { ...getCache().skillStatus };
  all[skillName] = { ...status, lastUpdated: new Date().toISOString() };
  updateCacheSkillStatus(all);
  window.dispatchEvent(new Event("careeros-skill-change"));
  try {
    await wt_saveSettings("skill_status", all);
    return true;
  } catch (e: any) {
    console.error("[CareerOS] setStatus failed:", e);
    showToast(e?.message ?? "Failed to save skill status", "error");
    return false;
  }
}

export function toggleStep(skillName: string, stepNumber: number): Promise<boolean> {
  const all = getStatuses();
  const current = all[skillName] ?? { completedSteps: [] };
  const completed = current.completedSteps ?? [];
  const updated = completed.includes(stepNumber)
    ? completed.filter(n => n !== stepNumber)
    : [...completed, stepNumber];
  return setStatus(skillName, { ...current, completedSteps: updated });
}
