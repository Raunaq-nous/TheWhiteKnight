// Server-only AI client. Supports Together AI (default), Anthropic, and OpenAI.
import { ZodSchema } from "zod";

const TOGETHER_BASE = "https://api.together.xyz/v1";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const OPENAI_BASE = "https://api.openai.com/v1";

// DeepSeek V4 Pro is a reasoning model — high quality but it spends tokens on internal
// chain-of-thought before the final answer. We compensate with a much larger token budget.
const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4-Pro";
// Fast, cheap, non-reasoning Together model for high-volume structured
// tasks that don't need DEFAULT_MODEL's reasoning depth (e.g. resume
// audit scoring — one call per generated draft, plain classification/
// scoring work). Not a REASONING_MODEL_PATTERNS match, so chatTogether
// never applies the 5x reasoning token multiplier to it either.
export const CHEAP_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo";
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
  drafting: DEFAULT_MODEL,
};

/** Resolves a task's model: its own env var override, else the task's default (non-reasoning for every structured task, DEFAULT_MODEL only for "drafting"). */
export function getModelForTask(task: AiTask): string {
  return process.env[TASK_ENV_VARS[task]] ?? TASK_DEFAULT_MODEL[task];
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

async function fetchWithRetry(url: string, init: RequestInit, providerName: string, maxAttempts = 4): Promise<Response> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    if (res.status >= 500 || res.status === 429) {
      const body = await res.text().catch(() => "");
      lastErr = new Error(`${providerName} error ${res.status}: ${body.slice(0, 400)}`);
      if (attempt < maxAttempts) {
        const delay = Math.min(8000, 500 * Math.pow(2, attempt - 1));
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw lastErr;
    }
    const body = await res.text().catch(() => "");
    throw new Error(`${providerName} error ${res.status}: ${body.slice(0, 400)}`);
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
  const model = opts.model ?? (opts.task ? getModelForTask(opts.task) : undefined) ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
  const reasoning = isReasoningModel(model);
  // Reasoning models burn thousands of tokens on chain-of-thought before the final answer.
  // For DeepSeek-V4-Pro a typical resume needs ~600 output tokens but ~8-15K reasoning tokens.
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
  return result.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}, provider?: ProviderSettings): Promise<string> {
  if (provider?.provider === "anthropic" && provider.apiKey) {
    return chatAnthropic(messages, { ...opts, model: opts.model ?? provider.model }, provider.apiKey);
  }
  if (provider?.provider === "openai" && provider.apiKey) {
    return chatOpenAI(messages, { ...opts, model: opts.model ?? provider.model }, provider.apiKey);
  }
  return chatTogether(messages, { ...opts, model: opts.model ?? provider?.model });
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
  for (const model of modelsToTry) {
    try {
      return await chat(messages, { temperature: 0.1, maxTokens: 3000, model });
    } catch (e: any) {
      lastError = e;
      // Only fall through to next model on server errors (5xx); client errors are terminal
      if (!/error 5\d\d/i.test(e.message ?? "")) throw e;
    }
  }
  throw lastError ?? new Error("All vision models failed");
}
