// Server-only AI client. Supports Together AI (default), Anthropic, and OpenAI.
import { ZodSchema } from "zod";
import { chainNameForTask, resolveChain, overSpendCap, recordAiCall, estimateCostUsd, type GatewayProvider } from "./ai-gateway";

const TOGETHER_BASE = "https://api.together.xyz/v1";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// Fast, cheap, non-reasoning, SERVERLESS Together model: the default for
// every task. Not a REASONING_MODEL_PATTERNS match, so chatTogether never
// applies the 5x reasoning token multiplier to it.
export const CHEAP_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo";
// Never default to a model that needs a dedicated endpoint. DeepSeek V4 Pro
// was the default until Together moved it off serverless (400
// model_not_available: "Unable to access non-serverless model ... create
// and start a new dedicated endpoint"); every default is now serverless.
export const DEFAULT_MODEL = CHEAP_MODEL;

// Models known to need a dedicated endpoint on Together. Never a default;
// skipped straight to failover if configured, and flagged by /api/health.
// /api/health also probes every configured model live, so a model Together
// moves off serverless later is caught even if it isn't listed here.
export const KNOWN_NON_SERVERLESS_MODELS: readonly string[] = ["deepseek-ai/DeepSeek-V4-Pro"];

export function isKnownNonServerless(model: string | undefined | null): boolean {
  return !!model && KNOWN_NON_SERVERLESS_MODELS.some(m => m.toLowerCase() === model.toLowerCase());
}

// Together models tried, in order, after the primary fails over. Override
// with AI_FALLBACK_MODELS (comma-separated). Serverless only.
const DEFAULT_FALLBACK_MODELS = [CHEAP_MODEL];

export function getFallbackModels(): string[] {
  const env = process.env.AI_FALLBACK_MODELS?.split(",").map(m => m.trim()).filter(Boolean);
  return (env?.length ? env : DEFAULT_FALLBACK_MODELS).filter(m => !isKnownNonServerless(m));
}
const DEFAULT_VISION_MODEL = "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8";

// ---------------------------------------------------------------------------
// Per-task model selection (root-cause fix for the reasoning-token scoring
// failure): a single global AI_MODEL forced every call — including plain
// schema-constrained classification/extraction work — through DEFAULT_MODEL,
// a reasoning model. On a reasoning-heavy JD, DeepSeek-V4-Pro spends the
// ENTIRE token budget on internal chain-of-thought, content comes back
// empty, and scoring dies. A reasoning model is a poor fit for
// schema-constrained output under a token cap regardless of JD density —
// its "thinking" doesn't improve a classification task the way it improves
// open-ended drafting, it just competes with the budget the actual answer
// needs. Structured-JSON tasks get a non-reasoning instruct model instead;
// genuine drafting/pitch work (where the reasoning earns its cost) keeps
// the reasoning model. Each task's model is independently overridable via
// its own env var, with AI_MODEL preserved as the "drafting" tier's var for
// backward compatibility.
export type AiTask =
  | "scoring"            // AF scoring — lib/server/services/scoring-service.ts
  | "jd_extraction"      // app/api/parse-jd
  | "requirement_map"    // app/api/resume/requirement-map
  | "resume_selection"   // app/api/generate ("resume"/"refine" actions — the selection architecture)
  | "profile_extraction" // app/api/profile/extract, app/api/nl-update
  | "gap_analysis"       // app/api/resume/gap-questions, gap-answer, profile/questions, profile/rewrite-bullet
  | "form_answers"       // app/api/generate-form-answers, refine-form-answers
  | "company_discovery"  // app/api/companies/discover
  | "audit"              // app/api/resume/audit (already ran on CHEAP_MODEL; folded into this registry)
  | "evaluator"          // fresh-context evaluator gate (lib/server/services/evaluator.ts)
  | "skill_extraction"   // normalised skills from JDs (career tracks)
  | "reflector"          // playbook rule proposals from feedback events (lib/server/services/playbook-service.ts)
  | "drafting";          // resume/cover-letter/pitch/outreach generation, portfolio build voice drafting, skill-builder

