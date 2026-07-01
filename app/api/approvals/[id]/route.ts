import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { resolveApproval } from "../../../../lib/server/approval-gate";
import { approvalRepo } from "../../../../lib/server/repositories/approval-repo";
import { executeApproval } from "../../../../lib/server/services/approval-executor";

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
  const existing = approvalRepo.get(session.email, id);

  if (!existing) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  // Expiry check.
  if (existing.expiresAt && existing.expiresAt < new Date().toISOString()) {
    return NextResponse.json({ error: "Approval has expired" }, { status: 410 });
  }

  if (decision === "reject") {
    const result = resolveApproval(session.email, id, decision);
    if (!result) {
      return NextResponse.json({ error: "Approval not found or already resolved" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: result.status });
  }

  // decision === "approve"
  let token: string;

  if (existing.status === "approved" && existing.token) {
    // Retry path: already approved but execution previously failed — re-run executor.
    token = existing.token;
  } else if (existing.status === "pending") {
    // First approval: mint token server-side.
    const resolved = resolveApproval(session.email, id, "approve");
    if (!resolved?.token) {
      return NextResponse.json({ error: "Approval not found or already resolved" }, { status: 404 });
    }
    token = resolved.token;
  } else if (existing.status === "consumed") {
    return NextResponse.json({ error: "Already executed" }, { status: 409 });
  } else {
    return NextResponse.json({ error: "Approval already resolved" }, { status: 409 });
  }

  // Execute server-side. Token is never returned to the client.
  const execResult = await executeApproval(session.email, id, token);

  if (!execResult.ok) {
    return NextResponse.json(
      { ok: false, error: execResult.error, retryable: execResult.retryable },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, status: "consumed", executed: true });
}
