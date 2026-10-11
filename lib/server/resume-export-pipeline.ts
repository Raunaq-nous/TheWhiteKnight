import "server-only";
// The ONE resume export pipeline, shared by app/api/resume/export/route.ts
// and scripts/verify-resume.ts:
//   FORMAT GATE -> canonical employer locations -> TOOL PLACEMENT GATE ->
//   MEASURE-AND-FILL (docx -> em-dash repair -> LibreOffice pdf -> pdf-parse,
//   re-rendered until page two is >= 50% full or the reserve runs out) ->
//   CONFIDENTIALITY GATE on the final docx text AND the extracted pdf text ->
//   PDF EXTRACTION GATE.
// Any gate failure is a rejected build, never a best-effort file.

import { ResumeContent } from "../resume-schema";
import { ResumeArchetype, RESUME_SPECS } from "../resume-archetype";
import { runFormatGate, formatGateFailureMessage, FormatGateViolation, OutcomeWarning } from "../resume-format-gate";
import { generateResumeDocxBuffer } from "../resume-docx";
import { runPdfExtractionGate, pdfExtractionFailureMessage, estimatePageTwoFillPercent } from "../resume-pdf-extract-gate";
import { convertDocxToPdf, extractPdfText } from "./resume-pdf-pipeline";
import {
  enforceEmployerLocations, repairEmDashesInDocx, extractDocxText,
  runConfidentialityGate, confidentialityGateFailureMessage,
} from "../resume-confidentiality";
import { runToolPlacementGate, toolPlacementGateFailureMessage } from "../resume-tool-placement";
import { measureAndFill, FillStep } from "../resume-measure-fill";
import { CONSULTING_ENGAGEMENTS_LABEL, AI_BUILDS_LABEL, anyRoleUsesSubLabels } from "../resume-sublabels";

export type ExportFailure = { ok: false; status: number; body: Record<string, unknown> };
export type ExportSuccess = {
  ok: true;
  docxBuffer: Buffer;
  pdfBuffer: Buffer;
  pageCount: number;
  pageTwoFillPercent: number | null;
  maxPages: number;
  resumeContent: ResumeContent;
  warnings: FormatGateViolation[];
  outcomeWarnings: OutcomeWarning[];
  fill: { steps: FillStep[]; addedIds: string[]; droppedIds: string[]; underfilledWithReserve: boolean };
  subLabelsRendered: boolean;
};

type Rendered = { docxBuffer: Buffer; pdfBuffer: Buffer; extracted: { text: string; numpages: number; pageTexts: string[] } };

export async function runResumeExport(input: {
  resumeContent: ResumeContent;
  archetype?: ResumeArchetype | null;
  maxPages?: number;
}): Promise<ExportFailure | ExportSuccess> {
  const { resumeContent, archetype } = input;
  const requestedMaxPages = input.maxPages ?? (archetype ? RESUME_SPECS[archetype].maxPages : 1);

  // Only a HARD failure blocks export — warnings travel with a successful one.
  const formatGate = runFormatGate(resumeContent);
  if (formatGate.blocked) {
    return { ok: false, status: 422, body: { error: formatGateFailureMessage(formatGate), gate: "format", violations: formatGate.hardFailures } };
  }

  // Canonical employer locations override whatever the content says.
  const located: ResumeContent = { ...resumeContent, experience: enforceEmployerLocations(resumeContent.experience) };

  // A named build under the wrong employer is a fabrication risk.
  const toolGate = runToolPlacementGate(located);
  if (!toolGate.ok) {
    return { ok: false, status: 422, body: { error: toolPlacementGateFailureMessage(toolGate), gate: "tool_placement", violations: toolGate.violations } };
  }

  // Render + measure, keeping the last render so the final one isn't redone.
  let last: { key: string; rendered: Rendered } | null = null;
  const render = async (content: ResumeContent, pages: number): Promise<Rendered> => {
    const key = `${pages}:${JSON.stringify(content.experience)}:${JSON.stringify(content.keyWins)}:${content.summary}`;
    if (last?.key === key) return last.rendered;
    const raw = await generateResumeDocxBuffer(content, archetype ?? undefined, pages);
    // Em-dash REPAIR sweep on the packed XML before anything reads it.
    const docxBuffer = await repairEmDashesInDocx(raw);
    const pdfBuffer = await convertDocxToPdf(docxBuffer);
    const extracted = await extractPdfText(pdfBuffer);
    last = { key, rendered: { docxBuffer, pdfBuffer, extracted } };
    return last.rendered;
  };
  const fill = await measureAndFill(located, archetype ?? "general", requestedMaxPages, async (content, pages) => {
    const { extracted } = await render(content, pages);
    return { pageCount: extracted.numpages, pageTwoFillPercent: extracted.numpages === 2 ? estimatePageTwoFillPercent(extracted.pageTexts) : null };
  });
  const finalContent = fill.content;
  const { docxBuffer, pdfBuffer, extracted } = await render(finalContent, fill.maxPages);

  // CONFIDENTIALITY GATE, pass 1: the final .docx text.
  const docxText = await extractDocxText(docxBuffer);
  const docxGate = runConfidentialityGate(docxText, undefined, archetype ?? undefined);
  if (!docxGate.ok) {
    return { ok: false, status: 422, body: { error: confidentialityGateFailureMessage(docxGate), gate: "confidentiality", violations: docxGate.blockedTerms } };
  }
  // CONFIDENTIALITY GATE, pass 2: what a reader actually receives.
  const pdfGate = runConfidentialityGate(extracted.text, undefined, archetype ?? undefined);
  if (!pdfGate.ok) {
    return { ok: false, status: 422, body: { error: confidentialityGateFailureMessage(pdfGate), gate: "confidentiality", violations: pdfGate.blockedTerms } };
  }

  const extraction = runPdfExtractionGate(extracted, finalContent, archetype ?? undefined, fill.maxPages, {
    allowUnderfilledPageTwo: fill.underfilledWithReserve,
  });
  if (!extraction.ok) {
    return {
      ok: false, status: 422,
      body: {
        error: pdfExtractionFailureMessage(extraction), gate: "pdf_extraction",
        pageCount: extraction.pageCount, pageTwoFillPercent: extraction.pageTwoFillPercent, violations: extraction.errors, fillSteps: fill.steps,
      },
    };
  }

  const finalFormat = runFormatGate(finalContent);
  return {
    ok: true, docxBuffer, pdfBuffer,
    pageCount: extraction.pageCount, pageTwoFillPercent: extraction.pageTwoFillPercent, maxPages: fill.maxPages,
    resumeContent: finalContent,
    warnings: finalFormat.warnings, outcomeWarnings: finalFormat.outcomeWarnings,
    fill: { steps: fill.steps, addedIds: fill.addedIds, droppedIds: fill.droppedIds, underfilledWithReserve: fill.underfilledWithReserve },
    subLabelsRendered: anyRoleUsesSubLabels(finalContent.experience) && docxText.includes(CONSULTING_ENGAGEMENTS_LABEL) && docxText.includes(AI_BUILDS_LABEL),
  };
}
