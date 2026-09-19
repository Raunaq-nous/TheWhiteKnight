import "server-only";
import { CompanyTarget, Region } from "../../company-targets";
import {
  ATS_COLLECTORS,
  REGION_PORTAL_DOMAINS,
  exaPortalCollector,
  exaCompanyCollector,
  adzunaCollector,
} from "./collectors";
import type { CompanyDomainHint, JobResult } from "./collectors/types";

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
  };
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
  } = input;

  const queryTokens = tokenize(query);
  const roleTokens = roleKeywords.flatMap(k => tokenize(k));
  const excludeTokens = excludeKeywords.flatMap(k => tokenize(k));
  if (queryTokens.length === 0) throw new Error("Query has no useful tokens");

  const errors: string[] = [];
  const allResults: JobResult[] = [];

  // Per-company ATS collectors (Greenhouse/Ashby/Lever/SmartRecruiters).
  // A company needs a tenant identifier to be dispatched: its own
  // `atsTenant`, or, for SmartRecruiters, a fallback to the company's own
  // `id` slug (ASSUMPTION: SmartRecruiters' companyIdentifier commonly
  // matches the kind of slug already used for CompanyTarget.id, e.g.
  // "roland-berger"; existing SmartRecruiters seed entries don't set
  // atsTenant explicitly).
  const atsPromises: Promise<JobResult[]>[] = [];
  for (const c of companies) {
    if (!c.enabled) continue;
    const collector = ATS_COLLECTORS[c.ats];
    if (!collector) continue;
    const tenant = c.atsTenant ?? (c.ats === "smartrecruiters" ? c.id : undefined);
    if (!tenant) continue;
    atsPromises.push(
      collector.collect({ tenant, companyName: c.name }).then(r => {
        if (r.error) errors.push(`${c.ats} (${c.name}): ${r.error}`);
        return r.jobs;
      }),
    );
  }

  const atsResults = await Promise.all(atsPromises);
  for (const r of atsResults) allResults.push(...r);

  if (adzunaAppId && adzunaAppKey && regions.length > 0) {
    const adzunaResult = await adzunaCollector.collect({
      appId: adzunaAppId,
      appKey: adzunaAppKey,
      query,
      regions,
    });
    if (adzunaResult.error) errors.push(`Adzuna: ${adzunaResult.error}`);
    allResults.push(...adzunaResult.jobs);
  }

  if (exaApiKey && regions.length > 0) {
    const portalDomains = Array.from(new Set(regions.flatMap(r => REGION_PORTAL_DOMAINS[r] ?? [])));
    const portalResult = await exaPortalCollector.collect({
      apiKey: exaApiKey,
      query: `${query} job opening 2025`,
      domains: portalDomains,
      numResults: Math.min(numResults, 30),
    });
    if (portalResult.error) errors.push(`Exa portal search: ${portalResult.error}`);
    allResults.push(...portalResult.jobs);

    const customCompanies = companies.filter(c => c.enabled && (c.ats === "custom" || c.ats === "workday"));
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

  const seen = new Set<string>();
  const deduped = allResults.filter(j => {
    if (seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });

  const scored = deduped.map(j => ({
    ...j,
    relevance: scoreRelevance(j.title, j.snippet, queryTokens, roleTokens, excludeTokens),
  }));
  const relevant = scored
    .filter(j => (j.relevance ?? 0) >= 20)
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, Math.max(numResults, 30));

  // Zero-token keyword/seniority rejection log — every posting the
  // relevance filter above actually dropped, with why. Deterministic;
  // costs nothing beyond the string matching already done for scoring.
  const rejected: KeywordFilterRejection[] = scored
    .filter(j => (j.relevance ?? 0) < 20)
    .map(j => ({ title: j.title, company: j.company, reason: explainLowRelevance(j.title, j.snippet, queryTokens, excludeTokens) }));

  return {
    jobs: relevant,
    errors: errors.length > 0 ? errors : undefined,
    rejected,
    counts: {
      total: relevant.length,
      beforeFiltering: deduped.length,
      ats: relevant.filter(j => j.source === "greenhouse" || j.source === "ashby" || j.source === "lever" || j.source === "smartrecruiters").length,
      adzuna: relevant.filter(j => j.source === "adzuna").length,
      exa: relevant.filter(j => j.source === "exa-portal" || j.source === "exa-company").length,
    },
  };
}
