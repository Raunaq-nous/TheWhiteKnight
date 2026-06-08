import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { resolveApproval } from "../../../../lib/server/approval-gate";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { decision } = await req.json() as { decision: "approve" | "reject" };
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision must be approve or reject" }, { status: 400 });
  }

  const { id } = await params;
  const result = resolveApproval(session.email, id, decision);
  if (!result) {
    return NextResponse.json({ error: "Approval not found or already resolved" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, status: result.status, token: result.token });
}
