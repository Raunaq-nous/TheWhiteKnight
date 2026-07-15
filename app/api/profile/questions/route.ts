import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { chatJSON, ProviderSettings } from "../../../../lib/ai-client";
import { ProfileQuestionsResultSchema, ProfileQuestion } from "../../../../lib/schemas";
import { profileQuestionsPrompt } from "../../../../lib/prompts";
import { getWeakBulletCandidates } from "../../../../lib/profile-bullet-quality";
import type { Profile } from "../../../../lib/profile";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`profile-questions:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) },
    });
  }

  try {
    const { profile, providerSettings, excludeQuestionTexts } = await req.json() as {
      profile: Profile;
      providerSettings?: ProviderSettings;
      excludeQuestionTexts?: string[];
    };

    if (!profile) {
      return NextResponse.json({ error: "Missing profile" }, { status: 400 });
    }

    // Deterministic pre-filter: only bullets/descriptions with zero
    // quantification signal become LLM candidates at all. If none exist,
    // skip the AI call entirely — every bullet is already quantified.
    const candidates = getWeakBulletCandidates(profile);
    if (candidates.length === 0) {
      return NextResponse.json({ questions: [] });
    }

    const data = await chatJSON<{ questions: ProfileQuestion[] }>(
      [{ role: "user", content: profileQuestionsPrompt(profile, candidates, excludeQuestionTexts ?? []) }],
      { temperature: 0.4, maxTokens: 1200 },
      providerSettings,
      ProfileQuestionsResultSchema,
    );

    return NextResponse.json({ questions: data.questions ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Question generation failed" }, { status: 500 });
  }
}
