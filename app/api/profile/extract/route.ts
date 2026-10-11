import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { chatJSON, ProviderSettings } from "../../../../lib/ai-client";
import { ProfileExtractionResultSchema } from "../../../../lib/schemas";
import { profileExtractionPrompt } from "../../../../lib/prompts";
import { ExtractedProfileData } from "../../../../lib/profile-merge";
import type { Profile } from "../../../../lib/profile";
import { attachBulletCategories } from "../../../../lib/server/bullet-classifier";

export const runtime = "nodejs";
export const maxDuration = 60;

// Shared by Feature 1 (paste-and-extract) and Feature 3 (learn from resume
// edits, via diffAgainstText) — the model only proposes candidate entities;
// matching/merging against the profile happens client-side in
// lib/profile-merge.ts.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`profile-extract:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) },
    });
  }

  try {
    const { text, profile, providerSettings, diffAgainstText } = await req.json() as {
      text: string;
      profile: Profile;
      providerSettings?: ProviderSettings;
      diffAgainstText?: string;
    };

    if (!text?.trim() || text.trim().length < 30) {
      return NextResponse.json({ error: "Text is too short to extract anything useful from." }, { status: 400 });
    }
    if (!profile) {
      return NextResponse.json({ error: "Missing profile" }, { status: 400 });
    }

    const data = await chatJSON<ExtractedProfileData>(
      [{ role: "user", content: profileExtractionPrompt(text, profile, diffAgainstText) }],
      { temperature: 0.2, maxTokens: 3000, task: "profile_extraction" },
      providerSettings,
      ProfileExtractionResultSchema,
    );

    // Classify each extracted experience bullet ONCE, now, so it is stored
    // with its category when accepted (never guessed at render time).
    const experience = data.experience?.length ? await attachBulletCategories(data.experience, providerSettings) : data.experience;
    return NextResponse.json({ data: { ...data, experience } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Extraction failed" }, { status: 500 });
  }
}
