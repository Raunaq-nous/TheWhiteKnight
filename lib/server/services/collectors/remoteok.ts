import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// Remote OK public API (keyless). Terms: send a descriptive User-Agent, link
// back to the Remote OK job page and credit Remote OK as the source, so url
// is always their page (apply_url goes in applyUrl) and via is "Remote OK".
// The first array element is a legal/meta notice, not a job; it is skipped.
// One GET per collect(); filtering by query (title or tags) is client-side.
// Docs: https://remoteok.com/api
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
  if (!j || typeof j !== "object" || !j.position || j.id == null || !j.url) return null;
  return {
    title: j.position,
    company: j.company,
    location: j.location || undefined,
    url: j.url,
    source: "remoteok",
    publishedDate: j.date,
    snippet: toSnippet(j.description),
    descriptionHtml: j.description,
    externalId: String(j.id),
    applyUrl: j.apply_url || undefined,
    via: "Remote OK",
    remote: true,
  };
}

export const remoteOkCollector: JobCollector = {
  name: "remoteok",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    try {
      const res = await fetch("https://remoteok.com/api", {
        cache: "no-store",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return { jobs: [], error: `Remote OK HTTP ${res.status}` };
      const data = await res.json();
      if (!Array.isArray(data)) return { jobs: [], error: "Remote OK: unexpected response shape" };
      const jobs: JobResult[] = [];
      for (const raw of data) {
        const job = mapJob(raw);
        if (!job) continue;
        const tags = Array.isArray(raw.tags) ? raw.tags.join(" ") : "";
        if (matchesQuery(`${job.title} ${tags}`, input.query)) jobs.push(job);
      }
      return { jobs: input.numResults ? jobs.slice(0, input.numResults) : jobs };
    } catch (e: any) {
      return { jobs: [], error: `Remote OK fetch failed: ${e?.message ?? "unknown error"}` };
    }
  },
};
