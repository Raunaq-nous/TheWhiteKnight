import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session";
import { approvalRepo } from "../../../lib/server/repositories/approval-repo";
import type { ApprovalStatus } from "../../../lib/server/repositories/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = (req.nextUrl.searchParams.get("status") ?? "pending") as ApprovalStatus;
  const approvals = approvalRepo.list(session.email, status);

  const now = new Date().toISOString();
  const result = approvals.map(a => ({
    id: a.id,
    action: a.action,
    status: a.status,
    expiresAt: a.expiresAt,
    expired: !!a.expiresAt && a.expiresAt < now,
    createdAt: a.createdAt,
    resolvedAt: a.resolvedAt,
  }));

  return NextResponse.json({ approvals: result });
}
