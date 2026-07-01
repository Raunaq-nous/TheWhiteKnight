import "server-only";
import { getDb } from "../db";
import type { StoredPlan, SkillStatus } from "../../skills-store";
import type { SkillRepository } from "./types";

const PLAN_KEY = "skill_plan";
const STATUS_KEY = "skill_status";

export const skillRepo: SkillRepository = {
  getPlan(userEmail) {
    return getSingleton<StoredPlan>(userEmail, PLAN_KEY);
  },

  savePlan(userEmail, plan) {
    setSingleton(userEmail, PLAN_KEY, plan);
  },

  getStatuses(userEmail) {
    return getSingleton<Record<string, SkillStatus>>(userEmail, STATUS_KEY) ?? {};
  },

  setStatus(userEmail, skillName, status) {
    const all = skillRepo.getStatuses(userEmail);
    all[skillName] = { ...status, lastUpdated: new Date().toISOString() };
    setSingleton(userEmail, STATUS_KEY, all);
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
