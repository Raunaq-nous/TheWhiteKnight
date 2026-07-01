import {
  getCache,
  wt_saveApplication,
  wt_updateApplication,
  wt_deleteApplication,
} from "./data-cache";

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

export function saveApplication(app: Application): void {
  wt_saveApplication(app).catch(e => console.error("[CareerOS] saveApplication failed:", e));
}

export function getApplication(slug: string): Application | undefined {
  return getCache().applications.find(a => a.slug === slug);
}

export function updateApplication(id: string, changes: Partial<Application>): void {
  wt_updateApplication(id, changes).catch(e => console.error("[CareerOS] updateApplication failed:", e));
}

export function deleteApplication(id: string): void {
  wt_deleteApplication(id).catch(e => console.error("[CareerOS] deleteApplication failed:", e));
}

export function generateSlug(company: string, role: string) {
  return `${company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${role.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}
