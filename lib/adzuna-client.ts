// Adzuna Jobs API client. Free tier: 1,000 requests/month per app.
// Docs: https://developer.adzuna.com/docs/search

export type AdzunaJob = {
  id: string;
  title: string;
  company?: string;
  location?: string;
  url: string;
  description?: string;
  created?: string;
  salaryMin?: number;
  salaryMax?: number;
  contractType?: string;
};

export type AdzunaCountry = "in" | "ae" | "gb" | "us" | "sg" | "au" | "ca" | "fr" | "de" | "nl" | "br" | "mx" | "za" | "pl" | "at" | "be" | "ch" | "it" | "nz";

// Map our Region type to Adzuna country code(s)
export const REGION_TO_ADZUNA_COUNTRIES: Record<string, AdzunaCountry[]> = {
  "india": ["in"],
  "middle-east": ["ae"], // UAE is the only ME country Adzuna supports
  "apac": ["sg", "au", "nz"],
  "north-america": ["us", "ca"],
  "europe": ["gb", "fr", "de", "nl", "it", "ch", "at", "be", "pl"],
  "global": ["gb", "us", "in"],
};

const ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs";

export async function adzunaSearch(
  appId: string,
  appKey: string,
  opts: {
    country: AdzunaCountry;
    what: string;
    where?: string;
    resultsPerPage?: number;
    page?: number;
    sortBy?: "default" | "date" | "relevance" | "salary";
    maxDaysOld?: number;
  }
): Promise<AdzunaJob[]> {
  if (!appId || !appKey) throw new Error("Adzuna credentials missing.");

  const url = new URL(`${ADZUNA_BASE}/${opts.country}/search/${opts.page ?? 1}`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", String(opts.resultsPerPage ?? 20));
  url.searchParams.set("what", opts.what);
  if (opts.where) url.searchParams.set("where", opts.where);
  if (opts.sortBy) url.searchParams.set("sort_by", opts.sortBy);
  if (opts.maxDaysOld) url.searchParams.set("max_days_old", String(opts.maxDaysOld));
  url.searchParams.set("content-type", "application/json");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Adzuna ${opts.country} ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.results ?? []).map((j: any) => ({
    id: String(j.id),
    title: j.title,
    company: j.company?.display_name,
    location: j.location?.display_name,
    url: j.redirect_url,
    description: j.description,
    created: j.created,
    salaryMin: j.salary_min,
    salaryMax: j.salary_max,
    contractType: j.contract_type,
  }));
}
