import "server-only";
import type { CollectorInput, CollectorResult, JobCollector } from "./types";

// Public Lever job-board API. No key required.
async function fetchLever(tenant: string, companyName: string): Promise<CollectorResult> {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${tenant}?mode=json`, { cache: "no-store" });
    if (!res.ok) return { jobs: [] };
    const data = await res.json();
    return {
      jobs: (data ?? []).map((j: any) => ({
        title: j.text,
        company: companyName,
        location: j.categories?.location,
        url: j.hostedUrl,
        source: "lever" as const,
        publishedDate: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
        descriptionHtml: j.descriptionPlain ?? j.description,
      })),
    };
  } catch (e: any) {
    return { jobs: [], error: e?.message ?? "Lever fetch failed" };
  }
}

export const leverCollector: JobCollector = {
  name: "lever",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    if (!input.tenant) return { jobs: [] };
    return fetchLever(input.tenant, input.companyName ?? input.tenant);
  },
};
