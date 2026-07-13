import { getCache, updateCacheModelSettings, wt_saveSettings } from "./data-cache";
import { showToast } from "./toast";

export type ModelProvider = "together" | "anthropic" | "openai";

export type ModelSettings = {
  provider: ModelProvider;
  model: string;
  apiKey?: string;
};

export const MODEL_OPTIONS = [
  {
    provider: "together" as const,
    model: "deepseek-ai/DeepSeek-V4-Pro",
    label: "DeepSeek V4 Pro",
    sublabel: "Together AI",
    description: "Best open-source model for reasoning and agentic tasks. 1T param MoE, 128K context.",
    pricing: "Included — no key needed",
    requiresKey: false,
  },
  {
    provider: "anthropic" as const,
    model: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    sublabel: "Anthropic",
    description: "Most capable Claude model. Best for nuanced writing, complex reasoning, and long documents.",
    pricing: "~$15 / 1M input · ~$75 / 1M output",
    requiresKey: true,
    keyPlaceholder: "sk-ant-api03-...",
    keyLink: "https://console.anthropic.com/settings/keys",
  },
  {
    provider: "openai" as const,
    model: "gpt-4o",
    label: "GPT-4o",
    sublabel: "OpenAI",
    description: "OpenAI's flagship multimodal model. Strong coding and instruction-following.",
    pricing: "~$2.50 / 1M input · ~$10 / 1M output",
    requiresKey: true,
    keyPlaceholder: "sk-...",
    keyLink: "https://platform.openai.com/api-keys",
  },
] as const;

const DEFAULT: ModelSettings = { provider: "together", model: "deepseek-ai/DeepSeek-V4-Pro" };

export function getModelSettings(): ModelSettings {
  return getCache().modelSettings ?? DEFAULT;
}

export async function saveModelSettings(settings: ModelSettings): Promise<boolean> {
  updateCacheModelSettings(settings);
  try {
    await wt_saveSettings("model_settings", settings);
    return true;
  } catch (e: any) {
    console.error("[CareerOS] saveModelSettings failed:", e);
    showToast(e?.message ?? "Failed to save model settings", "error");
    return false;
  }
}
