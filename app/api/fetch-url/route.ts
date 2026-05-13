import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Strips HTML tags and collapses whitespace, preserving meaningful line breaks.
function htmlToText(html: string): string {
  // Remove <script>, <style>, <nav>, <footer>, <header> blocks entirely
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "");

  // Convert block-level tags to newlines
  text = text.replace(/<\/(p|div|li|h[1-6]|br|tr|td)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace while preserving paragraph breaks
  text = text
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(line => line.length > 0)
    .join("\n");

  return text.trim();
}

export async function POST(req: NextRequest) {
  try {
    const { url, exaApiKey } = await req.json() as { url: string; exaApiKey?: string };

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    // Validate URL
    let parsed: URL;
    try {
      parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const isLinkedIn = parsed.hostname.includes("linkedin.com");

    // Try Exa.ai first if API key provided (works well for LinkedIn)
    if (exaApiKey && isLinkedIn) {
      try {
        const exaRes = await fetch("https://api.exa.ai/contents", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": exaApiKey },
          body: JSON.stringify({
            ids: [parsed.href],
            text: true,
          }),
        });
        if (exaRes.ok) {
          const exaData = await exaRes.json();
          const exaText: string = exaData?.results?.[0]?.text ?? "";
          if (exaText.trim()) {
            return NextResponse.json({ text: exaText.trim(), source: "exa" });
          }
        }
      } catch {
        // fall through to direct fetch
      }
    }

    // Direct fetch with a browser-like User-Agent
    // LinkedIn public job pages often work with SSR content in the initial HTML
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
        return NextResponse.json({
          error: isLinkedIn
            ? "LinkedIn requires login to view this page. Please copy the job description text and paste it manually, or configure an Exa.ai API key in Settings."
            : `Page returned ${fetchRes.status}. Try pasting the JD text manually.`,
        }, { status: 422 });
      }
      return NextResponse.json({ error: `Page returned ${fetchRes.status}` }, { status: 422 });
    }

    const html = await fetchRes.text();

    // LinkedIn-specific: look for job description in JSON-LD structured data
    if (isLinkedIn) {
      const ldMatch = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
      if (ldMatch) {
        try {
          const ld = JSON.parse(ldMatch[1]);
          const description: string = ld?.description ?? ld?.jobPosting?.description ?? "";
          if (description.trim()) {
            return NextResponse.json({ text: htmlToText(description), source: "direct" });
          }
        } catch {
          // fall through
        }
      }
    }

    const text = htmlToText(html);

    if (!text || text.length < 100) {
      return NextResponse.json({
        error: isLinkedIn
          ? "Could not extract job details from LinkedIn. Add an Exa.ai API key in Settings for better LinkedIn support, or paste the JD text manually."
          : "Page content too short or empty.",
      }, { status: 422 });
    }

    // Cap at 8000 chars to avoid sending massive pages to AI
    return NextResponse.json({ text: text.slice(0, 8000), source: "direct" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "URL fetch failed" }, { status: 500 });
  }
}
