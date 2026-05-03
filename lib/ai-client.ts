// Server-only Portkey gateway client.
// Routes all AI traffic through Portkey so the underlying provider key never touches the browser.
//
// Recommended model: deepseek-ai/DeepSeek-V3 via Together AI — open-source, Opus-class reasoning.
// Set AI_MODEL + AI_PROVIDER in your env, or configure a virtual key in the Portkey dashboard.
//
// Model options by provider:
//   Together AI (AI_PROVIDER=together-ai):
//     deepseek-ai/DeepSeek-V3                         ← best overall, Opus-class
//     meta-llama/Llama-4-Maverick-17B-128E-Instruct   ← best for structured outputs
//     Qwen/Qwen3-235B-A22B                            ← strong reasoning, MoE
//   Groq (AI_PROVIDER=groq):
//     deepseek-r1-distill-llama-70b                   ← fast reasoning
//     llama-4-maverick-17b-128e-instruct              ← fast, good quality
//   Fireworks (AI_PROVIDER=fireworks-ai):
//     accounts/fireworks/models/deepseek-v3           ← DeepSeek V3

const PORTKEY_BASE = "https://api.portkey.ai/v1";

// Default: DeepSeek V3 via Together AI
const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V3";
const DEFAULT_PROVIDER = "together-ai";

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

function getAuthHeaders(): Record<string, string> {
  const apiKey = process.env.PORTKEY_API_KEY;
  if (!apiKey) {
    throw new Error("PORTKEY_API_KEY is not set. Add it to your Vercel environment variables.");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-portkey-api-key": apiKey,
  };

  // If a virtual key is set, it contains all provider routing — no other headers needed.
  const virtualKey = process.env.PORTKEY_VIRTUAL_KEY;
  if (virtualKey) {
    headers["x-portkey-virtual-key"] = virtualKey;
    return headers;
  }

  // Otherwise route explicitly by provider.
  const provider = process.env.AI_PROVIDER ?? DEFAULT_PROVIDER;
  headers["x-portkey-provider"] = provider;

  // Provider-specific auth headers
  const providerKey = process.env.AI_PROVIDER_KEY;
  if (providerKey) {
    headers["Authorization"] = `Bearer ${providerKey}`;
  }

  return headers;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const model = opts.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
  const body: any = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2000,
  };
  // DeepSeek and Llama support JSON mode; enable it only when explicitly requested
  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(`${PORTKEY_BASE}/chat/completions`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI gateway error ${response.status}: ${errText.slice(0, 400)}`);
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

// Vision is only available on multimodal models (gpt-4o, llama-4-maverick, etc.).
// Falls back to a text-only extraction prompt if the model doesn't support images.
export async function visionExtract(base64: string, mimeType: string, instruction: string): Promise<string> {
  const model = process.env.AI_VISION_MODEL ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
  return chat([{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
      { type: "text", text: instruction },
    ],
  }], { temperature: 0.1, maxTokens: 3000, model });
}
