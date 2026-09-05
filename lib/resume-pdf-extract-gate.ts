// PDF EXTRACTION GATE — the second, independent check in the DOCX-first
// pipeline (see lib/resume-format-gate.ts for the first). After the DOCX
// is converted to a real PDF, this extracts its text back out and asserts
// it actually reads back as a resume: selectable text, every expected
// section present, IN ORDER, and within the archetype/candidate's resolved
// page ceiling (see resolveMaxPages in lib/resume-archetype.ts — 1 page by
// default, up to 2 for archetypes/seniority where a second page actually
// helps; never 3+, ever). Failing this is a FAILED BUILD, not a warning —
// nothing gets handed back to the user.
//
// Page count is no longer "exactly 1" — research basis: two-page resumes
// get 2.3x more callbacks for 10+ years of experience (ResumeGo, 7,712
// resumes), 68.6% of recruiters prefer two pages, and no major ATS
// (Workday, Greenhouse, Lever, iCIMS, Taleo) parses or penalizes page
// count. What actually matters at 2 pages is that the second page isn't a
// near-empty trailing page (a real quality failure, distinct from page
// count itself) — see PAGE_TWO_MIN_FILL_PERCENT below.
//
// "we already have /api/extract-resume" for extraction, but that endpoint
// is vision/OCR — built for a photo of a resume a user uploads, where no
// text layer exists to read directly. This PDF is a direct LibreOffice
// export of our own DOCX: it has a REAL, embedded text layer, so the
// correct tool is a text-layer PDF parser, not OCR. This repo already
// depends on pdf-parse for exactly this (see app/api/extract-pdf/route.ts)
// — reusing it here is also a stronger test of "is the text selectable"
// than OCR would be: pdf-parse only succeeds at all if a genuine text
// layer exists, whereas OCR would happily "succeed" on a scanned image
// that has no selectable text at all, which is precisely the failure mode
// this gate exists to catch.

import { ResumeContent, resolveSectionSequence, ResumeSectionKey } from "./resume-schema";
import { ResumeArchetype } from "./resume-archetype";

export type PdfExtractionResult = {
  ok: boolean;
  pageCount: number;
  errors: string[];
  text: string;
  // Only set when pageCount === 2 — how full the second page is, as a 0-100
  // estimate (see estimatePageTwoFillPercent below). null when there's
  // only one page (nothing to measure) or per-page text wasn't available.
  pageTwoFillPercent: number | null;
};

// A nearly-empty trailing second page is the actual quality failure this
// gate cares about at 2 pages — not the page count itself. Below this
// threshold, the content should have fit on 1 page and the 2nd page reads
// as padding/whitespace, not as a resume that earned its second page.
export const PAGE_TWO_MIN_FILL_PERCENT = 50;

const SECTION_HEADING_TEXT: Partial<Record<ResumeSectionKey, string>> = {
  summary: "SUMMARY",
  keyWins: "KEY WINS",
  projects: "RELEVANT PROJECTS",
  selectedImpact: "KEY PROJECTS & IMPACT",
  experience: "EXPERIENCE",
  education: "EDUCATION",
  skills: "SKILLS",
  leadership: "LEADERSHIP & ACTIVITIES",
};

/** The section headings this exact resume SHOULD contain, in order — derived the same way lib/resume-docx.ts decided what to render. */
export function expectedSectionHeadings(content: ResumeContent, archetype?: ResumeArchetype): string[] {
  const sequence = resolveSectionSequence(content, archetype);
  const headings: string[] = [];
  for (const key of sequence) {
    const label = SECTION_HEADING_TEXT[key];
    if (!label) continue;
    if (key === "summary" && !content.summary?.trim()) continue;
    if (key === "keyWins" && !content.keyWins?.length) continue;
    if (key === "projects" && !content.projects?.length) continue;
    if (key === "selectedImpact" && !content.keyWins?.length && !content.projects?.length) continue;
    if (key === "experience" && content.experience.length === 0) continue;
    if (key === "education" && content.education.length === 0) continue;
    if (key === "skills" && content.skills.length === 0) continue;
    if (key === "leadership" && !content.leadership?.length) continue;
    headings.push(label);
  }
  return headings;
}

/**
 * Pure check: does `text` contain every heading in `expectedHeadings`, each
 * appearing AFTER the previous one (strictly increasing index)? Case-
 * insensitive substring match — pdf-parse output sometimes normalizes
 * whitespace/case around headings depending on the PDF's internal text
 * runs, and exact-casing is not what this gate is verifying.
 */
