import { NextRequest, NextResponse } from "next/server";
import { visionExtract } from "../../../lib/ai-client";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { base64, mimeType, instruction } = await req.json() as { base64: string; mimeType: string; instruction?: string };
    if (!base64 || !mimeType) {
      return NextResponse.json({ error: "Missing base64 or mimeType" }, { status: 400 });
    }
    const text = await visionExtract(
      base64,
      mimeType,
      instruction ?? "Extract the full text content of this job description image exactly as written. Output only the raw text, no commentary."
    );
    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Extraction failed" }, { status: 500 });
  }
}
