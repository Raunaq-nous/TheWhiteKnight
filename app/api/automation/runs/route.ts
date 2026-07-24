import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { settingsRepo } from "../../../../lib/server/repositories";

export const runtime = "nodejs";

// Read-only run log for the Settings UI ("so I can see it worked").
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runs = settingsRepo.getAutomationRuns(session.email);
  return NextResponse.json({ runs });
}