const TASK_ENV_VARS: Record<AiTask, string> = {
  scoring: "AI_MODEL_SCORING",
  jd_extraction: "AI_MODEL_JD_EXTRACTION",
  requirement_map: "AI_MODEL_REQUIREMENT_MAP",
  resume_selection: "AI_MODEL_RESUME_SELECTION",
  profile_extraction: "AI_MODEL_PROFILE_EXTRACTION",
  gap_analysis: "AI_MODEL_GAP_ANALYSIS",
  form_answers: "AI_MODEL_FORM_ANSWERS",
  company_discovery: "AI_MODEL_COMPANY_DISCOVERY",
  audit: "AI_MODEL_AUDIT",
  evaluator: "AI_MODEL_EVALUATOR",
  skill_extraction: "AI_MODEL_SKILL_EXTRACTION",
  reflector: "AI_MODEL_REFLECTOR",
  drafting: "AI_MODEL", // the pre-existing global var — preserved for the one tier that still defaults to it
};

const TASK_DEFAULT_MODEL: Record<AiTask, string> = {
  scoring: CHEAP_MODEL,
  jd_extraction: CHEAP_MODEL,
  requirement_map: CHEAP_MODEL,
  resume_selection: CHEAP_MODEL,
  profile_extraction: CHEAP_MODEL,
  gap_analysis: CHEAP_MODEL,
  form_answers: CHEAP_MODEL,
  company_discovery: CHEAP_MODEL,
  audit: CHEAP_MODEL,
  evaluator: CHEAP_MODEL,
  skill_extraction: CHEAP_MODEL,
  reflector: CHEAP_MODEL,
  drafting: DEFAULT_MODEL,
};

/** Resolves a task's model: its own env var override, else the task's default (non-reasoning for every structured task, DEFAULT_MODEL only for "drafting"). */
export function getModelForTask(task: AiTask): string {
  return process.env[TASK_ENV_VARS[task]] ?? TASK_DEFAULT_MODEL[task];
}

/** Every Together model this deployment is configured to call (task models, AI_MODEL, fallbacks), deduplicated. */
export function configuredTogetherModels(): { model: string; usedFor: string[] }[] {
  const uses = new Map<string, Set<string>>();
  const note = (model: string | undefined, use: string) => {
    if (!model) return;
    if (!uses.has(model)) uses.set(model, new Set());
    uses.get(model)!.add(use);
  };
  for (const task of Object.keys(TASK_ENV_VARS) as AiTask[]) note(getModelForTask(task), `task:${task}`);
  note(process.env.AI_MODEL ?? DEFAULT_MODEL, "AI_MODEL (untasked calls)");
  for (const m of getFallbackModels()) note(m, "failover");
  return [...uses].map(([model, set]) => ({ model, usedFor: [...set] }));
}
// Fallback vision models tried in order when the primary returns 5xx
const FALLBACK_VISION_MODELS = [
  "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
  "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
];

// Models known to wrap output in <think>...</think> blocks (reasoning models).
const REASONING_MODEL_PATTERNS = [/deepseek-r1/i, /deepseek-v4/i, /qwq/i, /reasoning/i, /thinking/i, /\bo1\b/i, /\bo3\b/i];

function isReasoningModel(model: string): boolean {
  return REASONING_MODEL_PATTERNS.some(re => re.test(model));
}

function stripThinkBlocks(content: string): string {
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
  // Some reasoning models output an unclosed <think> if truncated — keep everything after the last </think>
  if (cleaned.includes("<think>") && !cleaned.includes("</think>")) {
    const lastThink = cleaned.lastIndexOf("<think>");
    cleaned = cleaned.slice(0, lastThink).trim();
  }
  return cleaned;
}

export type ChatMessage = {
  role: "user" | "system" | "assistant";
  content: string | Array<{ type: string; [key: string]: any }>;
};

export type ChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  // Resolves a per-task default model (see getModelForTask above) when no
  // explicit `model` is given. Only meaningful on the Together path — a
  // user's own configured Anthropic/OpenAI model always wins regardless.
  task?: AiTask;
  // Internal: skip the OpenRouter gateway (visionExtract tries it once itself).
  skipGateway?: boolean;
};

