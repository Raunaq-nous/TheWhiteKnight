import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Public liveness check only: no model calls, no probes, no key details.
// Live model probes are behind login at /api/health/models (cached 10 min).
export async function GET() {
  return NextResponse.json({ ok: true, service: "careeros", time: new Date().toISOString() });
}
