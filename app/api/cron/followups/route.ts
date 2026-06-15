import { NextRequest, NextResponse } from "next/server";
import { runDueFollowUps } from "../../../../lib/server/services/followup-service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userEmail = process.env.ADMIN_EMAIL;
  if (!userEmail) {
    return NextResponse.json({ error: "ADMIN_EMAIL not configured" }, { status: 500 });
  }

  const result = await runDueFollowUps(userEmail, new Date());
  return NextResponse.json({ ok: true, ...result });
}
