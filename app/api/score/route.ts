import { NextRequest, NextResponse } from "next/server";
import { chatJSON } from "../../../lib/ai-client";
import { jdScoringPrompt } from "../../../lib/prompts";
import type { TargetBucket } from "../../../lib/store";

export const runtime = "nodejs";

type JDParsed = {
  keyRequirements: string[];
  technicalSkills: string[];
  softSkills: string[];
  yearsExperienceRequired: number | null;
  redFlags: string[];
};

export async function POST(req: NextRequest) {
  try {
    const { jdText, company, role, location, seniority, sector, buckets } = await req.json() as {
      jdText: string;
      company: string;
      role: string;
      location: string;
      seniority: string;
      sector: string;
      buckets: TargetBucket[];
    };

    const parsed = await chatJSON<JDParsed>(
      [{ role: "user", content: jdScoringPrompt(jdText, role, company, location, seniority, sector) }],
      { temperature: 0.1 }
    );

    const fullText = `${jdText} ${parsed.technicalSkills?.join(" ")} ${parsed.keyRequirements?.join(" ")}`.toLowerCase();

    let bestBucket = buckets[0];
    let highestScore = 0;
    let bestBreakdown: any = {};

    for (const bucket of buckets) {
      let score = 0;
      const breakdown: any = {};

      const titleLower = role.toLowerCase();
      const titleMatch = bucket.titlesMatch.some(t => titleLower.includes(t));
      const titleExclude = bucket.titlesExclude.some(t => titleLower.includes(t));
      const titleScore = titleExclude ? 0 : titleMatch ? 3 : 1;
      score += titleScore;
      breakdown.titleMatch = { score: titleScore, weighted: titleScore };

      const sectorMatch = bucket.sectorsPreferred.some(s => sector.toLowerCase().includes(s));
      const sectorScore = sectorMatch ? 1.5 : 0;
      score += sectorScore;
      breakdown.sectorMatch = { score: sectorScore, weighted: sectorScore };

      const reqMatches = bucket.keywordsRequired.filter(k => fullText.includes(k.toLowerCase()));
      const reqScore = (reqMatches.length / Math.max(1, bucket.keywordsRequired.length)) * 3;
      score += reqScore;
      breakdown.keywordsRequired = { score: reqScore, weighted: reqScore };

      const boostMatches = bucket.keywordsBoost.filter(k => fullText.includes(k.toLowerCase()));
      const boostScore = Math.min(2.5, boostMatches.length * 0.8);
      score += boostScore;
      breakdown.keywordsBoost = { score: boostScore, weighted: boostScore };

      if (score > highestScore) {
        highestScore = score;
        bestBucket = bucket;
        bestBreakdown = breakdown;
      }
    }

    return NextResponse.json({
      totalScore: Math.min(10, highestScore),
      bucket: bestBucket.id,
      bucketName: bestBucket.name,
      recommendation: highestScore >= 8.5 ? "Apply Immediately" : highestScore >= 7.0 ? "Tailor and Apply" : "Review Manually",
      breakdown: bestBreakdown,
      parsed,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Scoring failed" }, { status: 500 });
  }
}
