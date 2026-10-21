// MODEL GATEWAY: per-task model chains, the call log and the spend guard.
//
// - Chains: each task resolves to a named chain (structured / writing /
//   vision) of OpenRouter model ids, sent as OpenRouter's native fallback
//   list. Defaults live in config/model-chains.json; the operator edits
//   them in Settings (stored server-wide, since the provider keys are
//   server env vars).
// - Call log: every call records which provider and model served it, with
//   the token split and its cost.
// - Spend guard: a monthly cap per paid provider; at the cap the provider
//   is skipped and the call falls through to the next one.
//
// Storage is injected through hooks (lib/server/gateway-store.ts registers
// them; instrumentation.ts loads it at server start), so this module has no
// database dependency and tests never touch the real database. Hooks live
// on globalThis because Next can load this module in more than one bundle.

import chainsConfig from "../config/model-chains.json";

export type ChainName = "structured" | "writing" | "vision";
export const CHAIN_NAMES: ChainName[] = ["structured", "writing", "vision"];
export type GatewayProvider = "openrouter" | "together" | "anthropic" | "openai";
export const PAID_PROVIDERS: GatewayProvider[] = ["openrouter", "together", "anthropic", "openai"];

type ChainsConfig = {
  chains: Record<ChainName, string[]>;
  taskChains: Record<string, ChainName>;
  pricesPerMTok: Record<string, Record<string, [number, number]>>;
};
const CONFIG = chainsConfig as unknown as ChainsConfig;

export const DEFAULT_CHAINS: Record<ChainName, string[]> = CONFIG.chains;

export type AiCallRecord = {
  at: string;
  task: string;
  provider: GatewayProvider;
  modelRequested: string;
  modelServed: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  costUsd: number;
  ok: boolean;
  error?: string;
};

export type GatewayHooks = {
  /** Operator-edited chains (partial: missing chains use the defaults). */
  chains?: () => Partial<Record<ChainName, string[]>> | null;
  /** Monthly cap in USD per provider; null or absent means no cap. */
  caps?: () => Partial<Record<GatewayProvider, number | null>> | null;
  /** Spend so far this calendar month (UTC) for a provider, in USD. */
  monthlySpend?: (provider: GatewayProvider) => number;
  /** Persist one call record. */
  record?: (r: AiCallRecord) => void;
};

const g = globalThis as unknown as { __careeros_gateway_hooks?: GatewayHooks };

export function setGatewayHooks(hooks: GatewayHooks | null): void {
  g.__careeros_gateway_hooks = hooks ?? undefined;
}

function hooks(): GatewayHooks {
  return g.__careeros_gateway_hooks ?? {};
}

/** The chain name a task uses; untasked calls are writing (drafts, letters, outreach). */
export function chainNameForTask(task: string | undefined): ChainName {
  if (task === "vision") return "vision";
  return (task && CONFIG.taskChains[task]) || "writing";
}

/** The model ids for a chain: the operator's edit when set and non-empty, else the default. */
export function resolveChain(name: ChainName): string[] {
  let edited: string[] | undefined;
  try { edited = hooks().chains?.()?.[name]; } catch { /* storage unavailable: use defaults */ }
  const list = (edited?.length ? edited : DEFAULT_CHAINS[name]).map(m => m.trim()).filter(Boolean);
  return [...new Set(list)];
}

export function resolveAllChains(): Record<ChainName, string[]> {
  return Object.fromEntries(CHAIN_NAMES.map(n => [n, resolveChain(n)])) as Record<ChainName, string[]>;
}

/** True when the provider has hit its monthly cap and must be skipped. */
export function overSpendCap(provider: GatewayProvider): boolean {
  try {
    const cap = hooks().caps?.()?.[provider];
    if (cap === null || cap === undefined || !Number.isFinite(cap)) return false;
    return (hooks().monthlySpend?.(provider) ?? 0) >= cap;
  } catch {
    return false;
  }
}

/** Estimated USD cost for providers that don't report one. */
export function estimateCostUsd(provider: GatewayProvider, model: string, promptTokens: number, completionTokens: number): number {
  const table = CONFIG.pricesPerMTok[provider] ?? {};
  const [inP, outP] = table[model] ?? table.default ?? [0, 0];
  return (promptTokens * inP + completionTokens * outP) / 1_000_000;
}

/** Logs and records one call. Never throws: the log must not break a call. */
export function recordAiCall(r: AiCallRecord): void {
  console.log(
    `[CareerOS AI] provider=${r.provider} task=${r.task} requested=${r.modelRequested} served=${r.modelServed} ok=${r.ok} ` +
    `prompt_tokens=${r.promptTokens} completion_tokens=${r.completionTokens} reasoning_tokens=${r.reasoningTokens} ` +
    `content_tokens=${Math.max(0, r.completionTokens - r.reasoningTokens)} cost_usd=${r.costUsd.toFixed(6)}${r.error ? ` error=${r.error.slice(0, 160)}` : ""}`,
  );
  try { hooks().record?.(r); } catch { /* recording is best effort */ }
}
