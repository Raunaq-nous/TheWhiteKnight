import { NextRequest, NextResponse } from "next/server";
import { fetchJdText } from "../../../lib/server/services/jd-fetch-service";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { url, exaApiKey } = await req.json() as { url: string; exaApiKey?: string };

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const result = await fetchJdText(url, exaApiKey);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ text: result.text, source: result.source, company: result.company, role: result.role, location: result.location });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "URL fetch failed" }, { status: 500 });
  }
}
