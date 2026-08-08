// PDF EXTRACTION GATE — the second, independent check in the DOCX-first
// pipeline (see lib/resume-format-gate.ts for the first). After the DOCX
// is converted to a real PDF, this extracts its text back out and asserts
// it actually reads back as a resume: selectable text, every expected
// section present, IN ORDER, and exactly one page. Failing this is a
// FAILED BUILD, not a warning — nothing gets handed back to the user.
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
};

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
 * Runs the full gate against a real extracted {text, numpages} pair (from
 * pdf-parse — see lib/server/resume-pdf-pipeline.ts for where that's
 * produced). Split out from the pdf-parse call itself so this stays
 * testable with fake extraction results, no real PDF required.
 */
export function runPdfExtractionGate(
  extracted: { text: string; numpages: number },
  content: ResumeContent,
  archetype?: ResumeArchetype,
): PdfExtractionResult {
  const errors: string[] = [];
  const text = extracted.text ?? "";

  if (!text.trim()) {
    errors.push("Extracted PDF text is empty — the text is not selectable (likely rendered as an image or the conversion failed).");
  }

  if (extracted.numpages !== 1) {
    errors.push(`PDF is ${extracted.numpages} page(s), not exactly 1.`);
  }

  errors.push(...assertSectionsInOrder(text, expectedSectionHeadings(content, archetype)));

  return { ok: errors.length === 0, pageCount: extracted.numpages, errors, text };
}

export function pdfExtractionFailureMessage(result: PdfExtractionResult): string {
  return `PDF EXTRACTION GATE FAILED — build rejected (measured page count: ${result.pageCount}):\n` +
    result.errors.map(e => `- ${e}`).join("\n");
}
