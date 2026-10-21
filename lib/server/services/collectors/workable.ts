import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// Public Workable widget API. No key required. details=true includes the
// job description.
async function fetchWorkable(slug: string, company: string): Promise<CollectorResult> {
  try {
    const res = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`, { cache: "no-store" });
    if (!res.ok) return { jobs: [], error: `Workable HTTP ${res.status ?? "error"}` };
    const data: any = await res.json();
    if (!data || typeof data !== "object" || !Array.isArray(data.jobs)) return { jobs: [], error: "Workable: malformed response" };
    const jobs: JobResult[] = [];
    for (const j of data.jobs) {
      if (!j || typeof j.title !== "string") continue;
      const url: string | undefined =
        (typeof j.url === "string" && j.url) ||
        (j.shortcode ? `https://apply.workable.com/${slug}/j/${j.shortcode}/` : undefined);
      if (!url) continue;
      const loc = [j.city, j.state, j.country].filter((x: unknown) => typeof x === "string" && x).join(", ");
      const job: JobResult = { title: j.title, company, url, source: "workable" };
      if (loc) job.location = loc;
      if (typeof j.application_url === "string" && j.application_url) job.applyUrl = j.application_url;
      if (j.shortcode) job.externalId = String(j.shortcode);
      const published = j.published_on ?? j.created_at;
      if (typeof published === "string" && published) job.publishedDate = published;
      if (typeof j.description === "string" && j.description) job.descriptionHtml = j.description;
      if (typeof j.telecommuting === "boolean") job.remote = j.telecommuting;
      jobs.push(job);
    }
    return { jobs };
  } catch (e: any) {
    return { jobs: [], error: e?.message ?? "Workable fetch failed" };
  }
}

export const workableCollector: JobCollector = {
  name: "workable",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    if (!input.tenant) return { jobs: [] };
    return fetchWorkable(input.tenant, input.companyName ?? input.tenant);
  },
};
