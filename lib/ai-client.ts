// Server-only Portkey gateway client.
// Routes all AI traffic through Portkey so the underlying provider key never touches the browser.

const PORTKEY_BASE = "https://api.portkey.ai/v1";

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
    throw new Error("PORTKEY_API_KEY is not set in environment");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-portkey-api-key": apiKey,
  };
  const virtualKey = process.env.PORTKEY_VIRTUAL_KEY;
  if (virtualKey) {
    headers["x-portkey-virtual-key"] = virtualKey;
  }
  return headers;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const model = opts.model ?? process.env.AI_MODEL ?? "gpt-4o-mini";
  const body: any = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2000,
  };
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
    throw new Error(`Portkey error ${response.status}: ${errText.slice(0, 300)}`);
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
  return chat([{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
      { type: "text", text: instruction },
    ],
  }], { temperature: 0.1, maxTokens: 3000 });
}
