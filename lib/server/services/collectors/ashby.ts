import "server-only";
import type { CollectorInput, CollectorResult, JobCollector } from "./types";

// Public Ashby job-board API. No key required.
async function fetchAshby(tenant: string, companyName: string): Promise<CollectorResult> {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${tenant}`, { cache: "no-store" });
    if (!res.ok) return { jobs: [] };
    const data = await res.json();
    return {
      jobs: (data.jobs ?? []).map((j: any) => ({
        title: j.title,
        company: companyName,
        location: j.locationName,
        url: j.jobUrl ?? `https://jobs.ashbyhq.com/${tenant}/${j.id}`,
        source: "ashby" as const,
        publishedDate: j.publishedAt,
        descriptionHtml: j.descriptionHtml ?? j.description,
      })),
    };
  } catch (e: any) {
    return { jobs: [], error: e?.message ?? "Ashby fetch failed" };
  }
}

export const ashbyCollector: JobCollector = {
  name: "ashby",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    if (!input.tenant) return { jobs: [] };
    return fetchAshby(input.tenant, input.companyName ?? input.tenant);
  },
};
