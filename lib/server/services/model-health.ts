import "server-only";
// Model probes behind login (/api/health/models) and `npm run check:models`.
// Results are cached for 10 minutes; the public /api/health is liveness only.
//   - OpenRouter: every configured chain id is checked against OpenRouter's
//     public model list (https://openrouter.ai/api/v1/models).
//   - Together: every configured model gets a direct 1-token probe; models
//     that are not serverless are flagged by name.
// Never returns key values: only whether each key is configured.

import { configuredTogetherModels, probeTogetherModel, type ModelProbe } from "../../ai-client";
import { resolveAllChains, CHAIN_NAMES, type ChainName } from "../../ai-gateway";
import { getDb } from "../db";

export const MODEL_HEALTH_TTL_MS = 10 * 60 * 1000;

export type ModelHealthReport = {
  checkedAt: string;
  cached: boolean;
  keys: { openrouter: boolean; together: boolean };
  openrouter: {
    listReachable: boolean;
    listError?: string;
    chains: { chain: ChainName; model: string; listed: boolean | null }[];
    unknownIds: string[];
  };
  together: { models: (ModelProbe & { usedFor: string[] })[]; nonServerlessModels: string[] };
  ok: boolean;
};

const g = globalThis as unknown as { __careeros_model_health?: { at: number; report: ModelHealthReport } };

/** Distinct Together models saved in users' model settings (names only). */
function storedTogetherModels(): string[] {
  try {
    const rows = getDb().prepare("SELECT data FROM singletons WHERE key = 'model_settings'").all() as { data: string }[];
    const out = new Set<string>();
    for (const r of rows) {
      try {
        const s = JSON.parse(r.data) as { provider?: string; model?: string };
        if ((s.provider ?? "together") === "together" && s.model) out.add(s.model);
      } catch { /* skip */ }
    }
    return [...out];
  } catch {
    return [];
  }
}

export async function fetchOpenRouterModelIds(fetchImpl: typeof fetch = fetch): Promise<Set<string>> {
  const res = await fetchImpl("https://openrouter.ai/api/v1/models", { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenRouter model list: HTTP ${res.status}`);
  const body = await res.json() as { data?: { id?: string }[] };
  return new Set((body.data ?? []).map(m => m.id).filter((x): x is string => typeof x === "string"));
}

export async function probeModels(opts: { force?: boolean; now?: number; fetchImpl?: typeof fetch } = {}): Promise<ModelHealthReport> {
  const now = opts.now ?? Date.now();
  const hit = g.__careeros_model_health;
  if (!opts.force && hit && now - hit.at < MODEL_HEALTH_TTL_MS) return { ...hit.report, cached: true };

  const chains = resolveAllChains();
  const entries = CHAIN_NAMES.flatMap(chain => chains[chain].map(model => ({ chain, model })));
  let listed: Set<string> | null = null;
  let listError: string | undefined;
  try { listed = await fetchOpenRouterModelIds(opts.fetchImpl); } catch (e) { listError = (e as Error).message; }
  const orChains = entries.map(e => ({ ...e, listed: listed ? listed.has(e.model) : null }));

  const configured = configuredTogetherModels();
  for (const m of storedTogetherModels()) {
    const c = configured.find(x => x.model === m);
    if (c) c.usedFor.push("stored user model setting");
    else configured.push({ model: m, usedFor: ["stored user model setting"] });
  }
  const togetherKey = !!process.env.TOGETHER_API_KEY;
  const probes = await Promise.all(configured.map(async c => ({
    ...(togetherKey ? await probeTogetherModel(c.model) : { model: c.model, status: "error" as const, detail: "not probed: TOGETHER_API_KEY missing" }),
    usedFor: c.usedFor,
  })));

  const unknownIds = [...new Set(orChains.filter(c => c.listed === false).map(c => c.model))];
  const nonServerlessModels = probes.filter(p => p.status === "not-serverless").map(p => p.model);
  const report: ModelHealthReport = {
    checkedAt: new Date(now).toISOString(),
    cached: false,
    keys: { openrouter: !!process.env.OPENROUTER_API_KEY, together: togetherKey },
    openrouter: { listReachable: !!listed, ...(listError ? { listError } : {}), chains: orChains, unknownIds },
    together: { models: probes, nonServerlessModels },
    ok: !!listed && unknownIds.length === 0 && nonServerlessModels.length === 0,
  };
  g.__careeros_model_health = { at: now, report };
  return report;
}

export function _resetModelHealthCacheForTesting(): void {
  g.__careeros_model_health = undefined;
}
