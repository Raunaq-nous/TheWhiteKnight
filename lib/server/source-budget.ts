import "server-only";
// Monthly call budgets for keyed job sources (SerpApi, JSearch, Adzuna,
// TheirStack, JobsPipe), so free tiers are never exceeded. Server-wide
// (the keys are server env vars, or one user's Adzuna keys on a personal
// instance). Caps default to SOURCE_META.monthlyBudget and can be
// overridden per source with SOURCE_BUDGET_<NAME> (e.g. SOURCE_BUDGET_SERPAPI=250).

import { getDb } from "./db";
import { SOURCE_META, type JobSource } from "../job-sources";

const OWNER = "__sources__";
const KEY = "source_usage";

export type SourceBudget = {
  cap(source: JobSource): number | null;
  used(source: JobSource): number;
  remaining(source: JobSource): number;
  consume(source: JobSource, n?: number): void;
};

export function monthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function read(): { month: string; counts: Record<string, number> } {
  const row = getDb().prepare("SELECT data FROM singletons WHERE user_email = ? AND key = ?").get(OWNER, KEY) as { data: string } | undefined;
  try { return row ? JSON.parse(row.data) : { month: "", counts: {} }; } catch { return { month: "", counts: {} }; }
}

function write(v: { month: string; counts: Record<string, number> }): void {
  getDb().prepare(`
    INSERT INTO singletons (user_email, key, data, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_email, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(OWNER, KEY, JSON.stringify(v), new Date().toISOString());
}

export function sourceCap(source: JobSource): number | null {
  const env = process.env[`SOURCE_BUDGET_${source.toUpperCase()}`];
  if (env !== undefined && env !== "" && Number.isFinite(Number(env))) return Math.max(0, Number(env));
  return SOURCE_META[source]?.monthlyBudget ?? null;
}

/** The persistent, month-scoped budget (resets on the first of each UTC month). */
export function dbSourceBudget(now: () => Date = () => new Date()): SourceBudget {
  const current = () => {
    const v = read();
    return v.month === monthKey(now()) ? v : { month: monthKey(now()), counts: {} };
  };
  return {
    cap: sourceCap,
    used: s => current().counts[s] ?? 0,
    remaining(s) {
      const cap = sourceCap(s);
      return cap === null ? Number.POSITIVE_INFINITY : Math.max(0, cap - (current().counts[s] ?? 0));
    },
    consume(s, n = 1) {
      const v = current();
      v.counts[s] = (v.counts[s] ?? 0) + n;
      write(v);
    },
  };
}

/** In-memory budget for tests and dry runs. */
export function memorySourceBudget(caps: Partial<Record<JobSource, number | null>> = {}): SourceBudget & { counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  const cap = (s: JobSource) => (s in caps ? caps[s]! : SOURCE_META[s]?.monthlyBudget ?? null);
  return {
    counts,
    cap,
    used: s => counts[s] ?? 0,
    remaining: s => { const c = cap(s); return c === null ? Number.POSITIVE_INFINITY : Math.max(0, c - (counts[s] ?? 0)); },
    consume: (s, n = 1) => { counts[s] = (counts[s] ?? 0) + n; },
  };
}
