import {
  getCache,
  wt_saveApplication,
  wt_updateApplication,
  wt_deleteApplication,
} from "./data-cache";
import { showToast } from "./toast";
import type { ResumeContent } from "./resume-schema";
import type { ResumeArchetype } from "./resume-archetype";

export type InterviewRound = "phone_screen" | "first" | "second" | "final" | "case" | "technical" | "exec" | "other";

export type Interview = {
  id: string;
  round: InterviewRound;
  scheduledAt?: string;
  completedAt?: string;
  contact?: string;
  interviewerTitle?: string;
  format?: "video" | "phone" | "in_person" | "async";
  notes?: string;
  outcome?: "pending" | "passed" | "rejected" | "cancelled";
  createdAt: string;
};

export type Application = {
  id: string;
  slug: string;
  company: string;
  role: string;
  location: string;
  remote: boolean;
  status: "sourced" | "reviewed" | "applied" | "interview" | "offer" | "rejected";
  score: number;
  bucket: string;
  sector: string;
  seniority: string;
  sourceUrl: string;
  capturedAt: string;
  jdRaw: string;
  jdParsed: any;
  bucketName?: string;
  afScore?: {
    archetype: { primary: string; secondary?: string };
    scores: {
      cv_match: { score: number; reasoning: string; evidence?: string[]; gaps?: string[] };
      north_star: { score: number; reasoning: string };
      comp: { score: number; reasoning: string };
      culture: { score: number; reasoning: string; signals?: string[] };
      red_flags: { score: number; reasoning: string; signals?: string[] };
    };
    global: number;
    recommendation: "apply_immediately" | "apply" | "review_manually" | "skip";
    legitimacy: {
      tier: "high_confidence" | "proceed_with_caution" | "suspicious";
      signals: { signal: string; finding: string; weight: "positive" | "neutral" | "concerning" }[];
      notes?: string;
    };
  };
  nextAction: string;
  contacts: any[];
  interviews: Interview[];
  reminders: any[];
  resumeVersions: any[];
  notes: string;
  emailEvents: any[];
  stagedForms?: Array<{
    screenshotRef: string;
    filledFields: Array<{ field: string; value: string }>;
    stagedAt: string;
    formUrl?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  days?: number;
  formAnswers?: Array<{ question: string; answer: string }>;
  resumeMarkdown?: string;
  // Structured resume content (role-adaptive rebuild). resumeMarkdown above is
  // kept as a derived/plain-text fallback for resumes generated before this
  // existed, and for copy/download compatibility.
  resumeContent?: ResumeContent;
  resumeArchetype?: ResumeArchetype;
};

export type TargetBucket = {
  id: string;
  name: string;
  description: string;
  titlesMatch: string[];
  titlesExclude: string[];
  sectorsPreferred: string[];
  geographies: string[];
  keywordsRequired: string[];
  keywordsBoost: string[];
  targetCompanies: string[];
  seniority: string[];
  weight: number;
};

export function getApplications(): Application[] {
  return getCache().applications;
}

// Each of these returns true on success, false on failure, and surfaces a
// toast on failure so a rejected write-through is never silently swallowed.
export async function saveApplication(app: Application): Promise<boolean> {
  try {
    await wt_saveApplication(app);
    return true;
  } catch (e: any) {
    console.error("[CareerOS] saveApplication failed:", e);
    showToast(e?.message ?? "Failed to save application", "error");
    return false;
  }
}

export function getApplication(slug: string): Application | undefined {
  return getCache().applications.find(a => a.slug === slug);
}

export async function updateApplication(id: string, changes: Partial<Application>): Promise<boolean> {
  try {
    await wt_updateApplication(id, changes);
    return true;
  } catch (e: any) {
    console.error("[CareerOS] updateApplication failed:", e);
    showToast(e?.message ?? "Failed to update application", "error");
    return false;
  }
}

export async function deleteApplication(id: string): Promise<boolean> {
  try {
    await wt_deleteApplication(id);
    return true;
  } catch (e: any) {
    console.error("[CareerOS] deleteApplication failed:", e);
    showToast(e?.message ?? "Failed to delete application", "error");
    return false;
  }
}

export function generateSlug(company: string, role: string) {
  return `${company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${role.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}
