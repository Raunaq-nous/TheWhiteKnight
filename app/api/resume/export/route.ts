import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { ResumeContent } from "../../../../lib/resume-schema";
import { ResumeArchetype } from "../../../../lib/resume-archetype";
import { runFormatGate, formatGateFailureMessage } from "../../../../lib/resume-format-gate";
import { generateResumeDocxBuffer } from "../../../../lib/resume-docx";
import { runPdfExtractionGate, pdfExtractionFailureMessage } from "../../../../lib/resume-pdf-extract-gate";
import { convertDocxToPdf, extractPdfText } from "../../../../lib/server/resume-pdf-pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

// DOCX-first export pipeline: FORMAT GATE (reject before anything is
// written) -> generate .docx (source of truth) -> LibreOffice headless
// conversion to .pdf (so the two can never drift apart) -> PDF EXTRACTION
// GATE (the .pdf is read back and must prove itself: selectable text, every
// expected section present in order, exactly one page). Either gate failing
// is a rejected build (4xx with every reason listed), never a best-effort
// file handed back with a warning.
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
    const { resumeContent, archetype } = await req.json() as {
      resumeContent: ResumeContent;
      archetype?: ResumeArchetype | null;
    };

    if (!resumeContent) {
      return NextResponse.json({ error: "Missing resumeContent" }, { status: 400 });
    }

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

    const docxBuffer = await generateResumeDocxBuffer(resumeContent, archetype ?? undefined);
    const pdfBuffer = await convertDocxToPdf(docxBuffer);
    const extracted = await extractPdfText(pdfBuffer);

    const extractionGate = runPdfExtractionGate(extracted, resumeContent, archetype ?? undefined);
    if (!extractionGate.ok) {
      return NextResponse.json({
        error: pdfExtractionFailureMessage(extractionGate),
        gate: "pdf_extraction",
        pageCount: extractionGate.pageCount,
        violations: extractionGate.errors,
      }, { status: 422 });
    }

    return NextResponse.json({
      docxBase64: docxBuffer.toString("base64"),
      pdfBase64: pdfBuffer.toString("base64"),
      pageCount: extractionGate.pageCount,
      warnings: formatGate.warnings,
      outcomeWarnings: formatGate.outcomeWarnings,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Resume export failed" }, { status: 500 });
  }
}
