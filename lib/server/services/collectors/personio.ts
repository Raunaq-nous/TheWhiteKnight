import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";
import { xmlAll, xmlTag, xmlTagRaw } from "./teamtailor";

// Public Personio job-feed XML. No key required. Regex-parsed (untrusted
// data, never executed).

export function parsePersonioXml(xml: string, slug: string): Array<Omit<JobResult, "company" | "source">> | null {
  if (typeof xml !== "string" || !/<workzag-jobs[\s>]/i.test(xml)) return null;
  const out: Array<Omit<JobResult, "company" | "source">> = [];
  for (const pos of xmlAll(xml, "position")) {
    const id = xmlTag(pos, "id");
    const title = xmlTag(pos, "name");
    if (!id || !title) continue;
    const url = `https://${slug}.jobs.personio.de/job/${encodeURIComponent(id)}?language=en`;
    const job: Omit<JobResult, "company" | "source"> = { title, url, externalId: id };
    const office = xmlTag(pos, "office");
    if (office) job.location = office;
    const created = xmlTag(pos, "createdAt");
    if (created) job.publishedDate = created;
    const descs = xmlTagRaw(pos, "jobDescriptions");
    if (descs !== undefined) {
      const parts = xmlAll(descs, "jobDescription").map((d) => {
        const n = xmlTag(d, "name");
        const v = xmlTag(d, "value") ?? "";
        return n ? `<h3>${n}</h3>${v}` : v;
      }).filter(Boolean);
      if (parts.length) job.descriptionHtml = parts.join("\n");
    }
    if (office && /remote/i.test(office)) job.remote = true;
    out.push(job);
  }
  return out;
}

async function fetchPersonio(slug: string, company: string): Promise<CollectorResult> {
  try {
    const res = await fetch(`https://${encodeURIComponent(slug)}.jobs.personio.de/xml?language=en`, { cache: "no-store" });
    if (!res.ok) return { jobs: [], error: `Personio HTTP ${res.status ?? "error"}` };
    const parsed = parsePersonioXml(await res.text(), slug);
    if (!parsed) return { jobs: [], error: "Personio: malformed XML" };
    return { jobs: parsed.map((j) => ({ ...j, company, source: "personio" as const })) };
  } catch (e: any) {
    return { jobs: [], error: e?.message ?? "Personio fetch failed" };
  }
}

export const personioCollector: JobCollector = {
  name: "personio",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    if (!input.tenant) return { jobs: [] };
    return fetchPersonio(input.tenant, input.companyName ?? input.tenant);
  },
};
