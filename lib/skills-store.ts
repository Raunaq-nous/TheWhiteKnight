// Skill store — reads from cache, writes through to server.

import { getCache, updateCacheSkillPlan, updateCacheSkillStatus, wt_saveSettings } from "./data-cache";

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

export function savePlan(result: SkillBuilderResult): void {
  const stored: StoredPlan = { generatedAt: new Date().toISOString(), result };
  updateCacheSkillPlan(stored);
  window.dispatchEvent(new Event("careeros-skill-change"));
  wt_saveSettings("skill_plan", stored).catch(e => console.error("[CareerOS] savePlan failed:", e));
}

export function getStatuses(): Record<string, SkillStatus> {
  return getCache().skillStatus;
}

export function setStatus(skillName: string, status: SkillStatus): void {
  const all = { ...getCache().skillStatus };
  all[skillName] = { ...status, lastUpdated: new Date().toISOString() };
  updateCacheSkillStatus(all);
  window.dispatchEvent(new Event("careeros-skill-change"));
  wt_saveSettings("skill_status", all).catch(e => console.error("[CareerOS] setStatus failed:", e));
}

export function toggleStep(skillName: string, stepNumber: number): void {
  const all = getStatuses();
  const current = all[skillName] ?? { completedSteps: [] };
  const completed = current.completedSteps ?? [];
  const updated = completed.includes(stepNumber)
    ? completed.filter(n => n !== stepNumber)
    : [...completed, stepNumber];
  setStatus(skillName, { ...current, completedSteps: updated });
}
