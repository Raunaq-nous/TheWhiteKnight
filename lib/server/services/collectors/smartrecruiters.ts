import "server-only";
import type { CollectorInput, CollectorResult, JobCollector } from "./types";

// Public SmartRecruiters "Posting API". No key required.
// GET https://api.smartrecruiters.com/v1/companies/{companyIdentifier}/postings
//
// ASSUMPTION: the live API/docs were unreachable from this sandbox (egress
// blocked to api.smartrecruiters.com and developers.smartrecruiters.com), so
// this schema is a best-effort reconstruction from SmartRecruiters' publicly
// documented posting fields rather than a fetched response. The response is
// a paginated envelope: { totalFound, offset, limit, content: Posting[] }.
// Each Posting carries: id (slug-ish external id), name (job title),
// uuid, refNumber, company: { identifier, name }, releaseDate (ISO date),
// location: { city, region, country, remote }, department/function/
// typeOfEmployment/experienceLevel (each { id, label }), and
// actions: [{ id: "apply", type: "link", uri }] for the public apply link.
// If SmartRecruiters has since changed field names, this collector still
// fails cleanly (empty array) rather than throwing.
async function fetchSmartRecruiters(companyIdentifier: string, companyName: string): Promise<CollectorResult> {
  try {
    const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${companyIdentifier}/postings`, { cache: "no-store" });
    if (!res.ok) return { jobs: [] };
    const data = await res.json();
    const content: any[] = data.content ?? [];
    return {
      jobs: content.map((j: any) => ({
        title: j.name,
        company: j.company?.name ?? companyName,
        location: j.location
          ? [j.location.city, j.location.region, j.location.country].filter(Boolean).join(", ")
          : undefined,
        url: j.actions?.find((a: any) => a.id === "apply")?.uri
          ?? `https://jobs.smartrecruiters.com/${companyIdentifier}/${j.id}`,
        source: "smartrecruiters" as const,
        publishedDate: j.releaseDate,
      })),
    };
  } catch (e: any) {
    return { jobs: [], error: e?.message ?? "SmartRecruiters fetch failed" };
  }
}

export const smartRecruitersCollector: JobCollector = {
  name: "smartrecruiters",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    if (!input.tenant) return { jobs: [] };
    return fetchSmartRecruiters(input.tenant, input.companyName ?? input.tenant);
  },
};
