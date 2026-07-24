// Pure, unit-testable HTML/JSON-LD extraction for job-URL ingest. Kept out
// of app/api/fetch-url/route.ts (network I/O only there) so this logic is
// testable without a server — this repo's vitest config only runs
// lib/__tests__/**, not app/api/**.

// Strips HTML tags and collapses whitespace, preserving meaningful line breaks.
export function htmlToText(html: string): string {
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

export type ExtractedJobPosting = {
  text: string;
  title: string;
  company: string;
  location: string;
};

/**
 * Scans every JSON-LD block on a LinkedIn (or any schema.org JobPosting)
 * page for one with a JobPosting shape, and returns its description
 * PLUS the sibling title/company/location fields folded into the text as a
 * header. Bug fix: the description field alone never contains the job
 * title, hiring organization, or location — those are separate JobPosting
 * properties — so returning description alone (the previous behavior)
 * silently starved downstream field extraction (/api/parse-jd) of the very
 * data it needed, even though the JD body text came through fine.
 *
 * Scans ALL ld+json blocks, not just the first — a page can carry several
 * (Organization, BreadcrumbList, JobPosting, ...) in any order.
 */
export function extractJobPostingFromLdJson(html: string): ExtractedJobPosting | null {
  const ldBlocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];

  for (const block of ldBlocks) {
    let ld: any;
    try {
      ld = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const posting = ld?.["@type"] === "JobPosting" ? ld : ld?.jobPosting ?? null;
    const description: string = posting?.description ?? "";
    if (!description.trim()) continue;

    const title: string = posting?.title ?? "";
    const company: string = posting?.hiringOrganization?.name ?? "";
    const address = posting?.jobLocation?.address;
    const location: string = address
      ? [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(", ")
      : "";

    const header = [
      title && `Job Title: ${title}`,
      company && `Company: ${company}`,
      location && `Location: ${location}`,
    ].filter(Boolean).join("\n");

    const text = header ? `${header}\n\n${htmlToText(description)}` : htmlToText(description);
    return { text, title, company, location };
  }

  return null;
}