export type ProviderSettings = {
  provider: "together" | "anthropic" | "openai";
  model?: string;
  apiKey?: string;
};

function getTogetherKey(): string {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error("TOGETHER_API_KEY is not set. Add it to your Vercel environment variables.");
  return key;
}

// FAILOVER. A provider error that the NEXT model or provider could succeed
// on: auth/billing/permission (401/402/403), rate limit (429), server errors
// (5xx), and a 400/404 whose code says the model itself is unavailable
// (model_not_available / model_not_found: e.g. Together moving a model off
// serverless). Any other 4xx is a bad request and fails immediately.
const FAILOVER_MODEL_CODES = ["model_not_available", "model_not_found"];

export function providerErrorCode(body: string): string | null {
  try {
    const j = JSON.parse(body);
    const code = j?.error?.code ?? j?.code ?? j?.error?.type ?? j?.type;
    if (typeof code === "string") return code;
  } catch { /* not JSON */ }
  const m = body.match(/\b(model_not_available|model_not_found)\b/);
  return m ? m[1] : null;
}

export function isFailoverTrigger(status: number, code: string | null): boolean {
  if ([401, 402, 403, 429].includes(status) || status >= 500) return true;
  if ((status === 400 || status === 404) && code && FAILOVER_MODEL_CODES.includes(code)) return true;
  return false;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly provider: string,
    readonly failover: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function providerError(providerName: string, status: number, body: string): ProviderError {
  const code = providerErrorCode(body);
  return new ProviderError(`${providerName} error ${status}${code ? ` (${code})` : ""}: ${body.slice(0, 400)}`, status, code, providerName, isFailoverTrigger(status, code));
}

async function fetchWithRetry(url: string, init: RequestInit, providerName: string, maxAttempts = 4): Promise<Response> {
  let lastErr: ProviderError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    const body = await res.text().catch(() => "");
    const err = providerError(providerName, res.status, body);
    // Transient: retry the same model with backoff before failing over.
    if (res.status >= 500 || res.status === 429) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const delay = Math.min(8000, 500 * Math.pow(2, attempt - 1));
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
    throw err;
  }
  throw lastErr ?? new Error(`${providerName} request failed after ${maxAttempts} attempts`);
}

// Together's usage payload reports reasoning tokens under
// completion_tokens_details.reasoning_tokens (some responses instead put a
// top-level reasoning_tokens); either shape is handled the same way.
function extractTokenUsage(result: any): { completionTokens: number; reasoningTokens: number; contentTokens: number } {
  const usage = result.usage ?? {};
  const completionTokens = usage.completion_tokens ?? 0;
  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? 0;
  return { completionTokens, reasoningTokens, contentTokens: Math.max(0, completionTokens - reasoningTokens) };
}

/**
 * @param overrideMaxTokens Internal — set only by this function's own retry
 * call (see the reasoning-exhaustion branch below). Bypasses the normal
 * requestedTokens*5 reasoning multiplier so a retry's budget is exactly
 * what was computed for it, not multiplied again.
 */
