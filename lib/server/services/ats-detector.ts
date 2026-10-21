import "server-only";
import type { ATSPlatform, CompanyTarget } from "../../company-targets";
import { parseWorkdayBoard } from "./collectors/workday";

// Detects which public ATS a company uses, from a URL or from the HTML of
// its careers page. All fetched HTML is untrusted data: it is only ever
// regex-scanned for known ATS hostnames, never executed or interpreted as
// instructions. Public pages only; no login flows.

export type AtsDetection = { ats: ATSPlatform; tenant: string; careersUrl: string };
export type AtsDetectionResult = AtsDetection & { companyName?: string };

const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "api", "cdn", "assets", "static", "help", "support", "blog", "docs", "status", "career", "careers", "jobs", "mail", "go", "info",
]);

function toUrl(raw: string): URL | null {
  try {
    const s = raw.trim();
    if (!s) return null;
    const u = new URL(/^https?:\/\//i.test(s) ? s : s.startsWith("//") ? `https:${s}` : `https://${s}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const cleanSlug = (s: string | undefined | null): string | null => {
  if (!s) return null;
  let d = s;
  try { d = decodeURIComponent(s); } catch { /* keep raw */ }
  return SLUG_RE.test(d) ? d : null;
};
const LOCALE_RE = /^[a-z]{2}([-_][A-Za-z]{2,4})?$/;

function subdomainSlug(host: string, suffix: string): string | null {
  if (!host.endsWith(suffix)) return null;
  const sub = host.slice(0, -suffix.length);
  if (!sub || sub.includes(".") || RESERVED_SUBDOMAINS.has(sub)) return null;
  return cleanSlug(sub);
}

export function detectAtsFromUrl(url: string): AtsDetection | null {
  const u = toUrl(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const segs = u.pathname.split("/").filter(Boolean);

  // Greenhouse
  if (/^(boards|job-boards)(\.eu)?\.greenhouse\.io$/.test(host)) {
    const slug = segs[0] === "embed" ? cleanSlug(u.searchParams.get("for")) : cleanSlug(segs[0]);
    return slug ? { ats: "greenhouse", tenant: slug, careersUrl: `https://job-boards.greenhouse.io/${slug}` } : null;
  }
  if (host === "boards-api.greenhouse.io" || host === "api.greenhouse.io") {
    const i = segs.indexOf("boards");
    const slug = cleanSlug(i >= 0 ? segs[i + 1] : undefined);
    return slug ? { ats: "greenhouse", tenant: slug, careersUrl: `https://job-boards.greenhouse.io/${slug}` } : null;
  }
  // Lever
  if (/^jobs(\.eu)?\.lever\.co$/.test(host)) {
    const slug = cleanSlug(segs[0]);
    return slug ? { ats: "lever", tenant: slug, careersUrl: `https://jobs.lever.co/${slug}` } : null;
  }
  if (/^api(\.eu)?\.lever\.co$/.test(host) && segs[0] === "v0" && segs[1] === "postings") {
    const slug = cleanSlug(segs[2]);
    return slug ? { ats: "lever", tenant: slug, careersUrl: `https://jobs.lever.co/${slug}` } : null;
  }
  // Ashby
  if (host === "jobs.ashbyhq.com") {
    const slug = cleanSlug(segs[0]);
    return slug ? { ats: "ashby", tenant: slug, careersUrl: `https://jobs.ashbyhq.com/${slug}` } : null;
  }
  if (host === "api.ashbyhq.com" && segs[0] === "posting-api" && segs[1] === "job-board") {
    const slug = cleanSlug(segs[2]);
    return slug ? { ats: "ashby", tenant: slug, careersUrl: `https://jobs.ashbyhq.com/${slug}` } : null;
  }
  // SmartRecruiters
  if (host === "careers.smartrecruiters.com" || host === "jobs.smartrecruiters.com") {
    const slug = cleanSlug(segs[0]);
    return slug ? { ats: "smartrecruiters", tenant: slug, careersUrl: `https://careers.smartrecruiters.com/${slug}` } : null;
  }
  if (host === "api.smartrecruiters.com" && segs[0] === "v1" && segs[1] === "companies") {
    const slug = cleanSlug(segs[2]);
    return slug ? { ats: "smartrecruiters", tenant: slug, careersUrl: `https://careers.smartrecruiters.com/${slug}` } : null;
  }
  // Workday
  if (host.endsWith(".myworkdayjobs.com")) {
    const b = parseWorkdayBoard({ careersUrl: u.toString() });
    return b ? { ats: "workday", tenant: `${b.tenant}/${b.wd}/${b.site}`, careersUrl: `https://${b.host}/${b.site}` } : null;
  }
  // Workable
  if (host === "apply.workable.com") {
    const slug = cleanSlug(segs[0]);
    if (!slug || ["api", "j", "static", "assets"].includes(slug)) return null;
    return { ats: "workable", tenant: slug, careersUrl: `https://apply.workable.com/${slug}/` };
  }
  // Recruitee
  {
    const slug = subdomainSlug(host, ".recruitee.com");
    if (slug) return { ats: "recruitee", tenant: slug, careersUrl: `https://${slug}.recruitee.com` };
  }
  // Personio
  for (const tld of ["de", "com"]) {
    const slug = subdomainSlug(host, `.jobs.personio.${tld}`);
    if (slug) return { ats: "personio", tenant: slug, careersUrl: `https://${slug}.jobs.personio.${tld}` };
  }
  // Teamtailor
  {
    const slug = subdomainSlug(host, ".teamtailor.com");
    if (slug) return { ats: "teamtailor", tenant: slug, careersUrl: `https://${slug}.teamtailor.com/jobs` };
  }
  // Rippling
  if (host === "ats.rippling.com") {
    const rest = segs[0] && LOCALE_RE.test(segs[0]) && segs[1] ? segs.slice(1) : segs;
    const slug = cleanSlug(rest[0]);
    return slug ? { ats: "rippling", tenant: slug, careersUrl: `https://ats.rippling.com/${slug}/jobs` } : null;
  }
  return null;
}

const ATS_URL_RE =
  /(?:https?:)?\/\/[a-z0-9.-]*(?:greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|myworkdayjobs\.com|workable\.com|recruitee\.com|personio\.(?:de|com)|teamtailor\.com|rippling\.com)(?:[/?#][^\s"'<>\\)`]*)?/gi;

export function detectAtsFromHtml(html: string, baseUrl?: string): AtsDetection | null {
  try {
    if (typeof html !== "string" || !html) return null;
    // Unescape JSON-escaped slashes and &amp; so embedded config URLs match.
    const text = html.slice(0, 3_000_000).replace(/\\\//g, "/").replace(/&amp;/gi, "&").replace(/&#x2F;|&#47;/gi, "/");
    ATS_URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ATS_URL_RE.exec(text))) {
      const d = detectAtsFromUrl(m[0]);
      if (d) return d;
    }
    if (baseUrl) return detectAtsFromUrl(baseUrl);
    return null;
  } catch {
    return null;
  }
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ""; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ""; } })
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

const GENERIC_TITLE = /^(careers?|jobs?|home|homepage|join us|work with us|open (positions|roles)|current openings|we'?re hiring)$/i;

export function extractCompanyName(html: string): string | undefined {
  if (typeof html !== "string") return undefined;
  const og =
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
  const raw = og?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!raw) return undefined;
  const decoded = decodeBasicEntities(raw).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const parts = decoded.split(/\s+[|\-–—·:]\s+/).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    // A generic heading ("Work With Us") is skipped whole, before any prefix
    // stripping could reduce it to a bare pronoun ("Us").
    if (GENERIC_TITLE.test(p)) continue;
    const stripped = p.replace(/^(careers?|jobs?|work|working)\s+(at|with)\s+/i, "").replace(/\s+(careers?|jobs?)$/i, "").trim();
    if (stripped && !GENERIC_TITLE.test(stripped) && !/^(us|me|you|them)$/i.test(stripped)) return stripped.slice(0, 80);
  }
  return undefined;
}

function isPublicHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith("[")) return false; // no IP literals
  return true;
}

