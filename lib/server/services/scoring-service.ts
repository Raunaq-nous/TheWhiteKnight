import "server-only";
import { chatJSON, ProviderSettings } from "../../ai-client";
import { afScoringPrompt, AFScoreResult } from "../../prompts";
import { AFScoreResultSchema } from "../../schemas";
import { computeGlobalScore, deriveRecommendation } from "../../scoring-weights";
import type { Profile } from "../../profile";

export type ScoreJobInput = {
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

export type ScoreJobOutput = AFScoreResult & {
  global: number;
  recommendation: ReturnType<typeof deriveRecommendation>;
  totalScore: number;
  recommendationLabel: string;
  parsed: AFScoreResult["jdParsed"];
};

export async function scoreJob(input: ScoreJobInput): Promise<ScoreJobOutput> {
  const { jdText, company, role, location, seniority, sector, remote, buckets, profile, providerSettings } = input;

  const result = await chatJSON<AFScoreResult>(
    [{ role: "user", content: afScoringPrompt(profile, jdText, { company, role, location, seniority, sector, remote }, buckets) }],
    { temperature: 0.2, maxTokens: 3000 },
    providerSettings,
    AFScoreResultSchema,
  );

  const global = computeGlobalScore({
    cv_match: result.scores.cv_match.score,
    north_star: result.scores.north_star.score,
    comp: result.scores.comp.score,
    culture: result.scores.culture.score,
    red_flags: result.scores.red_flags.score,
  });

  const recommendation = deriveRecommendation(global, result.scores.red_flags.score);

  const recommendationLabel =
    recommendation === "apply_immediately" ? "Apply Immediately" :
    recommendation === "apply" ? "Apply" :
    recommendation === "review_manually" ? "Review Manually" : "Skip";

  const totalScore = Math.round(Math.max(0, Math.min(10, global * 2)) * 100) / 100;

  return { ...result, global, recommendation, totalScore, recommendationLabel, parsed: result.jdParsed };
}
