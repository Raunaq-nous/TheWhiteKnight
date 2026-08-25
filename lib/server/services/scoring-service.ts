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
    // "scoring" task: a non-reasoning instruct model by default — the root
    // fix for the reasoning-token failure class (see lib/ai-client.ts).
    // A reasoning model spending its whole token budget "thinking" about a
    // dense JD before ever emitting the scored JSON is exactly the bug this
    // resolves; a schema-constrained classification task doesn't need that
    // depth in the first place.
    { temperature: 0.2, maxTokens: 3000, task: "scoring" },
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
