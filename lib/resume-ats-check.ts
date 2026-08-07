// Deterministic ATS-readability check for a generated resume — "if our own
// parser can't cleanly re-segment this text back into sections, a real ATS
// won't either."
//
// There's no headless-rendering pipeline in this codebase to literally
// screenshot the printed PDF and run it back through /api/extract-resume's
// OCR step (that endpoint is vision-only, built for a photo/scan a user
// uploads). OCR is solving a problem this resume doesn't have, though: the
// printed PDF has a real, selectable text layer, so what a text-based ATS
// parser actually sees IS exactly the plain text resumeContentToMarkdown
// already produces. Testing whether THAT text can be cleanly re-parsed back
// into sections, role entries, and bullets is the direct deterministic
// equivalent of "run it through a parser and see what survives" — faster,
// free (no model call), and fully testable, unlike a real vision round trip.

import { validateATS } from "./ats";

export type AtsIssue = { detail: string; severity: "minor" | "major" };

export type AtsReadabilityResult = {
  // false if anything MAJOR failed to parse back out — a real screener's
  // ATS would likely drop or mis-file this content.
  readable: boolean;
  issues: AtsIssue[];
};

// The exact heading text resumeContentToMarkdown (lib/resume-schema.ts) can
// ever emit. Anything else means an upstream bug produced a heading no
// template-matching ATS parser has a slot for.
const KNOWN_HEADERS = new Set([
  "Summary", "Key Wins", "Relevant Projects", "Key Projects & Impact",
  "Experience", "Education", "Skills", "Leadership & Activities", "Certifications",
]);

// A parser reflowing/truncating a very long single line is a common,
// real failure mode — flagged as a minor formatting deduction, not fatal.
const BULLET_LENGTH_WARNING = 260;

export function checkAtsReadability(markdown: string): AtsReadabilityResult {
  const issues: AtsIssue[] = [];
  const lines = markdown.split("\n");

  // Character-level hazards (em dashes, smart quotes, zero-width chars) —
  // reuses the same check the render pipeline is supposed to have already
  // scrubbed; a hit here means that scrub failed somewhere.
  for (const detail of validateATS(markdown)) issues.push({ detail, severity: "major" });

  const headingLines = lines.filter(l => l.startsWith("## "));
  if (headingLines.length === 0) {
    issues.push({ detail: "No section headings found at all — a real ATS parser has nothing to anchor sections to.", severity: "major" });
  }
  for (const h of headingLines) {
    const title = h.slice(3).trim();
    if (!KNOWN_HEADERS.has(title)) {
      issues.push({ detail: `Unrecognized section heading "${title}" — a template-matching ATS parser may drop this section entirely.`, severity: "major" });
    }
  }

  const expStart = lines.indexOf("## Experience");
  if (expStart !== -1) {
    const nextHeadingOffset = lines.slice(expStart + 1).findIndex(l => l.startsWith("## "));
    const expEnd = nextHeadingOffset === -1 ? lines.length : expStart + 1 + nextHeadingOffset;
    const expLines = lines.slice(expStart + 1, expEnd);

    const entryHeadings = expLines.filter(l => l.startsWith("### "));
    if (entryHeadings.length === 0) {
      issues.push({ detail: 'Experience section has no recoverable role entries (no "### Company | Role | Tenure" lines).', severity: "major" });
    }
    for (const h of entryHeadings) {
      const parts = h.slice(4).split("|").map(p => p.trim());
      if (parts.length < 3 || parts.some(p => !p)) {
        issues.push({ detail: `Experience entry heading "${h.trim()}" doesn't cleanly split into company/role/tenure — dates or employer name may not parse.`, severity: "major" });
      }
    }

    const bulletLines = expLines.filter(l => l.trimStart().startsWith("- "));
    for (const raw of bulletLines) {
      const text = raw.trim().slice(2).trim();
      if (!text) {
        issues.push({ detail: "Empty bullet line found in Experience.", severity: "minor" });
        continue;
      }
      if (text.length > BULLET_LENGTH_WARNING) {
        issues.push({
          detail: `Bullet exceeds ${BULLET_LENGTH_WARNING} characters (${text.length}) — may wrap unpredictably or get truncated by a parser: "${text.slice(0, 60)}..."`,
          severity: "minor",
        });
      }
    }
  }

  return { readable: issues.every(i => i.severity !== "major"), issues };
}
