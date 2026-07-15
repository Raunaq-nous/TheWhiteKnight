import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { chatJSON, ProviderSettings } from "../../../../lib/ai-client";
import { normalizeTextForATS } from "../../../../lib/ats";
import { BulletRewriteResultSchema } from "../../../../lib/schemas";
import { bulletRewritePrompt } from "../../../../lib/prompts";
import type { Profile } from "../../../../lib/profile";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`profile-rewrite:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) },
    });
  }

  try {
    const { profile, providerSettings, targetLabel, currentText, question, answer } = await req.json() as {
      profile: Profile;
      providerSettings?: ProviderSettings;
      targetLabel: string;
      currentText: string;
      question: string;
      answer: string;
    };

    if (!profile || !targetLabel || !currentText || !question || !answer?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const data = await chatJSON<{ rewrittenText: string }>(
      [{ role: "user", content: bulletRewritePrompt(profile, targetLabel, currentText, question, answer.trim()) }],
      { temperature: 0.3, maxTokens: 400 },
      providerSettings,
      BulletRewriteResultSchema,
    );

    return NextResponse.json({ rewrittenText: normalizeTextForATS(data.rewrittenText) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Rewrite failed" }, { status: 500 });
  }
}
