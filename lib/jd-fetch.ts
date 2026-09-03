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

export type ExtractedLinkedInFields = {
  company: string;
  role: string;
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

// LinkedIn's canonical page-title pattern: "<Company> hiring <Role> in
// <Location> | LinkedIn". The company group is lazy (first " hiring " wins —
// a company name containing the word "hiring" is essentially never going to
// happen, but a company name containing " in " genuinely does, e.g.
// "Accenture in India", which is exactly the real reported case). The role
// group is GREEDY, which is what makes it find the LAST " in " in the
// remaining text rather than the first — matching "...Manager in Pune..."
// correctly even though the role/location half has only one " in " to begin
// with; greedy is simply the correct general behavior since a role title
// containing " in " is far less likely than a location's country/region
// names never containing it. Deliberately does NOT split on hyphens/dashes
// anywhere — the real reported role ("S&C GN - TS&T –Enterprise AI
// Value Strategy - Manager") contains both a plain hyphen and an en-dash
// (with no surrounding space) INSIDE the role text itself, and this pattern
// only anchors on the literal words "hiring"/"in"/"LinkedIn", so neither
// character can ever be mistaken for a field delimiter.
const LINKEDIN_TITLE_LINE_PATTERN = /^(.+?)\s+hiring\s+(.+)\s+in\s+(.+?)\s*\|\s*LinkedIn\s*$/;

const LINKEDIN_NOISE_LINE_PATTERN = /^\d+\s*(day|hour|week|month|year)s?\s+ago$/i;
const LINKEDIN_APPLICANTS_LINE_PATTERN = /applicants?$/i;

/** Parses the canonical "<Company> hiring <Role> in <Location> | LinkedIn" line — checks the first several non-empty lines, since it's usually but not always the very first line of the fetched text. */
function parseLinkedInTitleLine(text: string): ExtractedLinkedInFields | null {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 5);
  for (const line of lines) {
    const match = line.match(LINKEDIN_TITLE_LINE_PATTERN);
    if (!match) continue;
    const company = match[1].trim();
    const role = match[2].trim();
    const location = match[3].trim();
    if (company && role && location) return { company, role, location };
  }
  return null;
}

/**
 * Fallback for text that lacks the title-line pattern but has a Markdown
 * heading structure: a "# <Role>" heading, followed within the next few
 * lines by either a single "Company · Location" / "Company, Location" line,
 * or two separate lines (company, then location). Lower-confidence than
 * parseLinkedInTitleLine — this is a best-effort heuristic over a page
 * layout LinkedIn/Exa can render several ways, not a fixed schema, so it
 * skips obvious noise lines (relative timestamps, applicant counts) while
 * scanning and returns null rather than guessing when nothing plausible
 * turns up in the first few lines after the heading.
 */
function parseLinkedInHeadingBlock(text: string): ExtractedLinkedInFields | null {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const headingIdx = lines.findIndex(l => /^#+\s+\S/.test(l));
  if (headingIdx === -1) return null;
  const role = lines[headingIdx].replace(/^#+\s+/, "").trim();
  if (!role) return null;

  for (let i = headingIdx + 1; i < Math.min(lines.length, headingIdx + 5); i++) {
    const line = lines[i];
    if (LINKEDIN_NOISE_LINE_PATTERN.test(line) || LINKEDIN_APPLICANTS_LINE_PATTERN.test(line)) continue;

    const combined = line.match(/^(.+?)\s*[·|]\s*(.+)$/);
    if (combined) {
      const company = combined[1].trim();
      const location = combined[2].trim();
      if (company && location) return { company, role, location };
      continue;
    }

    const next = lines[i + 1];
    if (next && /,/.test(next) && !LINKEDIN_NOISE_LINE_PATTERN.test(next) && !LINKEDIN_APPLICANTS_LINE_PATTERN.test(next)) {
      return { company: line, role, location: next };
    }
  }
  return null;
}

/**
 * Deterministic text-metadata fallback for when JSON-LD is unavailable —
 * used both when a LinkedIn page is fetched via Exa (whose "text: true"
 * mode returns already-rendered page text, never raw HTML, so
 * extractJobPostingFromLdJson never gets HTML to scan) and when a direct
 * HTML fetch genuinely has no JobPosting ld+json block. The title-line
 * pattern is tried first (high-confidence, exact-format match); the heading
 * fallback only runs if that fails.
 */
export function extractLinkedInMetadataFromText(text: string): ExtractedLinkedInFields | null {
  return parseLinkedInTitleLine(text) ?? parseLinkedInHeadingBlock(text);
}
