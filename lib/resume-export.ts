// Client wrapper for the DOCX-first export pipeline (app/api/resume/export).
// Replaces the old window.print()-based HTML-to-PDF flow entirely — see
// app/resume-document.tsx.

import type { ResumeContent } from "./resume-schema";
import type { ResumeArchetype } from "./resume-archetype";
import type { FormatGateViolation, OutcomeWarning } from "./resume-format-gate";

export type ResumeExportResult = {
  docxBase64: string;
  pdfBase64: string;
  pageCount: number;
  // How full page two is (0-100), only meaningful when pageCount === 2 —
  // null otherwise or when it couldn't be measured. See
  // lib/resume-pdf-extract-gate.ts.
  pageTwoFillPercent: number | null;
  // WARN-level format gate issues — export already succeeded; these are
  // shown, never blocking. outcomeWarnings is the subset routable into the
  // gap-fill/bullet-rewrite flow (app/resume-document.tsx).
  warnings: FormatGateViolation[];
  outcomeWarnings: OutcomeWarning[];
};
export type ResumeExportGateFailure = {
  error: string; gate: "format" | "pdf_extraction"; violations: unknown[]; pageCount?: number; pageTwoFillPercent?: number | null;
};

export class ResumeExportError extends Error {
  gate?: "format" | "pdf_extraction";
  violations: unknown[];
  pageCount?: number;
  pageTwoFillPercent?: number | null;
  constructor(payload: ResumeExportGateFailure | { error: string }) {
    super(payload.error);
    this.name = "ResumeExportError";
    if ("gate" in payload) {
      this.gate = payload.gate;
      this.violations = payload.violations;
      this.pageCount = payload.pageCount;
      this.pageTwoFillPercent = payload.pageTwoFillPercent;
    } else {
      this.violations = [];
    }
  }
}

export async function exportResumeDocxAndPdf(
  resumeContent: ResumeContent,
  archetype?: ResumeArchetype | null,
  maxPages?: number,
): Promise<ResumeExportResult> {
  const res = await fetch("/api/resume/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeContent, archetype, maxPages }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ResumeExportError(data);
  return data as ResumeExportResult;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Triggers both file downloads — the .docx is editable, the .pdf is what gets sent. */
export function downloadResumeExport(result: ResumeExportResult, baseFilename: string): void {
  downloadBlob(
    base64ToBlob(result.docxBase64, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    `${baseFilename}.docx`,
  );
  downloadBlob(base64ToBlob(result.pdfBase64, "application/pdf"), `${baseFilename}.pdf`);
}
