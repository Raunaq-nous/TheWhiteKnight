import "server-only";
import type { Region } from "../../../company-targets";

// Shared job-result shape produced by every collector. Moved here (out of
// scan-service.ts) so collector modules don't have to import back from the
// orchestrator; scan-service.ts re-exports this for existing callers
// (automation-service.ts, rules-prefilter.ts) that import JobResult from it.
export type JobResult = {
  title: string;
  company?: string;
  location?: string;
  url: string;
  source: "greenhouse" | "ashby" | "lever" | "exa-portal" | "exa-company" | "adzuna" | "smartrecruiters" | "naukri";
  publishedDate?: string;
  snippet?: string;
  relevance?: number; // 0-100 score against query + roleKeywords
  // Full job description text, when the source's own API already returns it
  // (Greenhouse/Ashby/Lever/SmartRecruiters) — avoids a second fetch per job
  // for scoring.
  descriptionHtml?: string;
};

// A hint used by domain-search collectors (Exa company search) to map a
// result URL's hostname back to the CompanyTarget it came from.
export type CompanyDomainHint = { name: string; hostname: string };

// Generic input bag passed to a collector. Each collector only reads the
// fields relevant to its own source; the rest are ignored. Kept as one
// loose type (rather than a per-collector generic) to keep scan-service.ts's
// orchestration code simple — it builds one input object per call site.
export type CollectorInput = {
  tenant?: string;
  companyName?: string;
  query?: string;
  domains?: string[];
  regions?: Region[];
  apiKey?: string;
  appId?: string;
  appKey?: string;
  numResults?: number;
  companyLookup?: CompanyDomainHint[];
};

export type CollectorResult = {
  jobs: JobResult[];
  // Set on a clean failure (network error, no public API for this source,
  // missing credentials, etc). A collector must NEVER throw out of
  // `collect()` — every failure path returns { jobs: [], error }.
  error?: string;
};

export interface JobCollector {
  readonly name: string;
  collect(input: CollectorInput): Promise<CollectorResult>;
}
