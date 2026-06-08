import "server-only";
import { approvalRepo } from "./repositories/approval-repo";
import type { ApprovalAction } from "./repositories/types";

export type ApprovalResult =
  | { staged: true; approvalId: string }
  | { executed: true; approvalId: string };

/**
 * Gate for any external action that requires human approval.
 *
 * - No token or invalid token: stages the action (returns { staged, approvalId }).
 * - Valid, unconsumed, matching token: consumes it and returns { executed, approvalId }.
 *
 * Token minting (resolve) is intentionally NOT exposed here. It is only reachable
 * via the JWT-gated app API route so the agent can never self-approve.
 */
export function requireApproval(
  userEmail: string,
  action: ApprovalAction,
  approvalToken?: string,
): ApprovalResult {
  if (approvalToken) {
    const consumed = approvalRepo.consume(approvalToken, {
      kind: action.kind,
      applicationId: action.applicationId,
    });
    if (consumed) {
      return { executed: true, approvalId: consumed.id };
    }
  }
  const approvalId = approvalRepo.create(userEmail, action);
  return { staged: true, approvalId };
}

/** Stage an action without attempting execution. Thin wrapper for MCP tool use. */
export function queueApproval(userEmail: string, action: ApprovalAction): string {
  return approvalRepo.create(userEmail, action);
}

/** Approve or reject a staged action. Call only from JWT-gated web API. */
export function resolveApproval(
  userEmail: string,
  id: string,
  decision: "approve" | "reject",
) {
  return approvalRepo.resolve(userEmail, id, decision);
}
