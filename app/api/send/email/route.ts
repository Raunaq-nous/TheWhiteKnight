import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { approvalRepo } from "../../../../lib/server/repositories/approval-repo";
import { executeApproval } from "../../../../lib/server/services/approval-executor";

export const runtime = "nodejs";

// This route never sends directly. It only re-executes an approval that has
// already been staged (queueApproval) and approved by a human on /approvals —
// the same execution path /api/approvals/[id] uses. There is no way to send
// an email through this route without a prior, recorded human approval.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { approvalId } = await req.json().catch(() => ({})) as { approvalId?: string };
  if (!approvalId) {
    return NextResponse.json(
      { error: "approvalId is required — email sends must be staged via POST /api/approvals and approved on /approvals first" },
      { status: 400 },
    );
  }

  const approval = approvalRepo.get(session.email, approvalId);
  if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  if (approval.action.kind !== "recordSend") {
    return NextResponse.json({ error: "Approval is not a recordSend action" }, { status: 400 });
  }
  if (approval.status !== "approved" || !approval.token) {
    return NextResponse.json(
      { error: `This send has not been approved yet (status: ${approval.status}). Approve it on /approvals first.` },
      { status: 409 },
    );
  }

  const result = await executeApproval(session.email, approvalId, approval.token);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, retryable: result.retryable }, { status: 500 });
  }
  return NextResponse.json({ ok: true, detail: result.detail });
}
