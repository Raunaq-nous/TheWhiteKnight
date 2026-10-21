// Every job source the app can ingest from, with its category for source
// priority, attribution and autopilot policy. Client-safe.
//
// Source priority (docs/CAREER-TRACKS.md Part 1): referral/warm intro, then
// company-direct ATS postings, then Google Jobs aggregators (they route to
// the employer's own form), then niche/remote boards, then job-alert emails,
// with mass boards last. Autopilot prefers keyless, company-direct sources.

export type JobSource =
  // Company-direct public ATS endpoints (no key)
  | "greenhouse" | "ashby" | "lever" | "smartrecruiters"
  | "workday" | "workable" | "recruitee" | "personio" | "teamtailor" | "rippling"
  // Aggregators with free tiers (optional keys, monthly budgets)
  | "serpapi" | "jsearch" | "adzuna" | "theirstack" | "jobspipe"
  // Keyless remote boards
  | "remotive" | "arbeitnow" | "themuse" | "remoteok" | "weworkremotely" | "himalayas" | "jobicy"
  // Job-alert emails (IMAP)
  | "alert-email"
  // Search (manual scans only; autopilot never calls Exa)
  | "exa-portal" | "exa-company"
  // Legacy / manual
  | "naukri" | "manual";

export type SourceCategory = "company-direct" | "google-jobs" | "aggregator" | "remote-board" | "alert-email" | "search" | "manual";

export type SourceMeta = {
  label: string;
  category: SourceCategory;
  keyless: boolean;
  // Env var holding the key, for keyed sources.
  envKey?: string;
  // Free-tier calls per month (budget counter default); null = unmetered.
  monthlyBudget?: number | null;
};

export const SOURCE_META: Record<JobSource, SourceMeta> = {
  greenhouse: { label: "Greenhouse", category: "company-direct", keyless: true },
  ashby: { label: "Ashby", category: "company-direct", keyless: true },
  lever: { label: "Lever", category: "company-direct", keyless: true },
  smartrecruiters: { label: "SmartRecruiters", category: "company-direct", keyless: true },
  workday: { label: "Workday", category: "company-direct", keyless: true },
  workable: { label: "Workable", category: "company-direct", keyless: true },
  recruitee: { label: "Recruitee", category: "company-direct", keyless: true },
  personio: { label: "Personio", category: "company-direct", keyless: true },
  teamtailor: { label: "Teamtailor", category: "company-direct", keyless: true },
  rippling: { label: "Rippling", category: "company-direct", keyless: true },
  serpapi: { label: "Google Jobs (SerpApi)", category: "google-jobs", keyless: false, envKey: "SERPAPI_API_KEY", monthlyBudget: 250 },
  jsearch: { label: "JSearch", category: "google-jobs", keyless: false, envKey: "JSEARCH_API_KEY", monthlyBudget: 200 },
  adzuna: { label: "Adzuna", category: "aggregator", keyless: false, monthlyBudget: 1000 },
  theirstack: { label: "TheirStack", category: "aggregator", keyless: false, envKey: "THEIRSTACK_API_KEY", monthlyBudget: 200 },
  jobspipe: { label: "JobsPipe", category: "aggregator", keyless: false, envKey: "JOBSPIPE_API_KEY", monthlyBudget: 1000 },
  remotive: { label: "Remotive", category: "remote-board", keyless: true },
  arbeitnow: { label: "Arbeitnow", category: "remote-board", keyless: true },
  themuse: { label: "The Muse", category: "remote-board", keyless: true },
  remoteok: { label: "Remote OK", category: "remote-board", keyless: true },
  weworkremotely: { label: "We Work Remotely", category: "remote-board", keyless: true },
  himalayas: { label: "Himalayas", category: "remote-board", keyless: true },
  jobicy: { label: "Jobicy", category: "remote-board", keyless: true },
  "alert-email": { label: "Job-alert email", category: "alert-email", keyless: true },
  "exa-portal": { label: "Exa portal search", category: "search", keyless: false },
  "exa-company": { label: "Exa company search", category: "search", keyless: false },
  naukri: { label: "Naukri (alert email)", category: "alert-email", keyless: true },
  manual: { label: "Added manually", category: "manual", keyless: true },
};

/** Default priority order (lower first) when the user has no conversion data yet. */
export const CATEGORY_PRIORITY: Record<SourceCategory, number> = {
  "company-direct": 0, "google-jobs": 1, "remote-board": 2, aggregator: 3, "alert-email": 4, search: 5, manual: 6,
};

export function isCompanyDirect(source: string | undefined): boolean {
  return !!source && SOURCE_META[source as JobSource]?.category === "company-direct";
}
