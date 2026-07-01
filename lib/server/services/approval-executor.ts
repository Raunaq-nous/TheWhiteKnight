import "server-only";
import { approvalRepo, markApprovalConsumed, computeActionDigest } from "../repositories/approval-repo";
import { executeSend, type SendResult } from "./send-service";

export type ExecutorResult =
  | { ok: true; executed: true; detail: SendResult | Record<string, unknown> }
  | { ok: false; retryable: true; error: string };

/**
 * Execute an approved action server-side — called only from the JWT-gated
 * approval route, never from any MCP tool.
 *
 * Contract:
 * - Approval must be in "approved" state and the supplied token must match.
 * - Stored payload digest must match the recomputed digest (tamper-check).
 * - Execute only if approved-and-not-yet-consumed.
 * - Mark consumed ONLY after the send succeeds.
 * - On failure: do NOT consume; leave the approval retryable, surface the error.
 */
export async function executeApproval(
  userEmail: string,
  approvalId: string,
  token: string,
): Promise<ExecutorResult> {
  const approval = approvalRepo.get(userEmail, approvalId);

  if (!approval) {
    return { ok: false, retryable: false as any, error: "Approval not found" };
  }

  if (approval.status === "consumed") {
    return { ok: false, retryable: false as any, error: "Approval already executed" };
  }

  if (approval.status !== "approved") {
    return { ok: false, retryable: true, error: `Approval is not in approved state (status: ${approval.status})` };
  }

  if (approval.token !== token) {
    return { ok: false, retryable: false as any, error: "Token mismatch" };
  }

  // Tamper-check: recompute digest from stored action, compare to stored digest.
  const recomputed = computeActionDigest(approval.action);
  if (approval.payloadDigest && recomputed !== approval.payloadDigest) {
    return { ok: false, retryable: false as any, error: "Payload digest mismatch — approval rejected" };
  }

  const { kind, applicationId, payload } = approval.action;

  try {
    if (kind === "recordSend") {
      const channel = (payload?.channel as string) ?? "other";
      const sendPayload = { ...(payload ?? {}) };
      delete (sendPayload as any).channel;

      const detail = await executeSend(
        userEmail,
        applicationId ?? "",
        channel,
        sendPayload,
      );

      // Mark consumed only after successful execution.
      markApprovalConsumed(approvalId);
      return { ok: true, executed: true, detail };
    }

    // Unknown action kind — do not execute, do not consume.
    return { ok: false, retryable: false as any, error: `No executor for action kind: ${kind}` };
  } catch (err: unknown) {
    // Send failed — do NOT consume. Leave it retryable.
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, retryable: true, error: `Execution failed: ${msg}` };
  }
}
