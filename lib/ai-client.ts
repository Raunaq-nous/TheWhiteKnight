// Server-only AI client. Supports Together AI (default), Anthropic, and OpenAI.

const TOGETHER_BASE = "https://api.together.xyz/v1";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const OPENAI_BASE = "https://api.openai.com/v1";

const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4-Pro";
const DEFAULT_VISION_MODEL = "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8";

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

async function chatTogether(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const model = opts.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
  const body: any = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2000,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const response = await fetch(`${TOGETHER_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getTogetherKey()}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Together AI error ${response.status}: ${err.slice(0, 400)}`);
  }
  const result = await response.json();
  return result.choices?.[0]?.message?.content?.trim() ?? "";
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

  const response = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic error ${response.status}: ${err.slice(0, 400)}`);
  }
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

  const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${err.slice(0, 400)}`);
  }
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
