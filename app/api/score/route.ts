import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../lib/rate-limit";
import { chatJSON, ProviderSettings } from "../../../lib/ai-client";
import { afScoringPrompt, AFScoreResult } from "../../../lib/prompts";
import { AFScoreResultSchema } from "../../../lib/schemas";
import { computeGlobalScore, deriveRecommendation } from "../../../lib/scoring-weights";
import type { Profile } from "../../../lib/profile";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`score:${ip}`, 40, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) }
    });
  }
  try {
    const { jdText, company, role, location, seniority, sector, remote, buckets, profile, providerSettings } = await req.json() as {
      jdText: string;
      company: string;
      role: string;
      location: string;
      seniority: string;
      sector: string;
      remote: boolean;
      buckets: { id: string; name: string; description: string }[];
      profile: Profile;
      providerSettings?: ProviderSettings;
    };

    if (!profile) {
      return NextResponse.json({ error: "Missing profile" }, { status: 400 });
    }
    if (!buckets || buckets.length === 0) {
      return NextResponse.json({ error: "Missing target archetypes (buckets)" }, { status: 400 });
    }

    const result = await chatJSON<AFScoreResult>(
      [{ role: "user", content: afScoringPrompt(profile, jdText, { company, role, location, seniority, sector, remote }, buckets) }],
      { temperature: 0.2, maxTokens: 3000 },
      providerSettings,
      AFScoreResultSchema
    );

    // Replace the LLM's global with the code-computed weighted average.
    const computedGlobal = computeGlobalScore({
      cv_match: result.scores.cv_match.score,
      north_star: result.scores.north_star.score,
      comp: result.scores.comp.score,
      culture: result.scores.culture.score,
      red_flags: result.scores.red_flags.score,
    });

    const recommendation = deriveRecommendation(computedGlobal, result.scores.red_flags.score);

    const recommendationLabel =
      recommendation === "apply_immediately" ? "Apply Immediately" :
      recommendation === "apply" ? "Apply" :
      recommendation === "review_manually" ? "Review Manually" : "Skip";

    const totalScore10 = Math.round(Math.max(0, Math.min(10, computedGlobal * 2)) * 100) / 100;

    return NextResponse.json({
      ...result,
      global: computedGlobal,
      recommendation,
      totalScore: totalScore10,
      recommendationLabel,
      parsed: result.jdParsed,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Scoring failed" }, { status: 500 });
  }
}