export type DetectOptions = { timeoutMs?: number; maxFetches?: number };

async function fetchPage(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<{ finalUrl: string; ok: boolean; html: string } | null> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => { ctrl.abort(); rej(new Error("timeout")); }, timeoutMs);
    });
    const res = await Promise.race([
      fetchImpl(url, {
        redirect: "follow",
        signal: ctrl.signal,
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "CareerOS-ATS-Detector/1.0" },
        cache: "no-store",
      } as RequestInit),
      timeout,
    ]);
    const finalUrl = (res as Response).url || url;
    let html = "";
    if ((res as Response).ok) {
      html = await Promise.race([(res as Response).text(), timeout]);
    }
    return { finalUrl, ok: !!(res as Response).ok, html: typeof html === "string" ? html : "" };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function detectAtsDetailed(
  input: string,
  fetchImpl: typeof fetch = fetch,
  opts: DetectOptions = {},
): Promise<{ result: AtsDetectionResult | null; reason?: string }> {
  try {
    if (typeof input !== "string" || !input.trim()) return { result: null, reason: "empty input" };
    const direct = detectAtsFromUrl(input);
    if (direct) return { result: direct };

    const u = toUrl(input);
    if (!u) return { result: null, reason: "invalid domain or URL" };
    if (!isPublicHost(u.hostname)) return { result: null, reason: "not a public hostname" };

    const origin = `https://${u.hostname}`;
    const hasPath = u.pathname !== "/" && u.pathname !== "";
    const candidates = [...new Set([hasPath ? u.toString() : origin, origin, `${origin}/careers`, `${origin}/jobs`])]
      .slice(0, Math.max(1, Math.min(opts.maxFetches ?? 3, 3)));
    const timeoutMs = opts.timeoutMs ?? 10_000;

    let companyName: string | undefined;
    const failures: string[] = [];
    for (const url of candidates) {
      const page = await fetchPage(url, fetchImpl, timeoutMs);
      if (!page) { failures.push(`${url}: fetch failed`); continue; }
      const viaRedirect = detectAtsFromUrl(page.finalUrl);
      if (!companyName && page.html) companyName = extractCompanyName(page.html);
      if (viaRedirect) return { result: { ...viaRedirect, ...(companyName ? { companyName } : {}) } };
      if (!page.ok) { failures.push(`${url}: HTTP error`); continue; }
      const d = detectAtsFromHtml(page.html);
      if (d) return { result: { ...d, ...(companyName ? { companyName } : {}) } };
      failures.push(`${url}: no ATS found`);
    }
    return { result: null, reason: failures.join("; ") || "no ATS found" };
  } catch (e: any) {
    return { result: null, reason: e?.message ?? "detection failed" };
  }
}

export async function detectAts(input: string, fetchImpl: typeof fetch = fetch, opts: DetectOptions = {}): Promise<AtsDetectionResult | null> {
  try {
    return (await detectAtsDetailed(input, fetchImpl, opts)).result;
  } catch {
    return null;
  }
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function targetFromDetection(detection: AtsDetectionResult, name?: string): CompanyTarget {
  const displayName = (name ?? detection.companyName ?? detection.tenant.split("/")[0]).trim() || detection.tenant;
  return {
    id: slugify(displayName) || slugify(detection.tenant) || "company",
    name: displayName,
    region: ["global"],
    // ASSUMPTION: "industry" is the neutral catch-all Sector for auto-detected companies.
    sector: "industry",
    ats: detection.ats,
    atsTenant: detection.tenant,
    careersUrl: detection.careersUrl,
    enabled: true,
  };
}