export function assertSectionsInOrder(text: string, expectedHeadings: string[]): string[] {
  const errors: string[] = [];
  const haystack = text.toUpperCase();
  let cursor = 0;
  for (const heading of expectedHeadings) {
    const needle = heading.toUpperCase();
    const idx = haystack.indexOf(needle, cursor);
    if (idx !== -1) {
      cursor = idx + heading.length;
      continue;
    }
    // Not found from the current cursor onward — check the whole text to
    // tell "genuinely missing" apart from "present, but earlier than a
    // section that should precede it."
    if (haystack.indexOf(needle) !== -1) {
      errors.push(`Section "${heading}" appears out of order (found before a section that should precede it).`);
    } else {
      errors.push(`Expected section "${heading}" not found in the extracted PDF text at all.`);
    }
  }
  return errors;
}

/**
 * Estimates how full page two is, as a 0-100 percentage, from per-page
 * extracted text (pageTexts[0] = page one, pageTexts[1] = page two).
 * Heuristic: page one is assumed close to full once content has spilled
 * onto a second page at all, so page two's fill is its text length as a
 * fraction of page one's. Returns null when per-page text isn't available
 * (e.g. an older pdf-parse call site that only captured the concatenated
 * text) — callers treat null as "can't verify, don't hard-fail on it."
 */
export function estimatePageTwoFillPercent(pageTexts: string[] | undefined): number | null {
  if (!pageTexts || pageTexts.length < 2) return null;
  const pageOneLen = pageTexts[0]?.trim().length ?? 0;
  const pageTwoLen = pageTexts[1]?.trim().length ?? 0;
  if (pageOneLen === 0) return null; // nothing to compare against — can't estimate
  return Math.max(0, Math.min(100, Math.round((pageTwoLen / pageOneLen) * 100)));
}

/**
 * Runs the full gate against a real extracted {text, numpages, pageTexts}
 * pair (from pdf-parse — see lib/server/resume-pdf-pipeline.ts for where
 * that's produced). Split out from the pdf-parse call itself so this stays
 * testable with fake extraction results, no real PDF required.
 *
 * `maxPages` is the CALLER-resolved ceiling for this archetype/candidate
 * (see resolveMaxPages in lib/resume-archetype.ts) — defaults to 1 so a
 * caller that doesn't pass it gets the old strict behavior, never a
 * silently looser one.
 */
export function runPdfExtractionGate(
  extracted: { text: string; numpages: number; pageTexts?: string[] },
  content: ResumeContent,
  archetype?: ResumeArchetype,
  maxPages: number = 1,
): PdfExtractionResult {
  const errors: string[] = [];
  const text = extracted.text ?? "";
  const pageCount = extracted.numpages;

  if (!text.trim()) {
    errors.push("Extracted PDF text is empty — the text is not selectable (likely rendered as an image or the conversion failed).");
  }

  // Never 3+ pages, full stop, regardless of archetype/maxPages.
  if (pageCount >= 3) {
    errors.push(`PDF is ${pageCount} page(s) — resumes must never run to 3 or more pages.`);
  } else if (pageCount > maxPages) {
    errors.push(`PDF is ${pageCount} page(s), exceeding the ${maxPages}-page limit for this archetype/candidate.`);
  }

  let pageTwoFillPercent: number | null = null;
  if (pageCount === 2) {
    pageTwoFillPercent = estimatePageTwoFillPercent(extracted.pageTexts);
    if (pageTwoFillPercent !== null && pageTwoFillPercent < PAGE_TWO_MIN_FILL_PERCENT) {
      errors.push(
        `Page two is only ~${pageTwoFillPercent}% full (minimum ${PAGE_TWO_MIN_FILL_PERCENT}%) — this content should fit on one page rather than trail onto a nearly-empty second page.`,
      );
    }
  }

  errors.push(...assertSectionsInOrder(text, expectedSectionHeadings(content, archetype)));

  return { ok: errors.length === 0, pageCount, errors, text, pageTwoFillPercent };
}

export function pdfExtractionFailureMessage(result: PdfExtractionResult): string {
  return `PDF EXTRACTION GATE FAILED — build rejected (measured page count: ${result.pageCount}):\n` +
    result.errors.map(e => `- ${e}`).join("\n");
}
