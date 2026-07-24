import { NextRequest, NextResponse } from "next/server";
import { runAutomation } from "../../../../lib/server/services/automation-service";

export const runtime = "nodejs";
export const maxDuration = 300; // scanning + scoring + drafting several jobs can take a while

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userEmail = process.env.ADMIN_EMAIL;
  if (!userEmail) {
    return NextResponse.json({ error: "ADMIN_EMAIL not configured" }, { status: 500 });
  }

  const run = await runAutomation(userEmail, new Date());
  return NextResponse.json({ ok: true, run });
}
