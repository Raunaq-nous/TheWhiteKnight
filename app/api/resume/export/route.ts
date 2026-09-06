import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { ResumeContent } from "../../../../lib/resume-schema";
import { ResumeArchetype, RESUME_SPECS } from "../../../../lib/resume-archetype";
import { runFormatGate, formatGateFailureMessage } from "../../../../lib/resume-format-gate";
import { generateResumeDocxBuffer } from "../../../../lib/resume-docx";
import { runPdfExtractionGate, pdfExtractionFailureMessage } from "../../../../lib/resume-pdf-extract-gate";
import { convertDocxToPdf, extractPdfText } from "../../../../lib/server/resume-pdf-pipeline";
import {
  enforceEmployerLocations, repairEmDashesInDocx, extractDocxText,
  runConfidentialityGate, confidentialityGateFailureMessage,
} from "../../../../lib/resume-confidentiality";

export const runtime = "nodejs";
export const maxDuration = 60;

// DOCX-first export pipeline: FORMAT GATE (reject before anything is
// written) -> CONFIDENTIALITY substitutions + employer-location overrides
// (docs/MASTER-PROFILE-SPEC.md Part 1/2) -> generate .docx (source of
// truth) -> em-dash repair sweep on the packed XML -> CONFIDENTIALITY GATE
// on the repaired docx text -> LibreOffice headless conversion to .pdf (so
// the two can never drift apart) -> PDF EXTRACTION GATE (selectable text,
// every expected section present in order, within the resolved page
// ceiling) -> CONFIDENTIALITY GATE again on the extracted PDF text, as a
// second independent check (spec: "Run as a HARD gate on the final DOCX
// text AND the extracted PDF text"). Any gate failing is a rejected build
// (4xx with every reason listed), never a best-effort file handed back
// with a warning.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`resume-export:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) },
    });
  }

  try {
    const { resumeContent, archetype, maxPages: requestedMaxPages } = await req.json() as {
      resumeContent: ResumeContent;
      archetype?: ResumeArchetype | null;
      // Resolved at generation time (see resolveMaxPages in
      // lib/resume-archetype.ts) and passed straight through by the
      // client, so the extraction gate checks against the SAME ceiling the
      // content was actually budgeted for. Falls back to the archetype's
      // own base maxPages (or 1) for older clients that don't send it.
      maxPages?: number;
    };

    if (!resumeContent) {
      return NextResponse.json({ error: "Missing resumeContent" }, { status: 400 });
    }

    const maxPages = requestedMaxPages ?? (archetype ? RESUME_SPECS[archetype].maxPages : 1);

    // Only a HARD failure blocks export — WARN-level issues (weak/missing
    // outcome, over caps) are reported alongside a successful export, not
    // instead of one. See lib/resume-format-gate.ts for the severity split.
    const formatGate = runFormatGate(resumeContent);
    if (formatGate.blocked) {
      return NextResponse.json({
        error: formatGateFailureMessage(formatGate),
        gate: "format",
        violations: formatGate.hardFailures,
      }, { status: 422 });
    }

    // Canonical employer locations override whatever the profile/content
    // says (spec Part 2) — Aranca is always Mumbai, regardless of source.
    const contentForRender: ResumeContent = {
      ...resumeContent,
      experience: enforceEmployerLocations(resumeContent.experience),
    };

    const rawDocxBuffer = await generateResumeDocxBuffer(contentForRender, archetype ?? undefined);
    // Em-dash REPAIR sweep (spec Part 10 step 2) — detection alone is not
    // enough; autocorrect and model output both reintroduce em dashes, so
    // the packed XML is rewritten before anything downstream ever sees it.
    const docxBuffer = await repairEmDashesInDocx(rawDocxBuffer);

    // CONFIDENTIALITY GATE, pass 1: the final .docx text, pre-conversion —
    // fails fast, before paying for a LibreOffice conversion.
    const docxText = await extractDocxText(docxBuffer);
    const docxConfidentialityGate = runConfidentialityGate(docxText, undefined, archetype ?? undefined);
    if (!docxConfidentialityGate.ok) {
      return NextResponse.json({
        error: confidentialityGateFailureMessage(docxConfidentialityGate),
        gate: "confidentiality",
        violations: docxConfidentialityGate.blockedTerms,
      }, { status: 422 });
    }

    const pdfBuffer = await convertDocxToPdf(docxBuffer);
    const extracted = await extractPdfText(pdfBuffer);

    // CONFIDENTIALITY GATE, pass 2: the extracted PDF text — an
    // independent second check against what a human would actually
    // receive, in case the docx->pdf conversion introduced anything (e.g.
    // a field code re-expanding, or a re-encoded em dash).
    const pdfConfidentialityGate = runConfidentialityGate(extracted.text, undefined, archetype ?? undefined);
    if (!pdfConfidentialityGate.ok) {
      return NextResponse.json({
        error: confidentialityGateFailureMessage(pdfConfidentialityGate),
        gate: "confidentiality",
        violations: pdfConfidentialityGate.blockedTerms,
      }, { status: 422 });
    }

    const extractionGate = runPdfExtractionGate(extracted, contentForRender, archetype ?? undefined, maxPages);
    if (!extractionGate.ok) {
      return NextResponse.json({
        error: pdfExtractionFailureMessage(extractionGate),
        gate: "pdf_extraction",
        pageCount: extractionGate.pageCount,
        pageTwoFillPercent: extractionGate.pageTwoFillPercent,
        violations: extractionGate.errors,
      }, { status: 422 });
    }

    return NextResponse.json({
      docxBase64: docxBuffer.toString("base64"),
      pdfBase64: pdfBuffer.toString("base64"),
      pageCount: extractionGate.pageCount,
      pageTwoFillPercent: extractionGate.pageTwoFillPercent,
      warnings: formatGate.warnings,
      outcomeWarnings: formatGate.outcomeWarnings,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Resume export failed" }, { status: 500 });
  }
}
