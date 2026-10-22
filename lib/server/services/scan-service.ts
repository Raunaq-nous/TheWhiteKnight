import "server-only";
import { CompanyTarget, Region } from "../../company-targets";
import {
  ATS_COLLECTORS,
  REGION_PORTAL_DOMAINS,
  GOOGLE_JOBS_COLLECTORS,
  KEYED_AGGREGATORS,
  REMOTE_BOARD_COLLECTORS,
  exaPortalCollector,
  exaCompanyCollector,
  adzunaCollector,
} from "./collectors";
import type { CompanyDomainHint, JobResult } from "./collectors/types";
import { dedupeJobs } from "../../job-dedupe";
import { rankSources, type SourceConversion } from "../../source-analytics";
import { SOURCE_META, isCompanyDirect, type JobSource } from "../../job-sources";
import { dbSourceBudget, type SourceBudget } from "../source-budget";

// Extracted from the former app/api/scan/jobs/route.ts body so both the
// manual scan UI (via the route, now a thin wrapper) and the scheduled
// automation service can call the same logic directly, with no HTTP hop.
//
// The per-source fetch logic itself now lives one-module-per-source under
// ./collectors/ (JobCollector interface in collectors/types.ts). This file
// keeps only the orchestration: which collectors to call for a given scan
// input, and the dedupe/relevance-filter/rejected-reasons pipeline that
// runs on their combined output.

export type JobScanInput = {
  query: string;
  regions?: Region[];
  companies?: CompanyTarget[];
  exaApiKey?: string;
  adzunaAppId?: string;
  adzunaAppKey?: string;
  numResults?: number;
  roleKeywords?: string[];
  excludeKeywords?: string[];
  // "autopilot": keyless and company-direct sources first, keyed
  // aggregators only to top up and within budget, never Exa. "manual"
  // (default): everything configured, Exa included.
  mode?: "manual" | "autopilot";
  // Keyless remote boards (default on).
  includeRemoteBoards?: boolean;
  // Free-text location for aggregators (e.g. "India", "Dubai").
  location?: string;
  // Monthly call budgets for keyed sources (default: the persistent store).
  budget?: SourceBudget;
  // Observed conversion per source: results are ordered by it.
  sourceStats?: SourceConversion[];
};

// Re-exported for existing callers (automation-service.ts, rules-prefilter.ts)
// that import JobResult from "./scan-service".
export type { JobResult } from "./collectors/types";

export type KeywordFilterRejection = { title: string; company?: string; reason: string };

export type JobScanOutput = {
  jobs: JobResult[];
  errors?: string[];
  // Postings dropped by the keyword/seniority relevance filter below —
  // deterministic and zero-token (this runs entirely before any model
  // call). Optional so existing callers/mocks that don't set it keep
  // working; automation-service.ts folds this into its own
  // stage-by-stage survivor-count log (see AutomationRunLog.filteredOut).
  rejected?: KeywordFilterRejection[];
  counts: {
    total: number;
    beforeFiltering: number;
    ats: number;
    adzuna: number;
    exa: number;
    // Every source's surviving count.
    bySource?: Record<string, number>;
  };
  // URLs each company's ATS feed listed this scan (successful fetches
  // only), keyed by company id: the "gone from its feed" ghost check.
  feeds?: Record<string, string[]>;
  // Keyed sources skipped because their monthly budget is used up.
  budgetSkipped?: string[];
};

// Relevance scoring: 0-100. Title gets 70 weight, snippet 30.
// Requires at least one query token to match. Penalises excludes hard.
const STOPWORDS = new Set(["the", "and", "for", "of", "in", "at", "to", "a", "an", "with", "or"]);

export function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s+#./-]/g, " ").split(/\s+/).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

export function scoreRelevance(
  title: string,
  snippet: string | undefined,
  queryTokens: string[],
  roleTokens: string[],
  excludeTokens: string[],
): number {
  const t = title.toLowerCase();
  const s = (snippet ?? "").toLowerCase();

  if (excludeTokens.some(ex => t.includes(ex))) return 0;

  let titleScore = 0;
  let snippetScore = 0;

  for (const tok of queryTokens) {
    if (t.includes(tok)) titleScore += 10;
    else if (s.includes(tok)) snippetScore += 4;
  }
  for (const tok of roleTokens) {
    if (t.includes(tok)) titleScore += 6;
    else if (s.includes(tok)) snippetScore += 2;
  }

  const anyQueryMatch = queryTokens.some(tok => t.includes(tok) || s.includes(tok));
  if (!anyQueryMatch) return 0;

  const raw = Math.min(70, titleScore) + Math.min(30, snippetScore);
  return Math.min(100, raw);
}

