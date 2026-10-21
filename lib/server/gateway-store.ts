import "server-only";
// Storage for the model gateway (lib/ai-gateway.ts): the call log, monthly
// spend, and the operator's chains and spend caps. Importing this module
// registers the gateway hooks (instrumentation.ts does so at server start;
// scripts import it directly). Chains and caps are server-wide (stored under
// a reserved singleton owner) because the provider keys are server env vars.

import { getDb } from "./db";
import {
  setGatewayHooks, CHAIN_NAMES, PAID_PROVIDERS,
  type AiCallRecord, type ChainName, type GatewayProvider,
} from "../ai-gateway";

export const GATEWAY_OWNER = "__gateway__";
const MAX_CALLS_KEPT = 5000;

export type GatewaySettings = {
  chains: Partial<Record<ChainName, string[]>>;
  caps: Partial<Record<GatewayProvider, number | null>>;
};

function readSingleton<T>(key: string): T | null {
  const row = getDb().prepare("SELECT data FROM singletons WHERE user_email = ? AND key = ?").get(GATEWAY_OWNER, key) as { data: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.data) as T; } catch { return null; }
}

function writeSingleton(key: string, value: unknown): void {
  getDb().prepare(`
    INSERT INTO singletons (user_email, key, data, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_email, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(GATEWAY_OWNER, key, JSON.stringify(value), new Date().toISOString());
}

/** Validates and normalises an edit: known chains only, trimmed unique ids, caps >= 0 or null. */
export function sanitiseGatewaySettings(input: unknown): GatewaySettings {
  const raw = (input ?? {}) as { chains?: Record<string, unknown>; caps?: Record<string, unknown> };
  const chains: GatewaySettings["chains"] = {};
  for (const name of CHAIN_NAMES) {
    const v = raw.chains?.[name];
    if (Array.isArray(v)) {
      const ids = [...new Set(v.map(x => String(x).trim()).filter(x => /^[\w.:/-]{3,120}$/.test(x)))];
      if (ids.length) chains[name] = ids;
    }
  }
  const caps: GatewaySettings["caps"] = {};
  for (const p of PAID_PROVIDERS) {
    const v = raw.caps?.[p];
    if (v === null || v === "" || v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) caps[p] = n;
  }
  return { chains, caps };
}

export const gatewayStore = {
  getSettings(): GatewaySettings {
    return {
      chains: readSingleton<GatewaySettings["chains"]>("model_chains") ?? {},
      caps: readSingleton<GatewaySettings["caps"]>("spend_caps") ?? {},
    };
  },
  saveSettings(input: unknown): GatewaySettings {
    const clean = sanitiseGatewaySettings(input);
    writeSingleton("model_chains", clean.chains);
    writeSingleton("spend_caps", clean.caps);
    return clean;
  },
  record(r: AiCallRecord): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO ai_calls (at, task, provider, model_requested, model_served, prompt_tokens, completion_tokens, reasoning_tokens, cost_usd, ok, error)
      VALUES (@at, @task, @provider, @modelRequested, @modelServed, @promptTokens, @completionTokens, @reasoningTokens, @costUsd, @ok, @error)
    `).run({ ...r, ok: r.ok ? 1 : 0, error: r.error ?? null });
    db.prepare(`DELETE FROM ai_calls WHERE id <= (SELECT MAX(id) FROM ai_calls) - ?`).run(MAX_CALLS_KEPT);
  },
  monthlySpend(provider: GatewayProvider, now: Date = new Date()): number {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const row = getDb().prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_calls WHERE provider = ? AND at >= ?").get(provider, monthStart) as { total: number };
    return row.total;
  },
  /** The most recent calls per task (newest first). */
  recentCalls(limitPerTask = 10): Record<string, AiCallRecord[]> {
    const rows = getDb().prepare(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY task ORDER BY at DESC, id DESC) AS rn FROM ai_calls
      ) WHERE rn <= ? ORDER BY task, at DESC, id DESC
    `).all(limitPerTask) as Record<string, unknown>[];
    const out: Record<string, AiCallRecord[]> = {};
    for (const r of rows) {
      const rec: AiCallRecord = {
        at: String(r.at), task: String(r.task), provider: r.provider as GatewayProvider,
        modelRequested: String(r.model_requested), modelServed: String(r.model_served),
        promptTokens: Number(r.prompt_tokens), completionTokens: Number(r.completion_tokens), reasoningTokens: Number(r.reasoning_tokens),
        costUsd: Number(r.cost_usd), ok: r.ok === 1, ...(r.error ? { error: String(r.error) } : {}),
      };
      (out[rec.task] ??= []).push(rec);
    }
    return out;
  },
};

export function registerGatewayHooks(): void {
  setGatewayHooks({
    chains: () => gatewayStore.getSettings().chains,
    caps: () => gatewayStore.getSettings().caps,
    monthlySpend: p => gatewayStore.monthlySpend(p),
    record: r => gatewayStore.record(r),
  });
}

registerGatewayHooks();
