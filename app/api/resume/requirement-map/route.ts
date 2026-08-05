import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { chatJSON, ProviderSettings } from "../../../../lib/ai-client";
import { ResumeRequirementMapSchema, ResumeRequirementMap } from "../../../../lib/schemas";
import { requirementMapPrompt } from "../../../../lib/prompts";
import type { Profile } from "../../../../lib/profile";
import type { Application } from "../../../../lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

// Interactive resume builder, step 1: extract this JD's specific
// requirements and rate profile coverage for each — runs BEFORE any resume
// draft exists, so the user sees what the JD asks for and what they have
// against it before a single bullet is written.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`requirement-map:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) },
    });
  }

  try {
    const { profile, app, providerSettings } = await req.json() as {
      profile: Profile;
      app: Application;
      providerSettings?: ProviderSettings;
    };

    if (!profile || !app) {
      return NextResponse.json({ error: "Missing profile or app" }, { status: 400 });
    }

    const data = await chatJSON<ResumeRequirementMap>(
      [{ role: "user", content: requirementMapPrompt(profile, app) }],
      { temperature: 0.3, maxTokens: 2000 },
      providerSettings,
      ResumeRequirementMapSchema,
    );

    return NextResponse.json({ requirements: data.requirements ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Requirement map generation failed" }, { status: 500 });
  }
}
