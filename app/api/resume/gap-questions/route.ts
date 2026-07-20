import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { chatJSON, ProviderSettings } from "../../../../lib/ai-client";
import { ResumeGapQuestionsResultSchema, ResumeGapQuestion } from "../../../../lib/schemas";
import { resumeGapQuestionsPrompt } from "../../../../lib/prompts";
import type { Profile } from "../../../../lib/profile";
import type { Application } from "../../../../lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

// Job-scoped gap analysis: compares THIS job's target priorities against
// the profile and asks about genuine gaps — distinct from
// /api/profile/questions, which scans the whole profile for generic weak
// bullets regardless of any particular job.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`resume-gap-questions:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) },
    });
  }

  try {
    const { profile, app, providerSettings, targetPriorities, subFocus } = await req.json() as {
      profile: Profile;
      app: Application;
      providerSettings?: ProviderSettings;
      targetPriorities?: string[];
      subFocus?: string | null;
    };

    if (!profile || !app) {
      return NextResponse.json({ error: "Missing profile or app" }, { status: 400 });
    }

    const data = await chatJSON<{ questions: ResumeGapQuestion[] }>(
      [{ role: "user", content: resumeGapQuestionsPrompt(profile, app, targetPriorities ?? [], subFocus) }],
      { temperature: 0.4, maxTokens: 1200 },
      providerSettings,
      ResumeGapQuestionsResultSchema,
    );

    return NextResponse.json({ questions: data.questions ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Gap analysis failed" }, { status: 500 });
  }
}
