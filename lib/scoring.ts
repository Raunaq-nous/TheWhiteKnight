"use client";
import { TargetBucket } from "./store";

interface ScoreResult {
  totalScore: number;
  bucket: string;
  bucketName: string;
  breakdown: ScoreBreakdown;
  recommendation: string;
}

interface ScoreBreakdown {
  titleMatch: { score: number; weight: number; weighted: number; details: string };
  sectorMatch: { score: number; weight: number; weighted: number; details: string };
  seniorityMatch: { score: number; weight: number; weighted: number; details: string };
  keywordRequired: { score: number; weight: number; weighted: number; details: string };
  keywordBoost: { score: number; weight: number; weighted: number; details: string };
  geographyMatch: { score: number; weight: number; weighted: number; details: string };
  targetCompany: { score: number; weight: number; weighted: number; details: string };
}

const WEIGHTS = {
  titleMatch: 0.20,
  sectorMatch: 0.15,
  seniorityMatch: 0.15,
  keywordRequired: 0.20,
  keywordBoost: 0.10,
  geographyMatch: 0.10,
  targetCompany: 0.10,
};

const THRESHOLDS = {
  applyImmediately: 8.5,
  tailorAndApply: 7.0,
  reviewManually: 5.5,
  archiveLowFit: 4.0,
};

function fuzzyMatch(text: string, patterns: string[]): { matched: boolean; matchedPatterns: string[] } {
  const lower = text.toLowerCase();
  const matched = patterns.filter(p => lower.includes(p.toLowerCase()));
  return { matched: matched.length > 0, matchedPatterns: matched };
}

function scoreBucket(jdText: string, company: string, role: string, location: string, seniority: string, sector: string, bucket: TargetBucket): { score: number; breakdown: ScoreBreakdown } {
  const fullText = `${jdText} ${company} ${role} ${location} ${seniority} ${sector}`.toLowerCase();

  // Title match
  const titleResult = fuzzyMatch(role, bucket.titlesMatch);
  const titleExcluded = fuzzyMatch(role, bucket.titlesExclude || []);
  const titleScore = titleExcluded.matched ? 0 : titleResult.matched ? 1.0 : 0;

  // Sector match
  const sectorResult = fuzzyMatch(sector, bucket.sectorsPreferred);
  const sectorScore = sectorResult.matched ? 0.9 : (fuzzyMatch(fullText, bucket.sectorsPreferred).matched ? 0.5 : 0);

  // Seniority match
  const seniorityResult = fuzzyMatch(seniority, bucket.seniority);
  const seniorityScore = seniorityResult.matched ? 1.0 : 0.3;

  // Required keywords (OR logic)
  const reqKeywords = bucket.keywordsRequired.flatMap(k => k.split(" OR ").map(s => s.trim()));
  const reqResult = fuzzyMatch(fullText, reqKeywords);
  const reqScore = reqResult.matched ? 1.0 : 0;

  // Boost keywords
  const boostResult = fuzzyMatch(fullText, bucket.keywordsBoost);
  const boostScore = bucket.keywordsBoost.length > 0 ? boostResult.matchedPatterns.length / bucket.keywordsBoost.length : 0;

  // Geography match
  const geoResult = fuzzyMatch(location, bucket.geographies);
  const geoScore = geoResult.matched ? 1.0 : (location.toLowerCase().includes("remote") ? 0.8 : 0);

  // Target company match
  const companyResult = fuzzyMatch(company, bucket.targetCompanies);
  const companyScore = companyResult.matched ? 1.0 : 0;

  const breakdown: ScoreBreakdown = {
    titleMatch: { score: titleScore, weight: WEIGHTS.titleMatch, weighted: titleScore * WEIGHTS.titleMatch, details: titleResult.matchedPatterns.join(", ") || "no match" },
    sectorMatch: { score: sectorScore, weight: WEIGHTS.sectorMatch, weighted: sectorScore * WEIGHTS.sectorMatch, details: sectorResult.matchedPatterns.join(", ") || "partial/no match" },
    seniorityMatch: { score: seniorityScore, weight: WEIGHTS.seniorityMatch, weighted: seniorityScore * WEIGHTS.seniorityMatch, details: seniorityResult.matchedPatterns.join(", ") || "partial" },
    keywordRequired: { score: reqScore, weight: WEIGHTS.keywordRequired, weighted: reqScore * WEIGHTS.keywordRequired, details: reqResult.matchedPatterns.join(", ") || "no match" },
    keywordBoost: { score: boostScore, weight: WEIGHTS.keywordBoost, weighted: boostScore * WEIGHTS.keywordBoost, details: boostResult.matchedPatterns.join(", ") || "none" },
    geographyMatch: { score: geoScore, weight: WEIGHTS.geographyMatch, weighted: geoScore * WEIGHTS.geographyMatch, details: geoResult.matchedPatterns.join(", ") || (location.includes("remote") ? "remote" : "no match") },
    targetCompany: { score: companyScore, weight: WEIGHTS.targetCompany, weighted: companyScore * WEIGHTS.targetCompany, details: companyResult.matchedPatterns.join(", ") || "not in target list" },
  };

  const total = Object.values(breakdown).reduce((sum, b) => sum + b.weighted, 0);
  return { score: Math.round(total * 100) / 10, breakdown };
}

export function scoreJob(jdText: string, company: string, role: string, location: string, seniority: string, sector: string, buckets: TargetBucket[]): ScoreResult {
  let bestScore = 0;
  let bestBucket = buckets[0];
  let bestBreakdown: ScoreBreakdown | null = null;

  for (const bucket of buckets) {
    const result = scoreBucket(jdText, company, role, location, seniority, sector, bucket);
    if (result.score > bestScore) {
      bestScore = result.score;
      bestBucket = bucket;
      bestBreakdown = result.breakdown;
    }
  }

  let recommendation: string;
  if (bestScore >= THRESHOLDS.applyImmediately) recommendation = "APPLY IMMEDIATELY";
  else if (bestScore >= THRESHOLDS.tailorAndApply) recommendation = "TAILOR AND APPLY";
  else if (bestScore >= THRESHOLDS.reviewManually) recommendation = "REVIEW MANUALLY";
  else recommendation = "LOW FIT, CONSIDER ARCHIVING";

  return {
    totalScore: bestScore,
    bucket: bestBucket.id,
    bucketName: bestBucket.name,
    breakdown: bestBreakdown!,
    recommendation,
  };
}

export { THRESHOLDS };