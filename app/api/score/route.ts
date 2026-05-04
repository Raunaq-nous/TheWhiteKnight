import { NextRequest, NextResponse } from "next/server";
import { chatJSON } from "../../../lib/ai-client";
import { afScoringPrompt, AFScoreResult } from "../../../lib/prompts";
import type { Profile } from "../../../lib/profile";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { jdText, company, role, location, seniority, sector, remote, buckets, profile } = await req.json() as {
      jdText: string;
      company: string;
      role: string;
      location: string;
      seniority: string;
      sector: string;
      remote: boolean;
      buckets: { id: string; name: string; description: string }[];
      profile: Profile;
    };

    if (!profile) {
      return NextResponse.json({ error: "Missing profile" }, { status: 400 });
    }
    if (!buckets || buckets.length === 0) {
      return NextResponse.json({ error: "Missing target archetypes (buckets)" }, { status: 400 });
    }

    const result = await chatJSON<AFScoreResult>(
      [{ role: "user", content: afScoringPrompt(profile, jdText, { company, role, location, seniority, sector, remote }, buckets) }],
      { temperature: 0.2, maxTokens: 3000 }
    );

    const totalScore10 = Math.max(0, Math.min(10, result.global * 2));
    const recommendationLabel =
      result.recommendation === "apply_immediately" ? "Apply Immediately" :
      result.recommendation === "apply" ? "Apply" :
      result.recommendation === "review_manually" ? "Review Manually" : "Skip";

    return NextResponse.json({
      ...result,
      totalScore: totalScore10,
      recommendationLabel,
      parsed: result.jdParsed,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Scoring failed" }, { status: 500 });
  }
}
