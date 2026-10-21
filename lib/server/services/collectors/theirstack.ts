import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// TheirStack job search. Free tier is a small monthly credit budget (credits
// are charged per job returned), so `limit` is kept modest.
// Docs: https://api.theirstack.com/ (POST /v1/jobs/search)
const THEIRSTACK_ENDPOINT = "https://api.theirstack.com/v1/jobs/search";
const ENV_KEY = "THEIRSTACK_API_KEY";

function redact(msg: string, key: string): string {
  return key ? msg.split(key).join("[redacted]") : msg;
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

function mapJob(j: any): JobResult | null {
  const url: string | undefined = j?.url ?? j?.final_url;
  if (!j?.job_title || !url) return null;
  const description: string | undefined = typeof j.description === "string" ? j.description : undefined;
  const applyUrl: string | undefined = j.final_url || undefined;
  return {
    title: j.job_title,
    company: j.company ?? j.company_object?.name,
    location: j.location ?? j.short_location ?? undefined,
    url,
    source: "theirstack",
    publishedDate: j.date_posted,
    snippet: description?.replace(/\s+/g, " ").trim().slice(0, 240),
    descriptionHtml: description,
    externalId: j.id != null ? String(j.id) : undefined,
    applyUrl,
    via: hostOf(j.source_url ?? j.url),
    remote: typeof j.remote === "boolean" ? j.remote : undefined,
  };
}

async function fetchTheirStack(input: CollectorInput, apiKey: string): Promise<CollectorResult> {
  const query = input.query?.trim();
  if (!query) return { jobs: [], error: "TheirStack: query is required" };
  const body: Record<string, unknown> = {
    page: 0,
    limit: input.numResults || 25,
    job_title_or: [query],
    posted_at_max_age_days: 30,
  };
  if (input.location) body.job_location_pattern_or = [input.location];
  try {
    const res = await fetch(THEIRSTACK_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { jobs: [], error: `TheirStack HTTP ${res.status}` };
    const data = await res.json();
    if (!Array.isArray(data?.data)) return { jobs: [], error: "TheirStack: unexpected response shape" };
    return { jobs: data.data.map(mapJob).filter((j: JobResult | null): j is JobResult => j !== null) };
  } catch (e: any) {
    return { jobs: [], error: redact(`TheirStack fetch failed: ${e?.message ?? "unknown error"}`, apiKey) };
  }
}

export const theirStackCollector: JobCollector = {
  name: "theirstack",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    const apiKey = input.apiKey;
    if (!apiKey) return { jobs: [], error: `${ENV_KEY} not set` };
    try {
      return await fetchTheirStack(input, apiKey);
    } catch (e: any) {
      return { jobs: [], error: redact(e?.message ?? "TheirStack fetch failed", apiKey) };
    }
  },
};
