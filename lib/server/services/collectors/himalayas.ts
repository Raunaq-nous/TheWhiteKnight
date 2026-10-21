import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// Himalayas public jobs API (keyless, max 20 per request). url is the
// Himalayas job page (guid) for attribution; applicationLink is the apply
// link. One GET per collect(); query filter is client-side.
// Docs: https://himalayas.app/api
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
  const url: string | undefined = j?.guid || j?.applicationLink;
  if (!j?.title || !url) return null;
  const restrictions: string[] = Array.isArray(j.locationRestrictions)
    ? j.locationRestrictions
        .map((l: any) => (typeof l === "string" ? l : l?.name))
        .filter((n: unknown): n is string => typeof n === "string" && n.length > 0)
    : [];
  return {
    title: j.title,
    company: j.companyName,
    location: restrictions.length ? restrictions.join("; ") : "Worldwide",
    url,
    source: "himalayas",
    publishedDate: unixToIso(j.pubDate),
    snippet: toSnippet(j.excerpt) ?? toSnippet(j.description),
    descriptionHtml: j.description,
    externalId: j.guid,
    applyUrl: j.applicationLink && j.applicationLink !== url ? j.applicationLink : undefined,
    via: "Himalayas",
    remote: true,
  };
}

export const himalayasCollector: JobCollector = {
  name: "himalayas",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    try {
      const limit = Math.min(20, Math.max(1, input.numResults ?? 20));
      const res = await fetch(`https://himalayas.app/jobs/api?limit=${limit}&offset=0`, {
        cache: "no-store",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return { jobs: [], error: `Himalayas HTTP ${res.status}` };
      const data = await res.json();
      if (!Array.isArray(data?.jobs)) return { jobs: [], error: "Himalayas: unexpected response shape" };
      return {
        jobs: data.jobs
          .map(mapJob)
          .filter((j: JobResult | null): j is JobResult => j !== null && matchesQuery(j.title, input.query)),
      };
    } catch (e: any) {
      return { jobs: [], error: `Himalayas fetch failed: ${e?.message ?? "unknown error"}` };
    }
  },
};