async function chatTogether(messages: ChatMessage[], opts: ChatOptions, overrideMaxTokens?: number): Promise<string> {
  const model = resolveTogetherModel(opts);
  if (isKnownNonServerless(model)) {
    // Don't spend a request on a model known to need a dedicated endpoint.
    throw new ProviderError(`Together AI error 400 (model_not_available): ${model} is not available on serverless (it needs a dedicated endpoint).`, 400, "model_not_available", "Together AI", true);
  }
  const reasoning = isReasoningModel(model);
  // Reasoning models burn thousands of tokens on chain-of-thought before the final answer.
  // A reasoning model can need ~600 output tokens but ~8-15K reasoning tokens for a resume.
  // Give reasoning models 5x the requested budget with a 12K floor so output is never starved.
  const requestedTokens = opts.maxTokens ?? 2000;
  const maxTokens = overrideMaxTokens ?? (reasoning ? Math.max(requestedTokens * 5, 12000) : requestedTokens);

  const body: any = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: maxTokens,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const response = await fetchWithRetry(`${TOGETHER_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getTogetherKey()}` },
    body: JSON.stringify(body),
  }, "Together AI");
  const result = await response.json();
  const choice = result.choices?.[0];
  let content = choice?.message?.content ?? "";
  const finishReason = choice?.finish_reason ?? "unknown";
  const { completionTokens, reasoningTokens, contentTokens } = extractTokenUsage(result);
  const promptTokens = result.usage?.prompt_tokens ?? 0;
  recordAiCall({
    at: new Date().toISOString(), task: opts.task ?? "drafting", provider: "together", modelRequested: model,
    modelServed: result.model ?? model, promptTokens, completionTokens, reasoningTokens,
    costUsd: estimateCostUsd("together", model, promptTokens, completionTokens), ok: !!content,
  });

  // Log the reasoning/content token split on EVERY call — this is what
  // makes the "reasoning ate the whole budget" failure class visible
  // instead of silently surfacing as a downstream JSON-parse error.
  console.log(
    `[CareerOS AI] model=${model} task=${opts.task ?? "(none)"} finish_reason=${finishReason} ` +
    `max_tokens=${maxTokens} completion_tokens=${completionTokens} reasoning_tokens=${reasoningTokens} content_tokens=${contentTokens}`
  );

  // Explicit detection of the root-cause failure: content came back empty,
  // finish_reason is "length" (truncated, not a refusal/error), and
  // reasoning consumed tokens (or the model reported reasoning_content
  // separately) — the model spent the ENTIRE budget thinking and never got
  // to an answer. This is a recoverable token-budget problem, not a parse
  // error: retry ONCE with a substantially larger budget before giving up.
  // overrideMaxTokens is only set on that retry call, so this can only ever
  // fire once per top-level request.
  const reasoningExhaustedBudget = !content && finishReason === "length" && (reasoningTokens > 0 || !!choice?.message?.reasoning_content);
  if (reasoningExhaustedBudget && overrideMaxTokens === undefined) {
    const retryTokens = Math.max(maxTokens * 3, reasoningTokens * 2, 24000);
    console.warn(
      `[CareerOS AI] ${model} exhausted its ${maxTokens}-token budget entirely on reasoning ` +
      `(reasoning_tokens=${reasoningTokens}), content came back empty. Retrying once with max_tokens=${retryTokens}.`
    );
    return chatTogether(messages, opts, retryTokens);
  }

  // Reached only when the retry itself (overrideMaxTokens set) STILL shows
  // the same reasoning-exhaustion pattern — give the retry-aware message
  // regardless of whether this response happens to carry a separate
  // reasoning_content field; usage.reasoning_tokens alone is enough to
  // know what happened (that's exactly the real reported shape: all
  // completion tokens spent as reasoning_tokens, no reasoning_content field).
  if (reasoningExhaustedBudget && overrideMaxTokens !== undefined) {
    const reasoningPreview = choice?.message?.reasoning_content
      ? ` Reasoning ended with: "...${String(choice.message.reasoning_content).slice(-1500)}".`
      : "";
    throw new Error(
      `${model} hit the ${maxTokens}-token budget while reasoning and never produced a final answer, even after retrying with a larger budget.${reasoningPreview}`
    );
  }

  // Some reasoning models return content separately as `reasoning_content` plus `content`,
  // with finish_reason NOT "length" (so the retry branch above never applied) — the model
  // finished thinking but never emitted a final answer for some other reason.
  if (!content && choice?.message?.reasoning_content) {
    const reasoningPreview = String(choice.message.reasoning_content).slice(-1500);
    throw new Error(
      `${model} hit the ${maxTokens}-token budget while reasoning and never produced a final answer. ` +
      `Reasoning ended with: "...${reasoningPreview}".`
    );
  }

  if (!content) {
    const errMsg = result.error?.message ?? result.error ?? JSON.stringify(result).slice(0, 400);
    throw new Error(
      `${model} returned empty content. finish_reason="${finishReason}", max_tokens=${maxTokens}. Raw response: ${errMsg}`
    );
  }

  if (reasoning) content = stripThinkBlocks(content);
  // After stripping <think> blocks, content might be empty if the model never closed the block
  if (!content.trim()) {
    throw new Error(
      `${model} returned only <think> reasoning blocks with no final answer. The model likely hit the ${maxTokens}-token budget mid-reasoning. Retry the request.`
    );
  }
  return content.trim();
}

