// Server-only AI client. Supports Together AI (default), Anthropic, and OpenAI.

const TOGETHER_BASE = "https://api.together.xyz/v1";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const OPENAI_BASE = "https://api.openai.com/v1";

// DeepSeek V4 Pro is a reasoning model — high quality but it spends tokens on internal
// chain-of-thought before the final answer. We compensate with a much larger token budget.
const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4-Pro";
const DEFAULT_VISION_MODEL = "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8";

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

async function chatTogether(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const model = opts.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
  const reasoning = isReasoningModel(model);
  // Reasoning models burn thousands of tokens on chain-of-thought before the final answer.
  // For DeepSeek-V4-Pro a typical resume needs ~600 output tokens but ~8-15K reasoning tokens.
  // Give reasoning models 5x the requested budget with a 12K floor so output is never starved.
  const requestedTokens = opts.maxTokens ?? 2000;
  const maxTokens = reasoning ? Math.max(requestedTokens * 5, 12000) : requestedTokens;

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

  // Some reasoning models return content separately as `reasoning_content` plus `content`.
  // If `content` is empty but `reasoning_content` exists, the model finished thinking but never
  // emitted a final answer (usually because max_tokens was hit during reasoning).
  if (!content && choice?.message?.reasoning_content) {
    const reasoningPreview = String(choice.message.reasoning_content).slice(-1500);
    throw new Error(
      `${model} hit the ${maxTokens}-token budget while reasoning and never produced a final answer. ` +
      `Reasoning ended with: "...${reasoningPreview}". Try shortening the input or retry — token budget has already been raised to its safe maximum.`
    );
  }

  if (!content) {
    const finishReason = choice?.finish_reason ?? "unknown";
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

export async function chatJSON<T>(messages: ChatMessage[], opts: ChatOptions = {}, provider?: ProviderSettings): Promise<T> {
  const raw = await chat(messages, { ...opts, jsonMode: true }, provider);
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  return JSON.parse(cleaned.trim()) as T;
}

export async function visionExtract(base64: string, mimeType: string, instruction: string): Promise<string> {
  const model = process.env.AI_VISION_MODEL ?? DEFAULT_VISION_MODEL;
  return chat([{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
      { type: "text", text: instruction },
    ],
  }], { temperature: 0.1, maxTokens: 3000, model });
}
