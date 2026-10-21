import "server-only";
import { htmlToText, extractJobPostingFromLdJson, extractLinkedInMetadataFromText } from "../../jd-fetch";

// Extracted from the former app/api/fetch-url/route.ts body so both the
// manual URL-ingest UI (via the route, now a thin wrapper) and the scheduled
// automation service can fetch a job posting's text directly, with no HTTP
// hop for the latter.

export type FetchJdResult =
  | { ok: true; text: string; source: "exa" | "direct" | "jina"; company?: string; role?: string; location?: string }
  | { ok: false; status: number; error: string };

// Portals whose terms forbid automated access. They are never fetched by
// autopilot or scans (alert emails supply title/company/location instead);
// a single URL the user pastes is still fetched as before.
export const RESTRICTED_JOB_HOSTS = [
  "linkedin.com", "naukri.com", "naukrigulf.com", "iimjobs.com", "indeed.", "glassdoor.", "foundit.", "monsterindia.com",
  "bayt.com", "gulftalent.com", "instahyre.com", "cutshort.io", "wellfound.com", "angel.co", "hirist.",
];

export function isRestrictedJobHost(url: string): boolean {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
    return RESTRICTED_JOB_HOSTS.some(h => host === h || host.endsWith(`.${h}`) || (h.endsWith(".") && host.includes(h)));
  } catch {
    return false;
  }
}

export type FetchJdOptions = {
  exaApiKey?: string;
  // "manual": a URL the user pasted. "automated": autopilot or a scan, which
  // never calls Exa and never touches a restricted portal.
  mode?: "manual" | "automated";
  jinaApiKey?: string;
  fetchImpl?: typeof fetch;
};

const MIN_TEXT = 200;
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

/** Direct fetch: JSON-LD JobPosting first, else the page text (LinkedIn: plus its text-metadata fallback). */
async function fetchDirect(url: string, f: typeof fetch, linkedIn = false): Promise<FetchJdResult> {
  try {
    const res = await f(url, { headers: BROWSER_HEADERS, redirect: "follow" });
    if (!res.ok) return { ok: false, status: 422, error: `Page returned ${res.status}` };
    const html = await res.text();
    const ld = extractJobPostingFromLdJson(html);
    if (ld && ld.text.trim()) {
      // A parsed JSON-LD JobPosting is authoritative; forward its fields.
      return { ok: true, text: ld.text.slice(0, 12000), source: "direct", ...(ld.company || ld.title || ld.location ? { company: ld.company, role: ld.title, location: ld.location } : {}) };
    }
    const text = htmlToText(html);
    if (text.length < 100) return { ok: false, status: 422, error: "Page content too short or empty." };
    const fields = linkedIn ? extractLinkedInMetadataFromText(text) : null;
    return { ok: true, text: text.slice(0, 8000), source: "direct", ...(fields ? { company: fields.company, role: fields.role, location: fields.location } : {}) };
  } catch (e) {
    return { ok: false, status: 422, error: (e as Error).message };
  }
}

/** Jina Reader on a public page: keyless, or JINA_API_KEY for a higher rate limit. */
async function fetchJina(url: string, f: typeof fetch, key?: string): Promise<FetchJdResult> {
  try {
    const res = await f(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "text", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    });
    if (!res.ok) return { ok: false, status: 422, error: `Jina Reader returned ${res.status}` };
    const text = (await res.text()).trim();
    if (text.length < MIN_TEXT) return { ok: false, status: 422, error: "Jina Reader returned too little text." };
    return { ok: true, text: text.slice(0, 12000), source: "jina" };
  } catch (e) {
    return { ok: false, status: 422, error: (e as Error).message };
  }
}

/** Exa contents: last resort, manual fetches only. */
async function fetchExa(url: string, f: typeof fetch, key: string, linkedIn: boolean): Promise<FetchJdResult> {
  try {
    const exaRes = await f("https://api.exa.ai/contents", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({ ids: [url], text: true }),
    });
    if (!exaRes.ok) return { ok: false, status: 422, error: `Exa returned ${exaRes.status}` };
    const exaData = await exaRes.json();
    const exaText: string = exaData?.results?.[0]?.text ?? "";
    if (!exaText.trim()) return { ok: false, status: 422, error: "Exa returned no text." };
    // Exa returns rendered page text (no JSON-LD to read), so LinkedIn
    // metadata comes from the deterministic text fallback.
    const fields = linkedIn ? extractLinkedInMetadataFromText(exaText) : null;
    return { ok: true, text: exaText.trim(), source: "exa", ...(fields ? { company: fields.company, role: fields.role, location: fields.location } : {}) };
  } catch (e) {
    return { ok: false, status: 422, error: (e as Error).message };
  }
}

/**
 * JD FETCH ORDER: direct fetch with JSON-LD, then Jina Reader, then Exa only
 * as a last resort. Autopilot and scans ("automated") never call Exa and
 * never fetch a restricted portal. A restricted URL the user pastes keeps
 * today's path (Exa when keyed, then direct) and is never sent to Jina.
 */
export async function fetchJdText(rawUrl: string, optsOrExaKey?: FetchJdOptions | string): Promise<FetchJdResult> {
  const opts: FetchJdOptions = typeof optsOrExaKey === "string" ? { exaApiKey: optsOrExaKey } : (optsOrExaKey ?? {});
  const mode = opts.mode ?? "manual";
  const f = opts.fetchImpl ?? fetch;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { ok: false, status: 400, error: "Invalid URL" };
  }
  const url = parsed.href;
  const restricted = isRestrictedJobHost(url);
  const linkedIn = parsed.hostname.includes("linkedin.com");

  if (restricted) {
    if (mode === "automated") {
      return { ok: false, status: 451, error: `${parsed.hostname} does not allow automated access; use the job-alert email or paste the JD.` };
    }
    if (opts.exaApiKey) {
      const exa = await fetchExa(url, f, opts.exaApiKey, linkedIn);
      if (exa.ok) return exa;
    }
    const direct = await fetchDirect(url, f, linkedIn);
    if (direct.ok) return direct;
    return {
      ok: false, status: 422,
      error: linkedIn
        ? "LinkedIn requires login to view this page. Copy the job description text and paste it manually, or configure an Exa.ai API key in Settings."
        : `${direct.error} Try pasting the JD text manually.`,
    };
  }

  const direct = await fetchDirect(url, f);
  if (direct.ok) return direct;
  const jina = await fetchJina(url, f, opts.jinaApiKey ?? process.env.JINA_API_KEY);
  if (jina.ok) return jina;
  if (mode === "manual" && opts.exaApiKey) {
    const exa = await fetchExa(url, f, opts.exaApiKey, false);
    if (exa.ok) return exa;
  }
  return { ok: false, status: 422, error: `${direct.error} Jina Reader: ${jina.error} Try pasting the JD text manually.` };
}
