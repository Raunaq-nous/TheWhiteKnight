import { NextRequest, NextResponse } from "next/server";
import { visionExtract } from "../../../lib/ai-client";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { base64, mimeType } = await req.json() as { base64: string; mimeType: string };
    if (!base64 || !mimeType) {
      return NextResponse.json({ error: "Missing base64 or mimeType" }, { status: 400 });
    }
    const text = await visionExtract(
      base64,
      mimeType,
      "Extract the full text content of this resume or portfolio document exactly as written. Preserve section headers (Experience, Education, Skills, Projects, etc.) and bullet structure. Output only the raw text, no commentary."
    );
    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Extraction failed" }, { status: 500 });
  }
}
