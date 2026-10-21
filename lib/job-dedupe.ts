// CROSS-SOURCE DEDUPE: one record per job, keeping the company-direct apply
// URL. The same posting often arrives from a company's ATS, Google Jobs, a
// remote board and an alert email; they collapse on an exact URL match or on
// normalised company + title (+ city when both know it). Client-safe, pure.

import { isCompanyDirect, type JobSource } from "./job-sources";

export type DedupableJob = {
  title: string;
  company?: string;
  location?: string;
  url: string;
  source: JobSource | string;
  applyUrl?: string;
  descriptionHtml?: string;
  publishedDate?: string;
  alsoSeenOn?: string[];
};

// Hosts that are mass boards or aggregators, never the employer's own form.
const NON_DIRECT_HOSTS = [
  "linkedin.com", "indeed.", "glassdoor.", "ziprecruiter.", "monster.", "naukri.com", "naukrigulf.com", "iimjobs.com",
  "foundit.", "bayt.com", "gulftalent.com", "instahyre.com", "cutshort.io", "wellfound.com", "angel.co", "simplyhired.",
  "jooble.", "talent.com", "adzuna.", "remotive.com", "remoteok.com", "weworkremotely.com", "himalayas.app", "jobicy.com",
  "themuse.com", "arbeitnow.com", "google.com", "serpapi.com", "theirstack.com", "jobspipe.", "careerjet.",
];
const ATS_HOSTS = ["greenhouse.io", "lever.co", "ashbyhq.com", "myworkdayjobs.com", "smartrecruiters.com", "workable.com", "recruitee.com", "personio.", "teamtailor.com", "rippling.com"];

export function hostOf(url: string | undefined): string {
  try { return url ? new URL(url).hostname.toLowerCase() : ""; } catch { return ""; }
}

/** A URL on an ATS or the employer's own site rather than a board or aggregator. */
export function isCompanyDirectUrl(url: string | undefined): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (ATS_HOSTS.some(h => host.includes(h))) return true;
  return !NON_DIRECT_HOSTS.some(h => host.includes(h));
}

const norm = (s: string | undefined) => (s ?? "")
  .toLowerCase()
  .replace(/\b(inc|llc|ltd|limited|pvt|private|gmbh|plc|co|corp|corporation|company|the)\b\.?/g, " ")
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const titleNorm = (s: string) => norm(s)
  .replace(/\b(sr)\b/g, "senior").replace(/\b(jr)\b/g, "junior").replace(/\b(mgr)\b/g, "manager")
  .replace(/\s+/g, " ").trim();

function city(location: string | undefined): string {
  return norm((location ?? "").split(/[,/|(-]/)[0]);
}

/** The key two listings of the same job share. */
export function jobKey(j: Pick<DedupableJob, "company" | "title" | "location">): string {
  return `${norm(j.company)}|${titleNorm(j.title)}`;
}

/** How good a record's link is: company-direct source, then a company-direct apply URL, then anything else. */
function directness(j: DedupableJob): number {
  if (isCompanyDirect(j.source)) return 3;
  if (isCompanyDirectUrl(j.applyUrl)) return 2;
  if (isCompanyDirectUrl(j.url)) return 1;
  return 0;
}

function merge<T extends DedupableJob>(a: T, b: T): T {
  const [best, other] = directness(b) > directness(a) ? [b, a] : [a, b];
  const directApply = [best.applyUrl, other.applyUrl, other.url].find(u => isCompanyDirectUrl(u));
  return {
    ...best,
    url: directness(best) === 3 ? best.url : (directApply ?? best.url),
    applyUrl: best.applyUrl ?? directApply,
    descriptionHtml: (best.descriptionHtml?.length ?? 0) >= (other.descriptionHtml?.length ?? 0) ? best.descriptionHtml : other.descriptionHtml,
    publishedDate: best.publishedDate ?? other.publishedDate,
    location: best.location ?? other.location,
    company: best.company ?? other.company,
    alsoSeenOn: [...new Set([...(best.alsoSeenOn ?? []), ...(other.alsoSeenOn ?? []), other.source].filter(s => s !== best.source))],
  };
}

/** One record per job across sources, keeping the company-direct URL. Order follows first appearance. */
export function dedupeJobs<T extends DedupableJob>(jobs: T[]): T[] {
  const out: T[] = [];
  const byUrl = new Map<string, number>();
  const byKey = new Map<string, number>();
  for (const j of jobs) {
    const urlKey = j.url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    const key = jobKey(j);
    const keyed = norm(j.company) && titleNorm(j.title) ? key : null;
    let idx = byUrl.get(urlKey);
    if (idx === undefined && keyed) {
      const hit = byKey.get(keyed);
      // Same company and title in DIFFERENT cities are different jobs.
      if (hit !== undefined && (!city(out[hit].location) || !city(j.location) || city(out[hit].location) === city(j.location))) idx = hit;
    }
    if (idx === undefined) {
      byUrl.set(urlKey, out.length);
      if (keyed && !byKey.has(keyed)) byKey.set(keyed, out.length);
      out.push(j);
    } else {
      out[idx] = merge(out[idx], j);
      byUrl.set(urlKey, idx);
    }
  }
  return out;
}
