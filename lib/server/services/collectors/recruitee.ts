import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// Public Recruitee careers-site API. No key required.
async function fetchRecruitee(slug: string, company: string): Promise<CollectorResult> {
  try {
    const res = await fetch(`https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`, { cache: "no-store" });
    if (!res.ok) return { jobs: [], error: `Recruitee HTTP ${res.status ?? "error"}` };
    const data: any = await res.json();
    if (!data || typeof data !== "object" || !Array.isArray(data.offers)) return { jobs: [], error: "Recruitee: malformed response" };
    const jobs: JobResult[] = [];
    for (const o of data.offers) {
      if (!o || typeof o.title !== "string") continue;
      const url: string | undefined =
        (typeof o.careers_url === "string" && o.careers_url) ||
        (o.slug ? `https://${slug}.recruitee.com/o/${o.slug}` : undefined);
      if (!url) continue;
      const job: JobResult = { title: o.title, company, url, source: "recruitee" };
      const loc = (typeof o.location === "string" && o.location) || [o.city, o.country].filter((x: unknown) => typeof x === "string" && x).join(", ");
      if (loc) job.location = loc;
      if (typeof o.careers_apply_url === "string" && o.careers_apply_url) job.applyUrl = o.careers_apply_url;
      if (o.id != null) job.externalId = String(o.id);
      const published = o.published_at ?? o.created_at;
      if (typeof published === "string" && published) job.publishedDate = published;
      const desc = [o.description, o.requirements].filter((x: unknown) => typeof x === "string" && x).join("\n");
      if (desc) job.descriptionHtml = desc;
      if (typeof o.remote === "boolean") job.remote = o.remote;
      jobs.push(job);
    }
    return { jobs };
  } catch (e: any) {
    return { jobs: [], error: e?.message ?? "Recruitee fetch failed" };
  }
}

export const recruiteeCollector: JobCollector = {
  name: "recruitee",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    if (!input.tenant) return { jobs: [] };
    return fetchRecruitee(input.tenant, input.companyName ?? input.tenant);
  },
};
