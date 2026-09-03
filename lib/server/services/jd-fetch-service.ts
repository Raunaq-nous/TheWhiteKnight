import "server-only";
import { htmlToText, extractJobPostingFromLdJson, extractLinkedInMetadataFromText } from "../../jd-fetch";

// Extracted from the former app/api/fetch-url/route.ts body so both the
// manual URL-ingest UI (via the route, now a thin wrapper) and the scheduled
// automation service can fetch a job posting's text directly, with no HTTP
// hop for the latter.

export type FetchJdResult =
  | { ok: true; text: string; source: "exa" | "direct"; company?: string; role?: string; location?: string }
  | { ok: false; status: number; error: string };

export async function fetchJdText(rawUrl: string, exaApiKey?: string): Promise<FetchJdResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { ok: false, status: 400, error: "Invalid URL" };
  }

  const isLinkedIn = parsed.hostname.includes("linkedin.com");

  if (exaApiKey && isLinkedIn) {
    try {
      const exaRes = await fetch("https://api.exa.ai/contents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": exaApiKey },
        body: JSON.stringify({ ids: [parsed.href], text: true }),
      });
      if (exaRes.ok) {
        const exaData = await exaRes.json();
        const exaText: string = exaData?.results?.[0]?.text ?? "";
        if (exaText.trim()) {
          // Exa's "text: true" mode returns already-rendered PAGE TEXT, not
          // raw HTML — extractJobPostingFromLdJson never runs on this path
          // (there's no HTML to scan a <script type="application/ld+json">
          // block out of), so structured company/role/location would
          // otherwise be lost entirely for every Exa-fetched LinkedIn page.
          // This is the deterministic text-metadata fallback for exactly
          // that case.
          const fields = isLinkedIn ? extractLinkedInMetadataFromText(exaText) : null;
          return {
            ok: true, text: exaText.trim(), source: "exa",
            ...(fields ? { company: fields.company, role: fields.role, location: fields.location } : {}),
          };
        }
      }
    } catch {
      // fall through to direct fetch
    }
  }

  const fetchRes = await fetch(parsed.href, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    redirect: "follow",
  });

  if (!fetchRes.ok) {
    if (fetchRes.status === 401 || fetchRes.status === 403) {
      return {
        ok: false, status: 422,
        error: isLinkedIn
          ? "LinkedIn requires login to view this page. Please copy the job description text and paste it manually, or configure an Exa.ai API key in Settings."
          : `Page returned ${fetchRes.status}. Try pasting the JD text manually.`,
      };
    }
    return { ok: false, status: 422, error: `Page returned ${fetchRes.status}` };
  }

  const html = await fetchRes.text();

  if (isLinkedIn) {
    const extracted = extractJobPostingFromLdJson(html);
    if (extracted) {
      // The JSON-LD block WAS present and parsed correctly — forward its
      // title/company/location instead of discarding them (the pre-existing
      // bug: this path already had structured fields and threw them away).
      return {
        ok: true, text: extracted.text, source: "direct",
        ...(extracted.company || extracted.title || extracted.location
          ? { company: extracted.company, role: extracted.title, location: extracted.location }
          : {}),
      };
    }
  }

  const text = htmlToText(html);

  if (!text || text.length < 100) {
    return {
      ok: false, status: 422,
      error: isLinkedIn
        ? "Could not extract job details from LinkedIn. Add an Exa.ai API key in Settings for better LinkedIn support, or paste the JD text manually."
        : "Page content too short or empty.",
    };
  }

  // JSON-LD was either absent or (rare) present without a description —
  // try the same deterministic text-metadata fallback used on the Exa path.
  const fallbackFields = isLinkedIn ? extractLinkedInMetadataFromText(text) : null;

  return {
    ok: true, text: text.slice(0, 8000), source: "direct",
    ...(fallbackFields ? { company: fallbackFields.company, role: fallbackFields.role, location: fallbackFields.location } : {}),
  };
}
