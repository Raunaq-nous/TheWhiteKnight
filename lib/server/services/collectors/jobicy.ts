import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// Jobicy remote-jobs API (keyless). Server-side filtering via `tag`; url is
// the Jobicy job page (their terms require attribution). One GET per call.
// Docs: https://jobicy.com/jobs-rss-feed
const USER_AGENT = "CareerOS/1.0 (personal job search tool)";

function toSnippet(html: unknown): string | undefined {
  if (typeof html !== "string" || !html) return undefined;
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || undefined;
}

function mapJob(j: any): JobResult | null {
  if (!j?.jobTitle || !j?.url) return null;
  return {
    title: j.jobTitle,
    company: j.companyName,
    location: j.jobGeo || undefined,
    url: j.url,
    source: "jobicy",
    publishedDate: j.pubDate,
    snippet: toSnippet(j.jobExcerpt) ?? toSnippet(j.jobDescription),
    descriptionHtml: j.jobDescription,
    externalId: j.id != null ? String(j.id) : undefined,
    via: "Jobicy",
    remote: true,
  };
}

export const jobicyCollector: JobCollector = {
  name: "jobicy",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    try {
      const params = new URLSearchParams({ count: String(Math.min(50, Math.max(1, input.numResults ?? 50))) });
      if (input.query?.trim()) params.set("tag", input.query.trim());
      const res = await fetch(`https://jobicy.com/api/v2/remote-jobs?${params.toString()}`, {
        cache: "no-store",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return { jobs: [], error: `Jobicy HTTP ${res.status}` };
      const data = await res.json();
      if (!Array.isArray(data?.jobs)) return { jobs: [], error: "Jobicy: unexpected response shape" };
      return { jobs: data.jobs.map(mapJob).filter((j: JobResult | null): j is JobResult => j !== null) };
    } catch (e: any) {
      return { jobs: [], error: `Jobicy fetch failed: ${e?.message ?? "unknown error"}` };
    }
  },
};