async function chatAnthropic(messages: ChatMessage[], opts: ChatOptions, apiKey: string): Promise<string> {
  const model = opts.model ?? "claude-opus-4-7";
  const system = messages.find(m => m.role === "system");
  const userMessages = messages.filter(m => m.role !== "system");

  const body: any = {
    model,
    max_tokens: opts.maxTokens ?? 2000,
    temperature: opts.temperature ?? 0.7,
    messages: userMessages,
  };
  if (system) body.system = system.content;

  const response = await fetchWithRetry(`${ANTHROPIC_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  }, "Anthropic");
  const result = await response.json();
  const promptTokens = result.usage?.input_tokens ?? 0;
  const completionTokens = result.usage?.output_tokens ?? 0;
  recordAiCall({
    at: new Date().toISOString(), task: opts.task ?? "drafting", provider: "anthropic", modelRequested: model, modelServed: result.model ?? model,
    promptTokens, completionTokens, reasoningTokens: 0, costUsd: estimateCostUsd("anthropic", model, promptTokens, completionTokens), ok: true,
  });
  return result.content?.[0]?.text?.trim() ?? "";
}

async function chatOpenAI(messages: ChatMessage[], opts: ChatOptions, apiKey: string): Promise<string> {
  const model = opts.model ?? "gpt-4o";
  const body: any = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2000,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const response = await fetchWithRetry(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }, "OpenAI");
  const result = await response.json();
  const promptTokens = result.usage?.prompt_tokens ?? 0;
  const completionTokens = result.usage?.completion_tokens ?? 0;
  recordAiCall({
    at: new Date().toISOString(), task: opts.task ?? "drafting", provider: "openai", modelRequested: model, modelServed: result.model ?? model,
    promptTokens, completionTokens, reasoningTokens: result.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    costUsd: estimateCostUsd("openai", model, promptTokens, completionTokens), ok: true,
  });
  return result.choices?.[0]?.message?.content?.trim() ?? "";
}

/**
 * OpenRouter (OpenAI-compatible). One request carries the whole chain as
 * OpenRouter's native fallback list ("models"), with provider routing set to
 * deny data collection. The response names the model that actually served.
 */
async function chatOpenRouter(messages: ChatMessage[], opts: ChatOptions, chain: string[], task: string): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new ProviderError("OpenRouter error 401: OPENROUTER_API_KEY is not set", 401, null, "OpenRouter", true);
  const body: any = {
    model: chain[0],
    models: chain,
    provider: { data_collection: "deny" },
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2000,
    usage: { include: true },
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };
  const response = await fetchWithRetry(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}`, "X-Title": "CareerOS" },
    body: JSON.stringify(body),
  }, "OpenRouter");
  const result = await response.json();
  const choice = result.choices?.[0];
  let content: string = choice?.message?.content ?? "";
  const usage = result.usage ?? {};
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const served = result.model ?? chain[0];
  recordAiCall({
    at: new Date().toISOString(), task, provider: "openrouter", modelRequested: chain.join(" > "), modelServed: served,
    promptTokens, completionTokens, reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    costUsd: typeof usage.cost === "number" ? usage.cost : estimateCostUsd("openrouter", served, promptTokens, completionTokens), ok: !!content,
  });
  content = stripThinkBlocks(content);
  if (!content.trim()) {
    // Nothing usable from the whole chain: fail over to the next provider.
    throw new ProviderError(`OpenRouter error 502 (empty_content): ${served} returned no content (finish_reason=${choice?.finish_reason ?? "unknown"})`, 502, "empty_content", "OpenRouter", true);
  }
  return content.trim();
}

function resolveTogetherModel(opts: ChatOptions): string {
  return opts.model ?? (opts.task ? getModelForTask(opts.task) : undefined) ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
}

type Attempt = { label: string; provider: GatewayProvider; run: () => Promise<string> };

