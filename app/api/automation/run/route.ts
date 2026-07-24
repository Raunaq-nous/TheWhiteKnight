import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { runAutomation } from "../../../../lib/server/services/automation-service";

export const runtime = "nodejs";
export const maxDuration = 300;

// Session-gated "run now" — bypasses the schedule's due-check (still
// respects the enabled flag) so the automation loop can be verified without
// waiting for the configured schedule. Not reachable via MCP or cron secret.
export async function POST(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const run = await runAutomation(session.email, new Date(), { force: true });
  return NextResponse.json({ ok: true, run });
}