// Explains WHY a job scored below the relevance threshold — the keyword/
// seniority stage of the pre-scoring rules pipeline (see
// lib/server/services/rules-prefilter.ts for the recency/location stages
// that run after this one). Distinguishes an explicit seniority/keyword
// exclusion (e.g. "intern" on a senior candidate's search) from a plain
// no-match, so the survivor-count log names the actual reason rather than
// a generic "filtered."
export function explainLowRelevance(title: string, snippet: string | undefined, queryTokens: string[], excludeTokens: string[]): string {
  const t = title.toLowerCase();
  const matchedExclude = excludeTokens.find(ex => t.includes(ex));
  if (matchedExclude) return `Title contains excluded seniority/keyword term "${matchedExclude}"`;
  const preview = queryTokens.slice(0, 3).join(", ") + (queryTokens.length > 3 ? ", ..." : "");
  return `No match for any target keyword (${preview}) in title or snippet`;
}

export async function scanJobs(input: JobScanInput): Promise<JobScanOutput> {
  const {
    query,
    regions = [],
    companies = [],
    exaApiKey,
    adzunaAppId,
    adzunaAppKey,
    numResults = 30,
    roleKeywords = [],
    excludeKeywords = [],
    mode = "manual",
    includeRemoteBoards = true,
    location,
    sourceStats = [],
  } = input;
  const budget = input.budget ?? dbSourceBudget();
  const autopilot = mode === "autopilot";

  const queryTokens = tokenize(query);
  const roleTokens = roleKeywords.flatMap(k => tokenize(k));
  const excludeTokens = excludeKeywords.flatMap(k => tokenize(k));
  if (queryTokens.length === 0) throw new Error("Query has no useful tokens");

  const errors: string[] = [];
  const allResults: JobResult[] = [];
  const feeds: Record<string, string[]> = {};
  const budgetSkipped: string[] = [];
  const relevantCount = () => allResults.filter(j => scoreRelevance(j.title, j.snippet, queryTokens, roleTokens, excludeTokens) >= 20).length;

  // 1. COMPANY-DIRECT: each target company's public ATS board. A company
  // needs a tenant: its own atsTenant, SmartRecruiters' id slug
  // (ASSUMPTION: commonly matches CompanyTarget.id), or for Workday the
  // careers URL ({tenant}.wd{N}.myworkdayjobs.com/{site}).
  const atsPromises: Promise<void>[] = [];
  for (const c of companies) {
    if (!c.enabled) continue;
    const collector = ATS_COLLECTORS[c.ats];
    if (!collector) continue;
    const tenant = c.atsTenant ?? (c.ats === "smartrecruiters" ? c.id : undefined);
    const careersUrl = c.ats === "workday" ? c.careersUrl : undefined;
    if (!tenant && !careersUrl) continue;
    atsPromises.push(
      collector.collect({ tenant, careersUrl, companyName: c.name }).then(r => {
        if (r.error) errors.push(`${c.ats} (${c.name}): ${r.error}`);
        else feeds[c.id] = r.jobs.map(j => j.url);
        allResults.push(...r.jobs);
      }),
    );
  }
  await Promise.all(atsPromises);

  // Keyed sources run only with a key and remaining budget; autopilot uses
  // them only to top up what keyless, company-direct sources found.
  const keyed = async (source: JobSource, run: () => Promise<{ jobs: JobResult[]; error?: string }>) => {
    if (autopilot && relevantCount() >= numResults) return;
    if (budget.remaining(source) <= 0) { budgetSkipped.push(source); return; }
    budget.consume(source, 1);
    const r = await run();
    if (r.error) errors.push(`${SOURCE_META[source].label}: ${r.error}`);
    allResults.push(...r.jobs);
  };
  const searchLocation = location ?? (regions.includes("india") ? "India" : regions.includes("middle-east") ? "United Arab Emirates" : undefined);

  // 2. GOOGLE JOBS aggregators (route to the employer's own form).
  for (const g of GOOGLE_JOBS_COLLECTORS) {
    const apiKey = process.env[g.envKey];
    if (!apiKey) continue;
    await keyed(g.source, () => g.collector.collect({ apiKey, query, location: searchLocation, maxPages: 1, numResults }));
  }

  // 3. KEYLESS REMOTE BOARDS: one public call each.
  if (includeRemoteBoards) {
    const boardResults = await Promise.all(REMOTE_BOARD_COLLECTORS.map(b => b.collect({ query }).then(r => {
      if (r.error) errors.push(`${b.name}: ${r.error}`);
      return r.jobs;
    })));
    for (const r of boardResults) allResults.push(...r);
  }

  // 4. OTHER AGGREGATORS (keyed, budgeted).
  if (adzunaAppId && adzunaAppKey && regions.length > 0) {
    await keyed("adzuna", () => adzunaCollector.collect({ appId: adzunaAppId, appKey: adzunaAppKey, query, regions }));
  }
  for (const a of KEYED_AGGREGATORS) {
    const apiKey = process.env[a.envKey];
    if (!apiKey) continue;
    await keyed(a.source, () => a.collector.collect({ apiKey, query, location: searchLocation, numResults }));
  }

  // 5. EXA search: manual scans only; autopilot never calls Exa.
  if (!autopilot && exaApiKey && regions.length > 0) {
    const portalDomains = Array.from(new Set(regions.flatMap(r => REGION_PORTAL_DOMAINS[r] ?? [])));
    if (portalDomains.length) {
      const portalResult = await exaPortalCollector.collect({
        apiKey: exaApiKey,
        query: `${query} job opening`,
        domains: portalDomains,
        numResults: Math.min(numResults, 30),
      });
      if (portalResult.error) errors.push(`Exa portal search: ${portalResult.error}`);
      allResults.push(...portalResult.jobs);
    }

    const customCompanies = companies.filter(c => c.enabled && c.ats === "custom");
    if (customCompanies.length > 0 && customCompanies.length <= 30) {
      const companyLookup: CompanyDomainHint[] = [];
      const customDomains: string[] = [];
      for (const c of customCompanies) {
        try {
          const hostname = new URL(c.careersUrl.startsWith("http") ? c.careersUrl : `https://${c.careersUrl}`).hostname;
          customDomains.push(hostname);
          companyLookup.push({ name: c.name, hostname });
        } catch {
          // Skip a company whose careersUrl doesn't parse as a URL.
        }
      }
      const companyResult = await exaCompanyCollector.collect({
        apiKey: exaApiKey,
        query: `${query} careers opening`,
        domains: customDomains,
        numResults: Math.min(numResults, 30),
        companyLookup,
      });
      if (companyResult.error) errors.push(`Exa company search: ${companyResult.error}`);
      allResults.push(...companyResult.jobs);
    }
  }

  // CROSS-SOURCE DEDUPE: one record per job, keeping the company-direct URL.
  const deduped = dedupeJobs(allResults);

  const scored = deduped.map(j => ({
    ...j,
    relevance: scoreRelevance(j.title, j.snippet, queryTokens, roleTokens, excludeTokens),
  }));
  // Order: relevance (in bands of 10), then the source's observed
  // conversion for this user (company-direct first by default).
  const order = rankSources(sourceStats, [...new Set(scored.map(j => j.source))]);
  const rank = (s: string) => order.indexOf(s);
  const relevant = scored
    .filter(j => (j.relevance ?? 0) >= 20)
    .sort((a, b) => Math.floor((b.relevance ?? 0) / 10) - Math.floor((a.relevance ?? 0) / 10) || rank(a.source) - rank(b.source) || (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, Math.max(numResults, 30));

  // Zero-token keyword/seniority rejection log — every posting the
  // relevance filter above actually dropped, with why.
  const rejected: KeywordFilterRejection[] = scored
    .filter(j => (j.relevance ?? 0) < 20)
    .map(j => ({ title: j.title, company: j.company, reason: explainLowRelevance(j.title, j.snippet, queryTokens, excludeTokens) }));

  const bySource: Record<string, number> = {};
  for (const j of relevant) bySource[j.source] = (bySource[j.source] ?? 0) + 1;

  return {
    jobs: relevant,
    errors: errors.length > 0 ? errors : undefined,
    rejected,
    counts: {
      total: relevant.length,
      beforeFiltering: deduped.length,
      ats: relevant.filter(j => isCompanyDirect(j.source)).length,
      adzuna: relevant.filter(j => j.source === "adzuna").length,
      exa: relevant.filter(j => j.source === "exa-portal" || j.source === "exa-company").length,
      bySource,
    },
    feeds,
    ...(budgetSkipped.length ? { budgetSkipped } : {}),
  };
}