/**
 * The ordered attempts for one call: the configured provider/model first,
 * then Together's task model and serverless fallbacks (when a Together key
 * is configured). Image (vision) calls get no text-model fallbacks:
 * visionExtract has its own vision chain.
 */
function buildAttempts(messages: ChatMessage[], opts: ChatOptions, provider?: ProviderSettings): Attempt[] {
  const attempts: Attempt[] = [];
  if (provider?.provider === "anthropic" && provider.apiKey) {
    const model = opts.model ?? provider.model;
    attempts.push({ label: `anthropic:${model ?? "default"}`, provider: "anthropic", run: () => chatAnthropic(messages, { ...opts, model }, provider.apiKey!) });
  } else if (provider?.provider === "openai" && provider.apiKey) {
    const model = opts.model ?? provider.model;
    attempts.push({ label: `openai:${model ?? "default"}`, provider: "openai", run: () => chatOpenAI(messages, { ...opts, model }, provider.apiKey!) });
  }
  const isVision = messages.some(m => Array.isArray(m.content));
  // The gateway: the task's OpenRouter chain, before Together.
  if (process.env.OPENROUTER_API_KEY && !opts.skipGateway) {
    const chainName = isVision ? "vision" : chainNameForTask(opts.task);
    // Always the chain: an explicit opts.model names a Together model.
    const chain = resolveChain(chainName);
    if (chain.length) {
      attempts.push({ label: `openrouter:${chainName}[${chain.join(",")}]`, provider: "openrouter", run: () => chatOpenRouter(messages, opts, chain, isVision ? "vision" : (opts.task ?? "drafting")) });
    }
  }
  // A Together fallback behind another provider never reuses that provider's model name.
  const byo = attempts.some(a => a.provider === "anthropic" || a.provider === "openai");
  const primaryTogether = byo
    ? resolveTogetherModel({ ...opts, model: undefined })
    : resolveTogetherModel({ ...opts, model: opts.model ?? provider?.model });
  // Together is the last fallback, used only when its key exists (or when
  // nothing else is configured, so the missing-key error is explicit).
  const togetherModels = attempts.length && !process.env.TOGETHER_API_KEY ? [] : [primaryTogether];
  if (!isVision && process.env.TOGETHER_API_KEY) {
    togetherModels.push(...[opts.task ? getModelForTask(opts.task) : DEFAULT_MODEL, ...getFallbackModels()]);
  }
  const seen = new Set<string>();
  for (const model of togetherModels) {
    if (seen.has(model)) continue;
    seen.add(model);
    attempts.push({ label: `together:${model}`, provider: "together", run: () => chatTogether(messages, { ...opts, model }) });
  }
  return attempts;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}, provider?: ProviderSettings): Promise<string> {
  // Spend guard: a provider at its monthly cap is skipped.
  const all = buildAttempts(messages, opts, provider);
  const attempts = all.filter(a => !overSpendCap(a.provider));
  if (attempts.length < all.length) {
    console.warn(`[CareerOS AI] spend cap reached, skipping: ${[...new Set(all.filter(a => !attempts.includes(a)).map(a => a.provider))].join(", ")}`);
  }
  if (!attempts.length) throw new Error("Every configured AI provider is at its monthly spend cap. Raise a cap in Settings or wait for the new month.");
  let lastErr: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      return await attempts[i].run();
    } catch (e) {
      lastErr = e;
      if (e instanceof ProviderError) {
        recordAiCall({
          at: new Date().toISOString(), task: opts.task ?? "drafting", provider: attempts[i].provider, modelRequested: attempts[i].label,
          modelServed: "", promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0, ok: false, error: `${e.status}${e.code ? ` ${e.code}` : ""}`,
        });
      }
      const canFailOver = e instanceof ProviderError && e.failover && i < attempts.length - 1;
      if (!canFailOver) throw e;
      console.warn(`[CareerOS AI] failover: ${attempts[i].label} failed (${(e as ProviderError).status}${(e as ProviderError).code ? ` ${(e as ProviderError).code}` : ""}); trying ${attempts[i + 1].label}`);
    }
  }
  throw lastErr ?? new Error("No AI provider configured");
}

