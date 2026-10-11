import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { ResumeContent } from "../../../../lib/resume-schema";
import { ResumeArchetype } from "../../../../lib/resume-archetype";
import { runResumeExport } from "../../../../lib/server/resume-export-pipeline";

export const runtime = "nodejs";
// Measure-and-fill can re-render the PDF up to 8 times.
export const maxDuration = 120;

// Thin wrapper: the whole DOCX-first pipeline (format gate, tool placement,
// measure-and-fill against the real PDF, confidentiality on docx AND pdf
// text, extraction gate) lives in lib/server/resume-export-pipeline.ts.
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
    const { resumeContent, archetype, maxPages } = await req.json() as {
      resumeContent: ResumeContent;
      archetype?: ResumeArchetype | null;
      // Resolved at generation time (resolveConfiguredMaxPages) and passed
      // through by the client, so the gate checks the same ceiling the
      // content was budgeted for.
      maxPages?: number;
    };
    if (!resumeContent) {
      return NextResponse.json({ error: "Missing resumeContent" }, { status: 400 });
    }

    const result = await runResumeExport({ resumeContent, archetype, maxPages });
    if (!result.ok) return NextResponse.json(result.body, { status: result.status });

    return NextResponse.json({
      docxBase64: result.docxBuffer.toString("base64"),
      pdfBase64: result.pdfBuffer.toString("base64"),
      pageCount: result.pageCount,
      pageTwoFillPercent: result.pageTwoFillPercent,
      maxPages: result.maxPages,
      // The content actually exported (measure-and-fill may have added or
      // dropped bullets) so the client can persist exactly what was sent.
      resumeContent: result.resumeContent,
      fill: result.fill,
      warnings: result.warnings,
      outcomeWarnings: result.outcomeWarnings,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Resume export failed" }, { status: 500 });
  }
}
