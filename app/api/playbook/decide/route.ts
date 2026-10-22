import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { decide } from "../../../../lib/server/services/playbook-service";

export const runtime = "nodejs";

// Accept or reject ONE proposal. The only way a rule enters the playbook.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { proposalId, decision } = await req.json().catch(() => ({})) as { proposalId?: string; decision?: string };
  if (typeof proposalId !== "string" || (decision !== "accept" && decision !== "reject")) {
    return NextResponse.json({ error: "proposalId and decision (accept or reject) are required" }, { status: 400 });
  }
  const r = decide(session.email, proposalId, decision);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json(r);
}
