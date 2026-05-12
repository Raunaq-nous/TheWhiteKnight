import { NextRequest, NextResponse } from "next/server";
import { exaJobSearch } from "../../../../lib/exa-client";
import { CompanyTarget, Region } from "../../../../lib/company-targets";
import { adzunaSearch, REGION_TO_ADZUNA_COUNTRIES, AdzunaCountry } from "../../../../lib/adzuna-client";

export const runtime = "nodejs";

export type JobScanRequest = {
  query: string;                     // free text role keywords e.g. "AI Strategy Manager"
  regions?: Region[];                // ["middle-east", "india", "apac"]
  companies?: CompanyTarget[];       // user's enabled targets; client passes them in
  exaApiKey?: string;
  adzunaAppId?: string;
  adzunaAppKey?: string;
  numResults?: number;
  // Optional: extra role keywords inferred from the user's profile,
  // used to score relevance after fetching from sources.
  roleKeywords?: string[];
  // Optional: hard-exclude these keywords from titles (e.g. "Intern" if user is senior)
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
};

// ATS feed fetchers — public, no key required
async function fetchGreenhouse(tenant: string, companyName: string): Promise<JobResult[]> {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${tenant}/jobs`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs ?? []).map((j: any) => ({
      title: j.title,
      company: companyName,
      location: j.location?.name,
      url: j.absolute_url,
      source: "greenhouse" as const,
      publishedDate: j.updated_at,
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
const STOPWORDS = new Set(["the","and","for","of","in","at","to","a","an","with","or"]);

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s+#./-]/g, " ").split(/\s+/).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function scoreRelevance(
  title: string,
  snippet: string | undefined,
  queryTokens: string[],
  roleTokens: string[],
  excludeTokens: string[]
): number {
  const t = title.toLowerCase();
  const s = (snippet ?? "").toLowerCase();

  // Hard reject if title contains an exclude term
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

  // At least one query token must match somewhere
  const anyQueryMatch = queryTokens.some(tok => t.includes(tok) || s.includes(tok));
  if (!anyQueryMatch) return 0;

  // Normalize to 0-100. Cap the total.
  const raw = Math.min(70, titleScore) + Math.min(30, snippetScore);
  return Math.min(100, raw);
}

async function fetchAdzuna(
  appId: string,
  appKey: string,
  query: string,
  regions: Region[]
): Promise<JobResult[]> {
  const countries: AdzunaCountry[] = Array.from(new Set(
    regions.flatMap(r => REGION_TO_ADZUNA_COUNTRIES[r] ?? [])
  ));
  if (countries.length === 0) return [];

  const results: JobResult[] = [];
  // Limit to 3 countries max per scan to conserve free-tier credits
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as JobScanRequest;
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
    } = body;

    if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

    const queryTokens = tokenize(query);
    const roleTokens = roleKeywords.flatMap(k => tokenize(k));
    const excludeTokens = excludeKeywords.flatMap(k => tokenize(k));
    if (queryTokens.length === 0) return NextResponse.json({ error: "Query has no useful tokens" }, { status: 400 });

    const errors: string[] = [];
    const allResults: JobResult[] = [];

    // Parallel ATS feed fetches for known tenants — these return ALL jobs at the
    // company, we score them after.
    const atsPromises: Promise<JobResult[]>[] = [];
    for (const c of companies) {
      if (!c.enabled || !c.atsTenant) continue;
      if (c.ats === "greenhouse") atsPromises.push(fetchGreenhouse(c.atsTenant, c.name));
      else if (c.ats === "ashby") atsPromises.push(fetchAshby(c.atsTenant, c.name));
      else if (c.ats === "lever") atsPromises.push(fetchLever(c.atsTenant, c.name));
    }

    const atsResults = await Promise.all(atsPromises);
    for (const r of atsResults) allResults.push(...r);

    // Adzuna structured search per region (preferred when available)
    if (adzunaAppId && adzunaAppKey && regions.length > 0) {
      try {
        const adzunaResults = await fetchAdzuna(adzunaAppId, adzunaAppKey, query, regions);
        allResults.push(...adzunaResults);
      } catch (e: any) {
        errors.push(`Adzuna: ${e.message}`);
      }
    }

    // Exa searches per region (consolidated portals)
    if (exaApiKey && regions.length > 0) {
      const portalDomains = Array.from(new Set(regions.flatMap(r => REGION_PORTAL_DOMAINS[r] ?? [])));
      try {
        const exaResults = await exaJobSearch(
          exaApiKey,
          `${query} job opening 2025`,
          portalDomains,
          Math.min(numResults, 30)
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

      // Exa search across enabled custom-ATS company sites that didn't have ATS tenants
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
            Math.min(numResults, 30)
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

    // Dedupe by URL
    const seen = new Set<string>();
    const deduped = allResults.filter(j => {
      if (seen.has(j.url)) return false;
      seen.add(j.url);
      return true;
    });

    // Score relevance and filter — only keep jobs with >= 20 relevance score
    const scored = deduped.map(j => ({
      ...j,
      relevance: scoreRelevance(j.title, j.snippet, queryTokens, roleTokens, excludeTokens),
    }));
    const relevant = scored
      .filter(j => (j.relevance ?? 0) >= 20)
      .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
      .slice(0, Math.max(numResults, 30));

    return NextResponse.json({
      jobs: relevant,
      errors: errors.length > 0 ? errors : undefined,
      counts: {
        total: relevant.length,
        beforeFiltering: deduped.length,
        ats: relevant.filter(j => j.source === "greenhouse" || j.source === "ashby" || j.source === "lever").length,
        adzuna: relevant.filter(j => j.source === "adzuna").length,
        exa: relevant.filter(j => j.source === "exa-portal" || j.source === "exa-company").length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Job scan failed" }, { status: 500 });
  }
}
