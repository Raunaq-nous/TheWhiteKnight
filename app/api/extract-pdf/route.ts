import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { base64 } = await req.json() as { base64: string };
    if (!base64) {
      return NextResponse.json({ error: "Missing base64" }, { status: 400 });
    }

    const buffer = Buffer.from(base64, "base64");

    if (buffer.length < 5 || buffer.slice(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json({ error: "File does not appear to be a valid PDF." }, { status: 422 });
    }

    // pdf-parse v1.1.1 — simple function API, stable in Node.js/Next.js server routes.
    // Excluded from webpack bundling via serverExternalPackages in next.config.js.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    const text = (data.text ?? "").trim();

    if (!text) {
      return NextResponse.json({
        error: "PDF appears to contain only images (scanned document). Use the + PHOTO option to upload a screenshot of the JD instead.",
      }, { status: 422 });
    }

    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json({
      error: `PDF extraction failed: ${e.message ?? e}. Try saving the JD as .txt, or use the + PHOTO screenshot option.`,
    }, { status: 500 });
  }
}
