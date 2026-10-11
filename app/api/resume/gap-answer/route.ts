import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { chatJSON, ProviderSettings } from "../../../../lib/ai-client";
import { normalizeTextForATS } from "../../../../lib/ats";
import { ResumeGapAnswerResultSchema } from "../../../../lib/schemas";
import { resumeGapAnswerPrompt } from "../../../../lib/prompts";
import type { Profile } from "../../../../lib/profile";
import { classifyBulletCategories } from "../../../../lib/server/bullet-classifier";

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
      { temperature: 0.3, maxTokens: 300, task: "gap_analysis" },
      providerSettings,
      ResumeGapAnswerResultSchema,
    );

    const text = normalizeTextForATS(data.newBulletText);
    // The bullet's sub-label category is classified ONCE, here, and stored
    // with it by the client (lib/bullet-category.ts).
    const [category] = await classifyBulletCategories([{ company: targetLabel, text }], providerSettings);
    return NextResponse.json({ newBulletText: text, category });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Answer processing failed" }, { status: 500 });
  }
}
