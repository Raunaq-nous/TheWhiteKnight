import { NextRequest, NextResponse } from "next/server";
import { chatJSON, ProviderSettings } from "../../../lib/ai-client";
import { nlUpdatePrompt, NLUpdateResult } from "../../../lib/prompts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { text, app, providerSettings } = await req.json() as {
      text: string;
      app: any;
      providerSettings?: ProviderSettings;
    };

    if (!text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });
    if (!app) return NextResponse.json({ error: "app is required" }, { status: 400 });

    const prompt = nlUpdatePrompt(text, app);
    const result = await chatJSON<NLUpdateResult>(
      [{ role: "user", content: prompt }],
      { temperature: 0.1, maxTokens: 1000 },
      providerSettings
    );

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Parse failed" }, { status: 500 });
  }
}
