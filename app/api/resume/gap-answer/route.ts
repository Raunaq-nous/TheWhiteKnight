import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { chatJSON, ProviderSettings } from "../../../../lib/ai-client";
import { normalizeTextForATS } from "../../../../lib/ats";
import { ResumeGapAnswerResultSchema } from "../../../../lib/schemas";
import { resumeGapAnswerPrompt } from "../../../../lib/prompts";
import type { Profile } from "../../../../lib/profile";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`resume-gap-answer:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) },
    });
  }

  try {
    const { profile, providerSettings, targetLabel, priority, question, answer } = await req.json() as {
      profile: Profile;
      providerSettings?: ProviderSettings;
      targetLabel: string;
      priority: string;
      question: string;
      answer: string;
    };

    if (!profile || !targetLabel || !question || !answer?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const data = await chatJSON<{ newBulletText: string }>(
      [{ role: "user", content: resumeGapAnswerPrompt(profile, targetLabel, priority ?? "", question, answer.trim()) }],
      { temperature: 0.3, maxTokens: 300 },
      providerSettings,
      ResumeGapAnswerResultSchema,
    );

    return NextResponse.json({ newBulletText: normalizeTextForATS(data.newBulletText) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Answer processing failed" }, { status: 500 });
  }
}
