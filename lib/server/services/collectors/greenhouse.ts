import "server-only";
import type { CollectorInput, CollectorResult, JobCollector } from "./types";

// Public Greenhouse ATS job-board API. No key required.
async function fetchGreenhouse(tenant: string, companyName: string): Promise<CollectorResult> {
  try {
    // content=true is required by Greenhouse's public API for the full job
    // description to be included at all — without it, `content` is always
    // absent. Purely additive: does not change which jobs are returned.
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${tenant}/jobs?content=true`, { cache: "no-store" });
    if (!res.ok) return { jobs: [] };
    const data = await res.json();
    return {
      jobs: (data.jobs ?? []).map((j: any) => ({
        title: j.title,
        company: companyName,
        location: j.location?.name,
        url: j.absolute_url,
        source: "greenhouse" as const,
        publishedDate: j.updated_at,
        descriptionHtml: j.content,
      })),
    };
  } catch (e: any) {
    return { jobs: [], error: e?.message ?? "Greenhouse fetch failed" };
  }
}

export const greenhouseCollector: JobCollector = {
  name: "greenhouse",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    if (!input.tenant) return { jobs: [] };
    return fetchGreenhouse(input.tenant, input.companyName ?? input.tenant);
  },
};
