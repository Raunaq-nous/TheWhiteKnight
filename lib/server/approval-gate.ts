import "server-only";
import { approvalRepo } from "./repositories/approval-repo";
import type { ApprovalAction } from "./repositories/types";
import { notifyOperator } from "./channels/notify-operator";

export type ApprovalResult = { staged: true; approvalId: string };

/**
 * Gate for any external action that requires human approval.
 *
 * Always stages — the agent can never execute. Real execution happens only
 * when a human approves via the JWT-gated /api/approvals/[id] route, which
 * mints a token, calls approval-executor, and consumes — all server-side.
 */
export function requireApproval(
  userEmail: string,
  action: ApprovalAction,
): ApprovalResult {
  const approvalId = approvalRepo.create(userEmail, action);
  notifyOperator(userEmail, approvalId, action).catch(() => {});
  return { staged: true, approvalId };
}

/** Stage an action without attempting execution. Thin wrapper for MCP tool use. */
export function queueApproval(userEmail: string, action: ApprovalAction): string {
  const id = approvalRepo.create(userEmail, action);
  notifyOperator(userEmail, id, action).catch(() => {});
  return id;
}

/** Approve or reject a staged action. Call only from JWT-gated web API. */
export function resolveApproval(
  userEmail: string,
  id: string,
  decision: "approve" | "reject",
) {
  return approvalRepo.resolve(userEmail, id, decision);
}
