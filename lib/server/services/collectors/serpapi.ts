import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// Google Jobs via SerpApi. Free tier is a small monthly search budget, and
// every page fetched is one search against it, so maxPages defaults to 1.
// Docs: https://serpapi.com/google-jobs-api
const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const ENV_KEY = "SERPAPI_API_KEY";

// Hostname labels of mass job boards. An apply link on any of these is not
// company-direct; we prefer the employer's own careers site when Google
// Jobs offers one. Matched per label so country variants (in.indeed.com,
// glassdoor.co.uk, uk.linkedin.com) are caught too.
const MASS_BOARD_LABELS = new Set([
  "linkedin", "indeed", "glassdoor", "ziprecruiter", "monster", "simplyhired",
  "careerbuilder", "talent", "jooble", "lensa", "bebee", "adzuna", "snagajob",
  "salary", "jobrapido", "learn4good", "dice", "builtin", "wellfound", "naukri",
  "foundit", "shine", "timesjobs", "instahyre", "hirist", "iimjobs", "upwork",
]);

export function isMassBoardUrl(url: string): boolean {
  try {
    const labels = new URL(url).hostname.toLowerCase().split(".");
    return labels.some(l => MASS_BOARD_LABELS.has(l));
  } catch {
    return true; // unparseable: never treat as company-direct
  }
}

// Google Jobs gives relative ages ("3 days ago"); convert to an ISO date so
// downstream freshness checks work. Unknown formats pass through unchanged.
export function relativeAgeToIso(posted: string | undefined, now: Date = new Date()): string | undefined {
  if (!posted) return undefined;
  const m = /(\d+)\+?\s*(minute|hour|day|week|month)s?\s+ago/i.exec(posted);
  if (!m) return posted;
  const n = Number(m[1]);
  const unitMs: Record<string, number> = {
    minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000,
  };
  return new Date(now.getTime() - n * unitMs[m[2].toLowerCase()]).toISOString();
}

function redact(msg: string, key: string): string {
  return key ? msg.split(key).join("[redacted]") : msg;
}

function mapJob(j: any): JobResult | null {
  const options: { link?: string }[] = Array.isArray(j?.apply_options) ? j.apply_options : [];
  const links = options.map(o => o?.link).filter((l): l is string => typeof l === "string" && l.length > 0);
  const direct = links.find(l => !isMassBoardUrl(l));
  const url = direct ?? links[0] ?? j?.share_link;
  if (!j?.title || !url) return null;
  const description: string | undefined = typeof j.description === "string" ? j.description : undefined;
  return {
    title: j.title,
    company: j.company_name,
    location: j.location,
    url,
    source: "serpapi",
    publishedDate: relativeAgeToIso(j.detected_extensions?.posted_at),
    snippet: description?.replace(/\s+/g, " ").trim().slice(0, 240),
    descriptionHtml: description,
    externalId: j.job_id,
    applyUrl: direct,
    via: typeof j.via === "string" ? j.via.replace(/^via\s+/i, "") : undefined,
    remote: j.detected_extensions?.work_from_home === true ? true : undefined,
  };
}

async function fetchSerpApi(input: CollectorInput, apiKey: string): Promise<CollectorResult> {
  const query = input.query?.trim();
  if (!query) return { jobs: [], error: "SerpApi: query is required" };
  const maxPages = Math.max(1, input.maxPages ?? 1);
  const jobs: JobResult[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ engine: "google_jobs", q: query });
    if (input.location) params.set("location", input.location);
    if (nextToken) params.set("next_page_token", nextToken);
    params.set("api_key", apiKey);

    let data: any;
    try {
      const res = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return { jobs, error: `SerpApi HTTP ${res.status}` };
      data = await res.json();
    } catch (e: any) {
      return { jobs, error: redact(`SerpApi fetch failed: ${e?.message ?? "unknown error"}`, apiKey) };
    }
    if (data?.error && !Array.isArray(data?.jobs_results)) {
      // SerpApi reports "Google hasn't returned any results" as an error;
      // on later pages that just means the end of results.
      if (page > 0) break;
      return { jobs, error: redact(`SerpApi: ${String(data.error)}`, apiKey) };
    }
    for (const j of data?.jobs_results ?? []) {
      const mapped = mapJob(j);
      if (mapped) jobs.push(mapped);
    }
    nextToken = data?.serpapi_pagination?.next_page_token ?? data?.next_page_token;
    if (!nextToken) break;
  }
  return { jobs: input.numResults ? jobs.slice(0, input.numResults) : jobs };
}

export const serpApiCollector: JobCollector = {
  name: "serpapi",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    const apiKey = input.apiKey;
    if (!apiKey) return { jobs: [], error: `${ENV_KEY} not set` };
    try {
      return await fetchSerpApi(input, apiKey);
    } catch (e: any) {
      return { jobs: [], error: redact(e?.message ?? "SerpApi fetch failed", apiKey) };
    }
  },
};
