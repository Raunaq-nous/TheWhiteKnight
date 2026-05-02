// Persists the generated Skill Builder plan and any user-applied status overrides.
// Plan is regenerated on demand; status overrides survive across regenerations.

import type { SkillBuilderResult } from "./prompts";

const PLAN_KEY = "careeros_skill_plan";
const STATUS_KEY = "careeros_skill_status";

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
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PLAN_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function savePlan(result: SkillBuilderResult) {
  if (typeof window === "undefined") return;
  const stored: StoredPlan = { generatedAt: new Date().toISOString(), result };
  localStorage.setItem(PLAN_KEY, JSON.stringify(stored));
  window.dispatchEvent(new Event("careeros-skill-change"));
}

export function getStatuses(): Record<string, SkillStatus> {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(STATUS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function setStatus(skillName: string, status: SkillStatus) {
  if (typeof window === "undefined") return;
  const all = getStatuses();
  all[skillName] = { ...status, lastUpdated: new Date().toISOString() };
  localStorage.setItem(STATUS_KEY, JSON.stringify(all));
  window.dispatchEvent(new Event("careeros-skill-change"));
}

export function toggleStep(skillName: string, stepNumber: number) {
  const all = getStatuses();
  const current = all[skillName] ?? { completedSteps: [] };
  const completed = current.completedSteps ?? [];
  const updated = completed.includes(stepNumber)
    ? completed.filter(n => n !== stepNumber)
    : [...completed, stepNumber];
  setStatus(skillName, { ...current, completedSteps: updated });
}
