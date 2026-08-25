import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { chatJSON, ProviderSettings } from "../../../../lib/ai-client";
import { ResumeRequirementMapSchema, ResumeRequirementMap } from "../../../../lib/schemas";
import { requirementMapPrompt } from "../../../../lib/prompts";
import { listProfileBullets } from "../../../../lib/profile-bullets";
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
      { temperature: 0.3, maxTokens: 2000, task: "requirement_map" },
      providerSettings,
      ResumeRequirementMapSchema,
    );

    // Best-effort tag each requirement's evidence with its real profile
    // bullet id, by exact verbatim text match (bulletText is required to be
    // copied verbatim from the profile — see RequirementEvidenceSchema) —
    // this puts the requirement map on the same id space the resume
    // generator selects from and the checkbox draft/dedupe key off, without
    // needing the model to know about ids at all.
    const bulletsByText = new Map(listProfileBullets(profile).map(b => [b.text.trim(), b.id]));
    const requirements = (data.requirements ?? []).map(r =>
      r.evidence
        ? { ...r, evidence: { ...r.evidence, sourceBulletId: bulletsByText.get(r.evidence.bulletText.trim()) ?? null } }
        : r,
    );

    return NextResponse.json({ requirements });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Requirement map generation failed" }, { status: 500 });
  }
}
