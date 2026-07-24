import "server-only";
import { exaJobSearch } from "../../exa-client";
import { CompanyTarget, Region } from "../../company-targets";
import { adzunaSearch, REGION_TO_ADZUNA_COUNTRIES, AdzunaCountry } from "../../adzuna-client";

// Extracted from the former app/api/scan/jobs/route.ts body so both the
// manual scan UI (via the route, now a thin wrapper) and the scheduled
// automation service can call the same logic directly, with no HTTP hop.

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

export type JobResult = {
  title: string;
  company?: string;
  location?: string;
  url: string;
  source: "greenhouse" | "ashby" | "lever" | "exa-portal" | "exa-company" | "adzuna";
  publishedDate?: string;
  snippet?: string;
  relevance?: number; // 0-100 score against query + roleKeywords
  // Full job description text, when the source's own API already returns it
  // (Greenhouse/Ashby/Lever) — avoids a second fetch per job for scoring.
  descriptionHtml?: string;
};

export type JobScanOutput = {
  jobs: JobResult[];
  errors?: string[];
  counts: {
    total: number;
    beforeFiltering: number;
    ats: number;
    adzuna: number;
    exa: number;
  };
};

// ATS feed fetchers — public, no key required.
async function fetchGreenhouse(tenant: string, companyName: string): Promise<JobResult[]> {
  try {
    // content=true is required by Greenhouse's public API for the full job
    // description to be included at all — without it, `content` is always
    // absent. Purely additive: does not change which jobs are returned.
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${tenant}/jobs?content=true`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs ?? []).map((j: any) => ({
      title: j.title,
      company: companyName,
      location: j.location?.name,
      url: j.absolute_url,
      source: "greenhouse" as const,
      publishedDate: j.updated_at,
      descriptionHtml: j.content,
    }));
  } catch { return []; }
}

async function fetchAshby(tenant: string, companyName: string): Promise<JobResult[]> {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${tenant}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs ?? []).map((j: any) => ({
      title: j.title,
      company: companyName,
      location: j.locationName,
      url: j.jobUrl ?? `https://jobs.ashbyhq.com/${tenant}/${j.id}`,
      source: "ashby" as const,
      publishedDate: j.publishedAt,
      descriptionHtml: j.descriptionHtml ?? j.description,
    }));
  } catch { return []; }
}

async function fetchLever(tenant: string, companyName: string): Promise<JobResult[]> {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${tenant}?mode=json`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data ?? []).map((j: any) => ({
      title: j.text,
      company: companyName,
      location: j.categories?.location,
      url: j.hostedUrl,
      source: "lever" as const,
      publishedDate: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
      descriptionHtml: j.descriptionPlain ?? j.description,
    }));
  } catch { return []; }
}

const REGION_PORTAL_DOMAINS: Record<Region, string[]> = {
  "middle-east": ["bayt.com", "naukrigulf.com", "linkedin.com/jobs", "gulftalent.com"],
  "india": ["naukri.com", "linkedin.com/jobs", "instahyre.com", "iimjobs.com"],
  "apac": ["jobstreet.com", "seek.com", "linkedin.com/jobs", "glassdoor.sg"],
  "north-america": ["linkedin.com/jobs", "indeed.com", "glassdoor.com"],
  "europe": ["linkedin.com/jobs", "indeed.co.uk"],
  "global": ["linkedin.com/jobs"],
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

async function fetchAdzuna(
  appId: string,
  appKey: string,
  query: string,
  regions: Region[],
): Promise<JobResult[]> {
  const countries: AdzunaCountry[] = Array.from(new Set(
    regions.flatMap(r => REGION_TO_ADZUNA_COUNTRIES[r] ?? []),
  ));
  if (countries.length === 0) return [];

  const results: JobResult[] = [];
  for (const country of countries.slice(0, 3)) {
    try {
      const jobs = await adzunaSearch(appId, appKey, {
        country,
        what: query,
        resultsPerPage: 20,
        sortBy: "relevance",
        maxDaysOld: 30,
      });
      for (const j of jobs) {
        results.push({
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
          source: "adzuna",
          publishedDate: j.created,
          snippet: j.description?.slice(0, 240),
        });
      }
    } catch {
      // Skip country on failure; other countries continue
    }
  }
  return results;
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

  const atsPromises: Promise<JobResult[]>[] = [];
  for (const c of companies) {
    if (!c.enabled || !c.atsTenant) continue;
    if (c.ats === "greenhouse") atsPromises.push(fetchGreenhouse(c.atsTenant, c.name));
    else if (c.ats === "ashby") atsPromises.push(fetchAshby(c.atsTenant, c.name));
    else if (c.ats === "lever") atsPromises.push(fetchLever(c.atsTenant, c.name));
  }

  const atsResults = await Promise.all(atsPromises);
  for (const r of atsResults) allResults.push(...r);

  if (adzunaAppId && adzunaAppKey && regions.length > 0) {
    try {
      const adzunaResults = await fetchAdzuna(adzunaAppId, adzunaAppKey, query, regions);
      allResults.push(...adzunaResults);
    } catch (e: any) {
      errors.push(`Adzuna: ${e.message}`);
    }
  }

  if (exaApiKey && regions.length > 0) {
    const portalDomains = Array.from(new Set(regions.flatMap(r => REGION_PORTAL_DOMAINS[r] ?? [])));
    try {
      const exaResults = await exaJobSearch(
        exaApiKey,
        `${query} job opening 2025`,
        portalDomains,
        Math.min(numResults, 30),
      );
      for (const r of exaResults) {
        allResults.push({
          title: r.title,
          url: r.url,
          source: "exa-portal" as const,
          publishedDate: r.publishedDate,
          snippet: r.highlights?.[0] ?? r.text?.slice(0, 200),
        });
      }
    } catch (e: any) {
      errors.push(`Exa portal search: ${e.message}`);
    }

    const customCompanies = companies.filter(c => c.enabled && (c.ats === "custom" || c.ats === "workday" || c.ats === "smartrecruiters"));
    if (customCompanies.length > 0 && customCompanies.length <= 30) {
      const customDomains = customCompanies
        .map(c => { try { return new URL(c.careersUrl.startsWith("http") ? c.careersUrl : `https://${c.careersUrl}`).hostname; } catch { return null; } })
        .filter((d): d is string => !!d);
      try {
        const exaCompanyResults = await exaJobSearch(
          exaApiKey,
          `${query} careers opening`,
          customDomains,
          Math.min(numResults, 30),
        );
        for (const r of exaCompanyResults) {
          const matchedCompany = customCompanies.find(c => r.url.includes(new URL(c.careersUrl.startsWith("http") ? c.careersUrl : `https://${c.careersUrl}`).hostname));
          allResults.push({
            title: r.title,
            company: matchedCompany?.name,
            url: r.url,
            source: "exa-company" as const,
            publishedDate: r.publishedDate,
            snippet: r.highlights?.[0] ?? r.text?.slice(0, 200),
          });
        }
      } catch (e: any) {
        errors.push(`Exa company search: ${e.message}`);
      }
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

  return {
    jobs: relevant,
    errors: errors.length > 0 ? errors : undefined,
    counts: {
      total: relevant.length,
      beforeFiltering: deduped.length,
      ats: relevant.filter(j => j.source === "greenhouse" || j.source === "ashby" || j.source === "lever").length,
      adzuna: relevant.filter(j => j.source === "adzuna").length,
      exa: relevant.filter(j => j.source === "exa-portal" || j.source === "exa-company").length,
    },
  };
}
