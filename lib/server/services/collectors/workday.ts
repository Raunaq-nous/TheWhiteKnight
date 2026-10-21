import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// Public Workday "cxs" job-search API used by every *.myworkdayjobs.com
// careers site. No key required. 20 postings per page; we paginate by
// offset until the board's reported total (capped by maxPages).

export type WorkdayBoard = { tenant: string; wd: string; site: string; host: string };

const PAGE_SIZE = 20;
const DEFAULT_MAX_PAGES = 50;
const LOCALE_RE = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;

// Parses "tenant/wd5/site" or a careers URL like
// https://acme.wd5.myworkdayjobs.com/en-US/External.
export function parseWorkdayBoard(input: { tenant?: string; careersUrl?: string }): WorkdayBoard | null {
  const fromUrl = (raw: string): WorkdayBoard | null => {
    try {
      const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      const m = u.hostname.toLowerCase().match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
      if (!m) return null;
      const segs = u.pathname.split("/").filter(Boolean);
      let i = 0;
      if (segs[i] === "wday" && segs[i + 1] === "cxs") i += 3; // /wday/cxs/{tenant}/{site}
      else if (segs[i] && LOCALE_RE.test(segs[i])) i += 1;
      const site = segs[i];
      if (!site) return null;
      return { tenant: m[1], wd: m[2], site, host: u.hostname.toLowerCase() };
    } catch {
      return null;
    }
  };
  if (input.careersUrl) {
    const b = fromUrl(input.careersUrl);
    if (b) return b;
  }
  if (input.tenant) {
    const parts = input.tenant.split("/").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 3 && /^wd\d+$/i.test(parts[1])) {
      const [tenant, wd, site] = parts;
      return { tenant: tenant.toLowerCase(), wd: wd.toLowerCase(), site, host: `${tenant.toLowerCase()}.${wd.toLowerCase()}.myworkdayjobs.com` };
    }
    const b = fromUrl(input.tenant);
    if (b) return b;
  }
  return null;
}

// Polite inter-page delay; zero under test. Overridable for callers/tests.
export const workdayOptions = { pageDelayMs: process.env.NODE_ENV === "test" ? 0 : 400 };

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

function mapPosting(p: any, board: WorkdayBoard, company: string): JobResult | null {
  if (!p || typeof p.title !== "string" || typeof p.externalPath !== "string") return null;
  const path = p.externalPath.startsWith("/") ? p.externalPath : `/${p.externalPath}`;
  const url = `https://${board.host}/${board.site}${path}`;
  const bullet = Array.isArray(p.bulletFields) ? p.bulletFields[0] : undefined;
  const job: JobResult = {
    title: p.title,
    company,
    url,
    source: "workday",
    externalId: typeof bullet === "string" && bullet ? bullet : p.externalPath,
    applyUrl: `${url}/apply`,
  };
  if (typeof p.locationsText === "string" && p.locationsText) job.location = p.locationsText;
  if (typeof p.postedOn === "string" && p.postedOn) job.publishedDate = p.postedOn;
  if (job.location && /remote/i.test(job.location)) job.remote = true;
  return job;
}

async function fetchWorkday(board: WorkdayBoard, input: CollectorInput, company: string): Promise<CollectorResult> {
  const endpoint = `https://${board.host}/wday/cxs/${board.tenant}/${board.site}/jobs`;
  const maxPages = Math.max(1, input.maxPages ?? DEFAULT_MAX_PAGES);
  const jobs: JobResult[] = [];
  const seen = new Set<string>();
  let total = 0;
  let offset = 0;
  try {
    for (let page = 0; page < maxPages; page++) {
      if (page > 0) await sleep(workdayOptions.pageDelayMs);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset, searchText: input.query ?? "" }),
        cache: "no-store",
      });
      if (!res.ok) {
        const error = `Workday HTTP ${res.status ?? "error"}`;
        return page === 0 ? { jobs: [], error } : { jobs, error };
      }
      const data: any = await res.json();
      if (!data || typeof data !== "object" || !Array.isArray(data.jobPostings)) {
        const error = "Workday: malformed response";
        return page === 0 ? { jobs: [], error } : { jobs, error };
      }
      // Some tenants only report total on offset 0: keep the first non-zero.
      if (!total && typeof data.total === "number" && data.total > 0) total = data.total;
      for (const p of data.jobPostings) {
        const j = mapPosting(p, board, company);
        if (j && !seen.has(j.url)) { seen.add(j.url); jobs.push(j); }
      }
      offset += PAGE_SIZE;
      if (data.jobPostings.length === 0 || offset >= total) break;
    }
    return { jobs };
  } catch (e: any) {
    return { jobs: jobs.length ? jobs : [], error: e?.message ?? "Workday fetch failed" };
  }
}

export const workdayCollector: JobCollector = {
  name: "workday",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    try {
      if (!input.tenant && !input.careersUrl) return { jobs: [] };
      const board = parseWorkdayBoard(input);
      if (!board) {
        if (!input.tenant) return { jobs: [] };
        return { jobs: [], error: "Workday: could not derive tenant/wdN/site from tenant or careersUrl" };
      }
      return await fetchWorkday(board, input, input.companyName ?? board.tenant);
    } catch (e: any) {
      return { jobs: [], error: e?.message ?? "Workday collector failed" };
    }
  },
};
