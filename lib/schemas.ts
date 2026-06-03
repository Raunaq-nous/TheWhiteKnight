import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

const AFScoreBlockSchema = z.object({
  score: z.number().min(1).max(5),
  reasoning: z.string(),
  evidence: z.array(z.string()).optional(),
  gaps: z.array(z.string()).optional(),
  signals: z.array(z.string()).optional(),
});

const LegitimacySignalSchema = z.object({
  signal: z.string(),
  finding: z.string(),
  weight: z.enum(["positive", "neutral", "concerning"]),
});

// ---------------------------------------------------------------------------
// AFScoreResult — returned by /api/score
// ---------------------------------------------------------------------------

export const AFScoreResultSchema = z.object({
  archetype: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
  }),
  scores: z.object({
    cv_match: AFScoreBlockSchema,
    north_star: AFScoreBlockSchema,
    comp: AFScoreBlockSchema,
    culture: AFScoreBlockSchema,
    red_flags: AFScoreBlockSchema,
  }),
  global: z.number().min(1).max(5),
  recommendation: z.enum(["apply_immediately", "apply", "review_manually", "skip"]),
  legitimacy: z.object({
    tier: z.enum(["high_confidence", "proceed_with_caution", "suspicious"]),
    signals: z.array(LegitimacySignalSchema),
    notes: z.string().optional(),
  }),
  jdParsed: z.object({
    keyRequirements: z.array(z.string()),
    technicalSkills: z.array(z.string()),
    softSkills: z.array(z.string()),
    yearsExperienceRequired: z.number().nullable(),
    redFlags: z.array(z.string()),
    keywords: z.array(z.string()),
  }),
  bucket: z.string(),
  bucketName: z.string(),
});

// ---------------------------------------------------------------------------
// SkillGapResult — returned by /api/generate (skill-gap action)
// ---------------------------------------------------------------------------

export const SkillGapResultSchema = z.object({
  strongMatches: z.array(z.object({ skill: z.string(), evidence: z.string() })),
  partialMatches: z.array(z.object({ skill: z.string(), gap: z.string(), suggestion: z.string() })),
  missingSkills: z.array(z.object({
    skill: z.string(),
    priority: z.enum(["high", "medium", "low"]),
    suggestion: z.string(),
  })),
  overallReadiness: z.number().min(0).max(100),
  headline: z.string(),
});

// ---------------------------------------------------------------------------
// SkillBuilderResult — returned by /api/skill-builder
// ---------------------------------------------------------------------------

export const SkillBuilderResultSchema = z.object({
  trackedSkills: z.array(z.object({
    name: z.string(),
    category: z.string(),
    currentLevel: z.enum(["novice", "intermediate", "advanced", "expert"]),
    targetLevel: z.enum(["intermediate", "advanced", "expert"]),
    demandFromJDs: z.number().min(0).max(10),
    evidence: z.array(z.object({ source: z.string(), description: z.string() })),
    progressPercent: z.number().min(0).max(100),
    nextMilestone: z.string(),
    estimatedWeeks: z.number(),
    learningPath: z.array(z.object({
      step: z.number(),
      action: z.string(),
      resource: z.string(),
      weeks: z.number(),
    })),
    priority: z.enum(["critical", "high", "medium", "low"]),
  })),
  topGaps: z.array(z.string()),
  topStrengths: z.array(z.string()),
  recommendedFocus: z.string(),
});

// ---------------------------------------------------------------------------
// NLUpdateResult — returned by /api/nl-update
// ---------------------------------------------------------------------------

export const NLUpdateResultSchema = z.object({
  summary: z.string(),
  statusChange: z.boolean(),
  newStatus: z.enum(["sourced", "reviewed", "applied", "interview", "offer", "rejected"]).nullable(),
  contact: z.object({ name: z.string(), title: z.string().optional() }).nullable(),
  interview: z.object({
    round: z.enum(["phone_screen", "first", "second", "final", "case", "technical", "exec", "other"]),
    scheduledAt: z.string().nullable(),
    format: z.enum(["video", "phone", "in_person", "async"]).nullable(),
    contact: z.string().nullable(),
  }).nullable(),
  reminderDays: z.number().nullable(),
  noteToAppend: z.string(),
});

// ---------------------------------------------------------------------------
// ParsedJDFields — returned by /api/parse-jd
// ---------------------------------------------------------------------------

export const ParsedJDFieldsSchema = z.object({
  company: z.string(),
  role: z.string(),
  location: z.string(),
  sector: z.string(),
  seniority: z.enum(["junior", "mid", "senior", "leadership"]),
  remote: z.boolean(),
  sourceUrl: z.string(),
});

// ---------------------------------------------------------------------------
// ProfileSuggestion — returned by /api/enrich-profile
// ---------------------------------------------------------------------------

export const ProfileSuggestionResultSchema = z.object({
  suggestions: z.array(z.object({
    type: z.enum(["skill", "certification", "achievement", "voice_note"]),
    description: z.string(),
    value: z.string(),
  })),
});

// ---------------------------------------------------------------------------
// DiscoveredCompany — returned by /api/companies/discover
// ---------------------------------------------------------------------------

export const DiscoveredCompaniesResultSchema = z.object({
  companies: z.array(z.object({
    name: z.string(),
    region: z.array(z.enum(["global", "middle-east", "apac", "india", "north-america", "europe"])),
    sector: z.string(),
    careersUrl: z.string(),
    rationale: z.string(),
    seniorityFit: z.enum(["junior", "mid", "senior", "leadership", "any"]),
  })),
});

// ---------------------------------------------------------------------------
// FormQA — returned by /api/generate-form-answers and /api/refine-form-answers
// ---------------------------------------------------------------------------

export const FormQAResultSchema = z.object({
  qa: z.array(z.object({ question: z.string(), answer: z.string() })),
});
