import "server-only";
import { randomUUID, createHash } from "crypto";
import { getDb } from "../db";
import type { ApprovalRepository, Approval, ApprovalAction, ApprovalStatus } from "./types";

const EXPIRY_HOURS = 72;

function computeDigest(action: ApprovalAction): string {
  // Sort keys so digest is deterministic regardless of insertion order.
  return createHash("sha256")
    .update(JSON.stringify(action, Object.keys(action).sort()))
    .digest("hex");
}

type ApprovalRow = {
  id: string;
  user_email: string;
  action: string;
  status: string;
  token: string | null;
  payload_digest: string | null;
  expires_at: string | null;
  created_at: string;
  resolved_at: string | null;
  consumed_at: string | null;
};

function rowToApproval(row: ApprovalRow): Approval {
  return {
    id: row.id,
    userEmail: row.user_email,
    action: JSON.parse(row.action) as ApprovalAction,
    status: row.status as ApprovalStatus,
    token: row.token,
    payloadDigest: row.payload_digest,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    consumedAt: row.consumed_at,
  };
}

function isExpired(row: { expires_at: string | null }): boolean {
  return !!row.expires_at && row.expires_at < new Date().toISOString();
}

export const approvalRepo: ApprovalRepository = {
  create(userEmail, action) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const digest = computeDigest(action);
    const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
    getDb().prepare(`
      INSERT INTO approvals (id, user_email, action, status, payload_digest, expires_at, created_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?)
    `).run(id, userEmail, JSON.stringify(action), digest, expiresAt, now);
    return id;
  },

  list(userEmail, status?) {
    const db = getDb();
    const rows = status
      ? db.prepare("SELECT * FROM approvals WHERE user_email = ? AND status = ? ORDER BY created_at DESC").all(userEmail, status) as ApprovalRow[]
      : db.prepare("SELECT * FROM approvals WHERE user_email = ? ORDER BY created_at DESC").all(userEmail) as ApprovalRow[];
    return rows.map(rowToApproval);
  },

  get(userEmail, id) {
    const row = getDb().prepare(
      "SELECT * FROM approvals WHERE user_email = ? AND id = ?"
    ).get(userEmail, id) as ApprovalRow | undefined;
    return row ? rowToApproval(row) : undefined;
  },

  resolve(userEmail, id, decision) {
    const row = getDb().prepare(
      "SELECT * FROM approvals WHERE user_email = ? AND id = ?"
    ).get(userEmail, id) as ApprovalRow | undefined;
    if (!row || row.status !== "pending") return undefined;
    if (isExpired(row)) return undefined;
    const existing = rowToApproval(row);
    const now = new Date().toISOString();
    const token = decision === "approve" ? randomUUID() : null;
    const status: ApprovalStatus = decision === "approve" ? "approved" : "rejected";
    getDb().prepare(`
      UPDATE approvals SET status = ?, token = ?, resolved_at = ? WHERE id = ?
    `).run(status, token, now, id);
    return { ...existing, status, token, resolvedAt: now };
  },

  consume(token, expected) {
    const row = getDb().prepare(
      "SELECT * FROM approvals WHERE token = ? AND status = 'approved' AND consumed_at IS NULL"
    ).get(token) as ApprovalRow | undefined;
    if (!row) return null;
    if (isExpired(row)) return null;
    const action = JSON.parse(row.action) as ApprovalAction;
    if (action.kind !== expected.kind) return null;
    if (expected.applicationId && action.applicationId !== expected.applicationId) return null;
    const now = new Date().toISOString();
    getDb().prepare("UPDATE approvals SET status = 'consumed', consumed_at = ? WHERE id = ?").run(now, row.id);
    return rowToApproval({ ...row, status: "consumed", consumed_at: now });
  },
};

/**
 * Mark an approval consumed without requiring a token. Only for internal service
 * use (e.g. followup-service marking a scheduled task as processed). Never expose
 * this to the agent or any MCP tool.
 */
export function markApprovalConsumed(id: string): void {
  const now = new Date().toISOString();
  getDb().prepare(
    "UPDATE approvals SET status = 'consumed', consumed_at = ? WHERE id = ?"
  ).run(now, id);
}
