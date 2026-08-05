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
    // The prompt explicitly tells the model "string or null" — .optional()
    // alone only tolerates a missing key, not an explicit null value.
    secondary: z.string().nullable().optional(),
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
    // Same "string or null" contract as archetype.secondary above.
    notes: z.string().nullable().optional(),
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

// ---------------------------------------------------------------------------
// ProfileExtractionResult — returned by /api/profile/extract (Features 1 & 3)
// Candidate entities extracted from freeform text. Matching against the
// existing profile happens deterministically in lib/profile-merge.ts, not
// here — the model only needs to propose clean structured entities.
// ---------------------------------------------------------------------------

export const ProfileExtractionResultSchema = z.object({
  experience: z.array(z.object({
    company: z.string(),
    role: z.string(),
    tenure: z.string(),
    location: z.string().nullable().optional(),
    bullets: z.array(z.string()),
  })).nullable().optional(),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    field: z.string().nullable().optional(),
    years: z.string(),
    gpa: z.string().nullable().optional(),
    achievements: z.array(z.string()).nullable().optional(),
  })).nullable().optional(),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string(),
    stack: z.string().nullable().optional(),
    outcomes: z.string().nullable().optional(),
    repoUrl: z.string().nullable().optional(),
  })).nullable().optional(),
  publications: z.array(z.object({
    title: z.string(),
    publication: z.string(),
    year: z.string(),
    url: z.string().nullable().optional(),
  })).nullable().optional(),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    relevance: z.string().nullable().optional(),
  })).nullable().optional(),
  skills: z.array(z.object({
    category: z.string(),
    items: z.array(z.string()),
  })).nullable().optional(),
});

// ---------------------------------------------------------------------------
// ProfileQuestionsResult — returned by /api/profile/questions (Feature 2)
// ---------------------------------------------------------------------------

export const ProfileQuestionSchema = z.object({
  id: z.string(),
  targetType: z.enum(["experience", "project"]),
  targetId: z.string(),
  targetLabel: z.string(),
  currentText: z.string(),
  question: z.string(),
});

export const ProfileQuestionsResultSchema = z.object({
  questions: z.array(ProfileQuestionSchema),
});

export type ProfileQuestion = z.infer<typeof ProfileQuestionSchema>;

// ---------------------------------------------------------------------------
// BulletRewriteResult — returned by /api/profile/rewrite-bullet (Feature 2)
// ---------------------------------------------------------------------------

export const BulletRewriteResultSchema = z.object({
  rewrittenText: z.string(),
});

// ---------------------------------------------------------------------------
// ResumeGapQuestion — returned by /api/resume/gap-questions.
// Job-scoped Q&A: compares a specific JD's target priorities against the
// profile and asks about genuine gaps, unlike ProfileQuestion above (which
// scans the whole profile for generic weak bullets, JD-agnostic).
// ---------------------------------------------------------------------------

export const ResumeGapQuestionSchema = z.object({
  id: z.string(),
  priority: z.string().describe("Which target priority this question addresses"),
  targetType: z.enum(["experience", "project"]),
  targetId: z.string().describe("Exact company name (experience) or project name (project), copied from the profile"),
  targetLabel: z.string(),
  existingEvidence: z.string().nullable().optional().describe("What's already in the profile that's relevant, if anything"),
  question: z.string(),
});

export const ResumeGapQuestionsResultSchema = z.object({
  questions: z.array(ResumeGapQuestionSchema),
});

export type ResumeGapQuestion = z.infer<typeof ResumeGapQuestionSchema>;

// ---------------------------------------------------------------------------
// ResumeGapAnswerResult — returned by /api/resume/gap-answer
// ---------------------------------------------------------------------------

export const ResumeGapAnswerResultSchema = z.object({
  newBulletText: z.string().describe("The new bullet, or an empty string if the answer had no usable fact"),
});

// ---------------------------------------------------------------------------
// ResumeRequirementMap — returned by /api/resume/requirement-map. The
// interactive builder's first step: extract this JD's specific requirements
// and rate how well the profile evidences each one, BEFORE any resume draft
// exists — see lib/resume-requirement-map.ts for the reactive-probing logic
// this map feeds.
// ---------------------------------------------------------------------------

export const RequirementEvidenceSchema = z.object({
  sourceType: z.enum(["experience", "project", "keyWin"]),
  sourceId: z.string().describe("Company name (experience) or project name — exact match to the profile"),
  bulletText: z.string().describe("The exact bullet/description text used as evidence, copied verbatim from the profile"),
});

export const RequirementCoverageSchema = z.object({
  requirement: z.string().describe("The specific JD requirement, in the JD's own words where possible"),
  rating: z.enum(["strong", "weak", "none"]),
  evidence: RequirementEvidenceSchema.nullable().optional().describe("Omit or null when rating is 'none'"),
  reasoning: z.string().describe("One line explaining the rating"),
});

export const ResumeRequirementMapSchema = z.object({
  requirements: z.array(RequirementCoverageSchema),
});

export type RequirementCoverage = z.infer<typeof RequirementCoverageSchema>;
export type ResumeRequirementMap = z.infer<typeof ResumeRequirementMapSchema>;
