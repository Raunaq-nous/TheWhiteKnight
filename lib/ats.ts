// ATS normalization — ported from career-ops generate-pdf.mjs
// Strips characters that break ATS parsers: em dashes, smart quotes, zero-width chars.

export function normalizeTextForATS(text: string): string {
  return text
    .replace(/—/g, "-")          // em dash → hyphen
    .replace(/–/g, "-")          // en dash → hyphen
    .replace(/‘|’/g, "'")   // smart single quotes → apostrophe
    .replace(/“|”/g, '"')   // smart double quotes → straight quote
    .replace(/…/g, "...")        // ellipsis → three dots
    .replace(/ /g, " ")          // non-breaking space → regular space
    .replace(/​/g, "")           // zero-width space → remove
    .replace(/﻿/g, "")           // BOM → remove
    .replace(/[•‣◦⁃∙]/g, "-") // fancy bullets → hyphen
    .trim();
}

// Validate a resume for ATS compliance. Returns list of issues found.
export function validateATS(text: string): string[] {
  const issues: string[] = [];
  if (/—/.test(text)) issues.push("Em dash found (U+2014) — replace with comma or semicolon");
  if (/–/.test(text)) issues.push("En dash found (U+2013) — replace with hyphen");
  if (/[‘’]/.test(text)) issues.push("Smart single quotes found — use straight apostrophes");
  if (/[“”]/.test(text)) issues.push("Smart double quotes found — use straight quotes");
  if (/​/.test(text)) issues.push("Zero-width space found — remove");
  const emDashCount = (text.match(/—/g) || []).length;
  if (emDashCount > 0) issues.push(`${emDashCount} em dash(es) detected`);
  return issues;
}
