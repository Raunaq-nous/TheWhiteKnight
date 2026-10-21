import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// Public Rippling ATS job-board API. No key required.
function extractItems(data: any): any[] | null {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of ["items", "results", "jobs", "data"]) if (Array.isArray(data[k])) return data[k];
  }
  return null;
}

function label(v: any): string | undefined {
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object") {
    for (const k of ["label", "name", "value"]) if (typeof v[k] === "string" && v[k]) return v[k];
  }
  return undefined;
}

async function fetchRippling(slug: string, company: string): Promise<CollectorResult> {
  try {
    const res = await fetch(`https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(slug)}/jobs`, { cache: "no-store" });
    if (!res.ok) return { jobs: [], error: `Rippling HTTP ${res.status ?? "error"}` };
    const items = extractItems(await res.json());
    if (!items) return { jobs: [], error: "Rippling: malformed response" };
    const jobs: JobResult[] = [];
    for (const j of items) {
      const title = j?.name ?? j?.title;
      if (typeof title !== "string" || !title) continue;
      const id = j.uuid ?? j.id;
      const url: string | undefined =
        (typeof j.url === "string" && j.url) || (id ? `https://ats.rippling.com/${slug}/jobs/${id}` : undefined);
      if (!url) continue;
      const job: JobResult = { title, company, url, source: "rippling" };
      const loc = label(j.workLocation) ?? (Array.isArray(j.workLocations) ? label(j.workLocations[0]) : undefined);
      if (loc) job.location = loc;
      if (id) job.externalId = String(id);
      if (loc && /remote/i.test(loc)) job.remote = true;
      jobs.push(job);
    }
    return { jobs };
  } catch (e: any) {
    return { jobs: [], error: e?.message ?? "Rippling fetch failed" };
  }
}

export const ripplingCollector: JobCollector = {
  name: "rippling",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    if (!input.tenant) return { jobs: [] };
    return fetchRippling(input.tenant, input.companyName ?? input.tenant);
  },
};
