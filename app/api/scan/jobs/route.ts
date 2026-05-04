import { NextRequest, NextResponse } from "next/server";
import { exaJobSearch } from "../../../../lib/exa-client";
import { CompanyTarget, Region } from "../../../../lib/company-targets";

export const runtime = "nodejs";

export type JobScanRequest = {
  query: string;                     // free text role keywords e.g. "AI Strategy Manager"
  regions?: Region[];                // ["middle-east", "india", "apac"]
  companies?: CompanyTarget[];       // user's enabled targets; client passes them in
  exaApiKey?: string;
  numResults?: number;
};

export type JobResult = {
  title: string;
  company?: string;
  location?: string;
  url: string;
  source: "greenhouse" | "ashby" | "lever" | "exa-portal" | "exa-company";
  publishedDate?: string;
  snippet?: string;
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

function matchesQuery(title: string, query: string): boolean {
  const t = title.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return tokens.some(tok => t.includes(tok));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as JobScanRequest;
    const { query, regions = [], companies = [], exaApiKey, numResults = 30 } = body;

    if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

    const errors: string[] = [];
    const allResults: JobResult[] = [];

    // Parallel ATS feed fetches for known tenants
    const atsPromises: Promise<JobResult[]>[] = [];
    for (const c of companies) {
      if (!c.enabled || !c.atsTenant) continue;
      if (c.ats === "greenhouse") atsPromises.push(fetchGreenhouse(c.atsTenant, c.name));
      else if (c.ats === "ashby") atsPromises.push(fetchAshby(c.atsTenant, c.name));
      else if (c.ats === "lever") atsPromises.push(fetchLever(c.atsTenant, c.name));
    }

    const atsResults = await Promise.all(atsPromises);
    for (const r of atsResults) {
      allResults.push(...r.filter(j => matchesQuery(j.title, query)));
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

    return NextResponse.json({
      jobs: deduped,
      errors: errors.length > 0 ? errors : undefined,
      counts: {
        total: deduped.length,
        ats: deduped.filter(j => j.source === "greenhouse" || j.source === "ashby" || j.source === "lever").length,
        exa: deduped.filter(j => j.source === "exa-portal" || j.source === "exa-company").length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Job scan failed" }, { status: 500 });
  }
}
