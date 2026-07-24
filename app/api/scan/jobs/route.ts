import { NextRequest, NextResponse } from "next/server";
import { scanJobs, JobScanInput } from "../../../../lib/server/services/scan-service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as JobScanInput;
    if (!body.query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

    const result = await scanJobs(body);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Job scan failed" }, { status: 500 });
  }
}
