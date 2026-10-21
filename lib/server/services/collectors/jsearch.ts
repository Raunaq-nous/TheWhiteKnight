import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// JSearch (OpenWeb Ninja, via RapidAPI): Google Jobs data. Free tier is a
// small monthly request budget; num_pages > 1 is billed per page, so we
// default to one. Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
const JSEARCH_HOST = "jsearch.p.rapidapi.com";
const ENV_KEY = "JSEARCH_API_KEY";

function redact(msg: string, key: string): string {
  return key ? msg.split(key).join("[redacted]") : msg;
}

function mapJob(j: any): JobResult | null {
  // job_apply_is_direct means the primary link is the employer's own form.
  // Otherwise look for a direct option among apply_options.
  let applyUrl: string | undefined = j?.job_apply_is_direct && j?.job_apply_link ? j.job_apply_link : undefined;
  if (!applyUrl && Array.isArray(j?.apply_options)) {
    applyUrl = j.apply_options.find((o: any) => o?.is_direct && o?.apply_link)?.apply_link;
  }
  const url: string | undefined = j?.job_apply_link ?? applyUrl ?? j?.job_google_link;
  if (!j?.job_title || !url) return null;
  const location = [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ") || j.job_location || undefined;
  const description: string | undefined = typeof j.job_description === "string" ? j.job_description : undefined;
  return {
    title: j.job_title,
    company: j.employer_name,
    location,
    url,
    source: "jsearch",
    publishedDate: j.job_posted_at_datetime_utc,
    snippet: description?.replace(/\s+/g, " ").trim().slice(0, 240),
    descriptionHtml: description,
    externalId: j.job_id,
    applyUrl,
    via: j.job_publisher,
    remote: typeof j.job_is_remote === "boolean" ? j.job_is_remote : undefined,
  };
}

async function fetchJSearch(input: CollectorInput, apiKey: string): Promise<CollectorResult> {
  const q = input.query?.trim();
  if (!q) return { jobs: [], error: "JSearch: query is required" };
  const query = input.location ? `${q} in ${input.location}` : q;
  const params = new URLSearchParams({
    query,
    page: "1",
    num_pages: String(Math.max(1, input.maxPages ?? 1)),
  });
  try {
    const res = await fetch(`https://${JSEARCH_HOST}/search?${params.toString()}`, {
      cache: "no-store",
      headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": JSEARCH_HOST },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { jobs: [], error: `JSearch HTTP ${res.status}` };
    const data = await res.json();
    if (!Array.isArray(data?.data)) {
      return { jobs: [], error: redact(`JSearch: unexpected response${data?.message ? `: ${data.message}` : ""}`, apiKey) };
    }
    const jobs = data.data.map(mapJob).filter((j: JobResult | null): j is JobResult => j !== null);
    return { jobs: input.numResults ? jobs.slice(0, input.numResults) : jobs };
  } catch (e: any) {
    return { jobs: [], error: redact(`JSearch fetch failed: ${e?.message ?? "unknown error"}`, apiKey) };
  }
}

export const jsearchCollector: JobCollector = {
  name: "jsearch",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    const apiKey = input.apiKey;
    if (!apiKey) return { jobs: [], error: `${ENV_KEY} not set` };
    try {
      return await fetchJSearch(input, apiKey);
    } catch (e: any) {
      return { jobs: [], error: redact(e?.message ?? "JSearch fetch failed", apiKey) };
    }
  },
};
