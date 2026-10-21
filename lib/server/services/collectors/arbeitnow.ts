import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// Arbeitnow public job-board API (keyless, Europe-heavy). The endpoint has
// no search parameter, so we fetch the first page once and filter by query
// client-side. Not every Arbeitnow job is remote; we report their own
// `remote` flag. Docs: https://www.arbeitnow.com/blog/job-board-api
const USER_AGENT = "CareerOS/1.0 (personal job search tool)";

function toSnippet(html: unknown): string | undefined {
  if (typeof html !== "string" || !html) return undefined;
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || undefined;
}

const STOPWORDS = new Set(["and", "or", "the", "of", "in", "for", "a", "an", "to", "with", "at"]);

// Client-side filter: keep a job when its text contains any query word.
// No query means no filtering.
function matchesQuery(text: string, query: string | undefined): boolean {
  const words = (query ?? "").toLowerCase().split(/[^a-z0-9+#.]+/).filter(w => w.length > 1 && !STOPWORDS.has(w));
  if (words.length === 0) return true;
  const hay = text.toLowerCase();
  return words.some(w => hay.includes(w));
}

function unixToIso(v: unknown): string | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return typeof v === "string" ? v : undefined;
  return new Date(v < 1e12 ? v * 1000 : v).toISOString();
}

function mapJob(j: any): JobResult | null {
  if (!j?.title || !j?.url) return null;
  return {
    title: j.title,
    company: j.company_name,
    location: j.location || undefined,
    url: j.url,
    source: "arbeitnow",
    publishedDate: unixToIso(j.created_at),
    snippet: toSnippet(j.description),
    descriptionHtml: j.description,
    externalId: j.slug,
    via: "Arbeitnow",
    remote: j.remote === true,
  };
}

export const arbeitnowCollector: JobCollector = {
  name: "arbeitnow",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    try {
      const res = await fetch("https://www.arbeitnow.com/api/job-board-api", {
        cache: "no-store",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return { jobs: [], error: `Arbeitnow HTTP ${res.status}` };
      const data = await res.json();
      if (!Array.isArray(data?.data)) return { jobs: [], error: "Arbeitnow: unexpected response shape" };
      const jobs = data.data
        .map(mapJob)
        .filter((j: JobResult | null): j is JobResult => j !== null && matchesQuery(j.title, input.query));
      return { jobs: input.numResults ? jobs.slice(0, input.numResults) : jobs };
    } catch (e: any) {
      return { jobs: [], error: `Arbeitnow fetch failed: ${e?.message ?? "unknown error"}` };
    }
  },
};
