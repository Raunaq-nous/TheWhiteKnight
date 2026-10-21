import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// The Muse public jobs API (keyless; an api_key only raises the rate
// limit). No free-text search parameter, so we fetch one page (newest
// first) and filter by query client-side. Not remote-only: remote is set
// when a listed location is "Flexible / Remote" or similar.
// Docs: https://www.themuse.com/developers/api/v2
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

function mapJob(j: any): JobResult | null {
  const url: string | undefined = j?.refs?.landing_page;
  if (!j?.name || !url) return null;
  const locations: string[] = Array.isArray(j.locations)
    ? j.locations.map((l: any) => l?.name).filter((n: unknown): n is string => typeof n === "string")
    : [];
  return {
    title: j.name,
    company: j.company?.name,
    location: locations.join("; ") || undefined,
    url,
    source: "themuse",
    publishedDate: j.publication_date,
    snippet: toSnippet(j.contents),
    descriptionHtml: j.contents,
    externalId: j.id != null ? String(j.id) : undefined,
    via: "The Muse",
    remote: locations.some(l => /remote|flexible/i.test(l)),
  };
}

export const theMuseCollector: JobCollector = {
  name: "themuse",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    try {
      const params = new URLSearchParams({ page: "0", descending: "true" });
      if (input.location) params.set("location", input.location);
      const res = await fetch(`https://www.themuse.com/api/public/jobs?${params.toString()}`, {
        cache: "no-store",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return { jobs: [], error: `The Muse HTTP ${res.status}` };
      const data = await res.json();
      if (!Array.isArray(data?.results)) return { jobs: [], error: "The Muse: unexpected response shape" };
      const jobs = data.results
        .map(mapJob)
        .filter((j: JobResult | null): j is JobResult => j !== null && matchesQuery(j.title, input.query));
      return { jobs: input.numResults ? jobs.slice(0, input.numResults) : jobs };
    } catch (e: any) {
      return { jobs: [], error: `The Muse fetch failed: ${e?.message ?? "unknown error"}` };
    }
  },
};
