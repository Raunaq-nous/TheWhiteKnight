import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// Remotive public API (keyless). Their terms ask for low request volume and
// a link back to the Remotive job page, so url is always their page and we
// make one GET per collect(). Docs: https://remotive.com/api-documentation
const USER_AGENT = "CareerOS/1.0 (personal job search tool)";

function toSnippet(html: unknown): string | undefined {
  if (typeof html !== "string" || !html) return undefined;
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || undefined;
}

function mapJob(j: any): JobResult | null {
  if (!j?.title || !j?.url) return null;
  return {
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || undefined,
    url: j.url,
    source: "remotive",
    publishedDate: j.publication_date,
    snippet: toSnippet(j.description),
    descriptionHtml: j.description,
    externalId: j.id != null ? String(j.id) : undefined,
    via: "Remotive",
    remote: true,
  };
}

export const remotiveCollector: JobCollector = {
  name: "remotive",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    try {
      const params = new URLSearchParams();
      if (input.query?.trim()) params.set("search", input.query.trim());
      if (input.numResults) params.set("limit", String(input.numResults));
      const qs = params.toString();
      const res = await fetch(`https://remotive.com/api/remote-jobs${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return { jobs: [], error: `Remotive HTTP ${res.status}` };
      const data = await res.json();
      if (!Array.isArray(data?.jobs)) return { jobs: [], error: "Remotive: unexpected response shape" };
      return { jobs: data.jobs.map(mapJob).filter((j: JobResult | null): j is JobResult => j !== null) };
    } catch (e: any) {
      return { jobs: [], error: `Remotive fetch failed: ${e?.message ?? "unknown error"}` };
    }
  },
};
