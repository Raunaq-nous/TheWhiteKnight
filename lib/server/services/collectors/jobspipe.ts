import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// JobsPipe: normalised postings pulled from company ATS boards.
//
// UNVERIFIED ENDPOINT: the public docs could not be reached from the build
// sandbox, so the base URL, path, auth scheme and response field names below
// are a best guess (GET /v1/jobs, Bearer auth, `jobs` or `data` array).
// Correct JOBSPIPE_BASE (and the mapping in mapJob) against the live docs
// before relying on this source. Mapping is deliberately defensive.
export const JOBSPIPE_BASE = "https://api.jobspipe.dev/v1";
const ENV_KEY = "JOBSPIPE_API_KEY";

function redact(msg: string, key: string): string {
  return key ? msg.split(key).join("[redacted]") : msg;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function mapJob(j: any): JobResult | null {
  const title = str(j?.title);
  const url = str(j?.url) ?? str(j?.apply_url);
  if (!title || !url) return null;
  const company = str(j.company_name) ?? str(j.company) ?? str(j.company?.name);
  const location = Array.isArray(j.location)
    ? j.location.map((l: any) => (typeof l === "string" ? l : l?.name)).filter(Boolean).join("; ") || undefined
    : str(j.location) ?? str(j.location?.name);
  const description = str(j.description);
  return {
    title,
    company,
    location,
    url,
    source: "jobspipe",
    publishedDate: str(j.posted_at) ?? str(j.published_at),
    snippet: description?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240),
    descriptionHtml: description,
    externalId: j.id != null ? String(j.id) : undefined,
    // Postings come from company ATS boards, so the apply link is direct.
    applyUrl: str(j.apply_url) ?? str(j.url),
    via: str(j.ats),
    remote: typeof j.remote === "boolean" ? j.remote : undefined,
  };
}

async function fetchJobsPipe(input: CollectorInput, apiKey: string): Promise<CollectorResult> {
  const query = input.query?.trim();
  if (!query) return { jobs: [], error: "JobsPipe: query is required" };
  const params = new URLSearchParams({ q: query, limit: String(input.numResults || 25) });
  if (input.location) params.set("location", input.location);
  try {
    const res = await fetch(`${JOBSPIPE_BASE}/jobs?${params.toString()}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { jobs: [], error: `JobsPipe HTTP ${res.status}` };
    const data = await res.json();
    const rows = Array.isArray(data?.jobs) ? data.jobs : Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : null;
    if (!rows) return { jobs: [], error: "JobsPipe: unexpected response shape" };
    return { jobs: rows.map(mapJob).filter((j: JobResult | null): j is JobResult => j !== null) };
  } catch (e: any) {
    return { jobs: [], error: redact(`JobsPipe fetch failed: ${e?.message ?? "unknown error"}`, apiKey) };
  }
}

export const jobsPipeCollector: JobCollector = {
  name: "jobspipe",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    const apiKey = input.apiKey;
    if (!apiKey) return { jobs: [], error: `${ENV_KEY} not set` };
    try {
      return await fetchJobsPipe(input, apiKey);
    } catch (e: any) {
      return { jobs: [], error: redact(e?.message ?? "JobsPipe fetch failed", apiKey) };
    }
  },
};
