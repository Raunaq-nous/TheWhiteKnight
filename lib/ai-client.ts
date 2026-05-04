// Server-only Together AI client. No Portkey.
// Together AI is OpenAI-API-compatible — same request/response format, different base URL.

const TOGETHER_BASE = "https://api.together.xyz/v1";

// Primary: Kimi K2 — 1T param MoE, 32B active, best open-source for agentic generation tasks
// Fallback: DeepSeek V3 — strong general-purpose, widely available
const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4-Pro";
const DEFAULT_VISION_MODEL = "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8";

type ChatMessage = {
  role: "user" | "system" | "assistant";
  content: string | Array<{ type: string; [key: string]: any }>;
};

type ChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
};

function getApiKey(): string {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error("TOGETHER_API_KEY is not set. Add it to your Vercel environment variables.");
  return key;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const model = opts.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
  const body: any = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2000,
  };
  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(`${TOGETHER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Together AI error ${response.status}: ${errText.slice(0, 400)}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function chatJSON<T>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<T> {
  const raw = await chat(messages, { ...opts, jsonMode: true });
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
