import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { probeModels } from "../../../../lib/server/services/model-health";

export const runtime = "nodejs";

// Live model probes, login required. Cached for 10 minutes; ?refresh=1
// forces a new probe. 500 while any configured OpenRouter id is unknown or
// any Together model is not serverless.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const report = await probeModels({ force: req.nextUrl.searchParams.get("refresh") === "1" });
  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}