function cleanJsonString(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```json")) s = s.slice(7);
  if (s.startsWith("```")) s = s.slice(3);
  if (s.endsWith("```")) s = s.slice(0, -3);
  return s.trim();
}

// chatJSON: parses the LLM response as JSON, optionally validates it against a
// Zod schema. When a schema is provided, a single retry is attempted on parse
// or validation failure before a clear error is thrown.
export async function chatJSON<T>(
  messages: ChatMessage[],
  opts: ChatOptions = {},
  provider?: ProviderSettings,
  schema?: ZodSchema<T>
): Promise<T> {
  async function attempt(): Promise<T> {
    const raw = await chat(messages, { ...opts, jsonMode: true }, provider);
    const parsed = JSON.parse(cleanJsonString(raw)) as T;
    if (!schema) return parsed;
    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
    const issues = result.error.issues
      .map(i => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    const err = new Error("schema:" + issues) as Error & { isValidationError: boolean };
    err.isValidationError = true;
    throw err;
  }

  try {
    return await attempt();
  } catch (e: any) {
    if (!schema) throw e;
    // Retry once on any parse or validation failure
    try {
      return await attempt();
    } catch (e2: any) {
      if (e2.isValidationError) {
        throw new Error(
          "AI response failed schema validation after retry: " +
          e2.message.replace("schema:", "")
        );
      }
      throw e2;
    }
  }
}

export async function visionExtract(base64: string, mimeType: string, instruction: string): Promise<string> {
  const primaryModel = process.env.AI_VISION_MODEL ?? DEFAULT_VISION_MODEL;
  const modelsToTry = [primaryModel, ...FALLBACK_VISION_MODELS.filter(m => m !== primaryModel)];

  const messages: ChatMessage[] = [{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
      { type: "text", text: instruction },
    ],
  }];

  let lastError: Error | null = null;
  // The gateway's vision chain first (once), then the Together vision chain.
  if (process.env.OPENROUTER_API_KEY && !overSpendCap("openrouter")) {
    const chain = resolveChain("vision");
    if (chain.length) {
      try {
        return await chatOpenRouter(messages, { temperature: 0.1, maxTokens: 3000 }, chain, "vision");
      } catch (e: any) {
        lastError = e;
        if (!(e instanceof ProviderError && e.failover)) throw e;
      }
    }
  }
  for (const model of modelsToTry) {
    try {
      return await chat(messages, { temperature: 0.1, maxTokens: 3000, model, skipGateway: true });
    } catch (e: any) {
      lastError = e;
      // Fall through to the next vision model on any failover trigger
      // (5xx, 429, auth, or the model being unavailable); other 4xx are terminal.
      if (!(e instanceof ProviderError && e.failover)) throw e;
    }
  }
  throw lastError ?? new Error("All vision models failed");
}

export type ModelProbe = {
  model: string;
  // "serverless": answered. "not-serverless": Together refused it as
  // non-serverless (model_not_available / model_not_found, or it is a known
  // dedicated-endpoint model). "error": failed for another reason (key,
  // rate limit, outage), so serverless status is unknown.
  status: "serverless" | "not-serverless" | "error";
  httpStatus?: number;
  code?: string | null;
  detail?: string;
};

/**
 * One direct, 1-token request to a Together model: no retry, no failover,
 * so the result is about THIS model. Used by /api/health.
 */
export async function probeTogetherModel(model: string): Promise<ModelProbe> {
  if (isKnownNonServerless(model)) {
    return { model, status: "not-serverless", code: "model_not_available", detail: "known to need a dedicated endpoint" };
  }
  try {
    const res = await fetch(`${TOGETHER_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getTogetherKey()}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "OK" }], max_tokens: 1, temperature: 0 }),
    });
    if (res.ok) return { model, status: "serverless", httpStatus: res.status };
    const body = await res.text().catch(() => "");
    const code = providerErrorCode(body);
    const notServerless = (res.status === 400 || res.status === 404) && !!code && FAILOVER_MODEL_CODES.includes(code);
    return { model, status: notServerless ? "not-serverless" : "error", httpStatus: res.status, code, detail: body.slice(0, 300) };
  } catch (e) {
    return { model, status: "error", detail: (e as Error).message };
  }
}
