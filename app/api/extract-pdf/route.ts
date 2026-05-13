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

    // pdf-parse v2 uses a class-based API
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text: string = result.text ?? "";

    if (!text.trim()) {
      return NextResponse.json({ error: "PDF appears to be image-only (scanned). Please use the + PHOTO option instead." }, { status: 422 });
    }

    return NextResponse.json({ text: text.trim() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "PDF extraction failed" }, { status: 500 });
  }
}
