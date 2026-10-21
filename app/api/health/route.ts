import { NextResponse } from "next/server";
import {
  chat, configuredTogetherModels, probeTogetherModel, isKnownNonServerless, DEFAULT_MODEL, getFallbackModels,
} from "../../../lib/ai-client";
import { getDb } from "../../../lib/server/db";

export const runtime = "nodejs";

/** Distinct Together models saved in users' model settings. Model names only: no emails leave this route. */
function storedTogetherModels(): string[] {
  try {
    const rows = getDb().prepare("SELECT data FROM singletons WHERE key = 'model_settings'").all() as { data: string }[];
    const models = new Set<string>();
    for (const r of rows) {
      try {
        const s = JSON.parse(r.data) as { provider?: string; model?: string };
        if ((s.provider ?? "together") === "together" && s.model) models.add(s.model);
      } catch { /* skip malformed row */ }
    }
    return [...models];
  } catch {
    return [];
  }
}

export async function GET() {
  const results: Record<string, any> = {
    env: {
      TOGETHER_API_KEY: process.env.TOGETHER_API_KEY ? `set (${process.env.TOGETHER_API_KEY.slice(0, 6)}...)` : "MISSING",
      AI_MODEL: process.env.AI_MODEL ?? `not set — using default ${DEFAULT_MODEL}`,
      AI_VISION_MODEL: process.env.AI_VISION_MODEL ?? "not set — using default",
      AI_FALLBACK_MODELS: process.env.AI_FALLBACK_MODELS ?? `not set — using default ${getFallbackModels().join(", ")}`,
    },
    models: [],
    nonServerlessModels: [],
    modelTest: null,
    error: null,
  };

  // Every configured Together model, plus any saved in a user's settings.
  const configured = configuredTogetherModels();
  for (const m of storedTogetherModels()) {
    const hit = configured.find(c => c.model === m);
    if (hit) hit.usedFor.push("stored user model setting");
    else configured.push({ model: m, usedFor: ["stored user model setting"] });
  }

  // Probe each one directly (1 token, no failover). Without a key, only the
  // known dedicated-endpoint list can be checked.
  const probes = await Promise.all(configured.map(c =>
    process.env.TOGETHER_API_KEY
      ? probeTogetherModel(c.model)
      : Promise.resolve(isKnownNonServerless(c.model)
        ? { model: c.model, status: "not-serverless" as const, detail: "known to need a dedicated endpoint" }
        : { model: c.model, status: "error" as const, detail: "not probed: TOGETHER_API_KEY missing" }),
  ));
  results.models = probes.map((p, i) => ({ ...p, usedFor: configured[i].usedFor }));
  // FLAGGED BY NAME: any configured model that is not serverless.
  results.nonServerlessModels = results.models.filter((p: { status: string }) => p.status === "not-serverless").map((p: { model: string; usedFor: string[] }) => ({
    model: p.model,
    usedFor: p.usedFor,
    message: `${p.model} is NOT serverless on Together (needs a dedicated endpoint); calls to it fail over to the next model. Change it.`,
  }));

  try {
    const reply = await chat(
      [{ role: "user", content: "Reply with exactly: OK" }],
      { temperature: 0, maxTokens: 10 }
    );
    results.modelTest = { success: true, reply };
  } catch (e: any) {
    results.error = e.message;
  }

  const allGood = !results.error && results.modelTest?.success && results.nonServerlessModels.length === 0;
  return NextResponse.json(results, { status: allGood ? 200 : 500 });
}
