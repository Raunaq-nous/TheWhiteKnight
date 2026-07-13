import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session";
import { approvalRepo } from "../../../lib/server/repositories/approval-repo";
import { queueApproval } from "../../../lib/server/approval-gate";
import type { ApprovalStatus } from "../../../lib/server/repositories/types";

export const runtime = "nodejs";

// Action kinds a client is allowed to stage directly from the UI (e.g. the
// notification bell's "send" button). Anything else must be staged server-side
// (MCP tools, follow-up service) — this route is not a general staging API.
const CLIENT_STAGEABLE_KINDS = new Set(["recordSend"]);

// POST — stage a new approval. Never executes anything; a human must still
// approve on /approvals before executeApproval runs.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    kind?: string;
    applicationId?: string;
    payload?: Record<string, unknown>;
  };

  if (!body.kind || !CLIENT_STAGEABLE_KINDS.has(body.kind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${Array.from(CLIENT_STAGEABLE_KINDS).join(", ")}` },
      { status: 400 },
    );
  }

  const approvalId = queueApproval(session.email, {
    kind: body.kind,
    applicationId: body.applicationId,
    payload: body.payload,
  });

  return NextResponse.json({ ok: true, approvalId });
}

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
