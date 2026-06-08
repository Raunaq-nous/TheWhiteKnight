import "server-only";
import { randomUUID } from "crypto";
import { getDb } from "../db";
import type { ApprovalRepository, Approval, ApprovalAction, ApprovalStatus } from "./types";

type ApprovalRow = {
  id: string;
  user_email: string;
  action: string;
  status: string;
  token: string | null;
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
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    consumedAt: row.consumed_at,
  };
}

export const approvalRepo: ApprovalRepository = {
  create(userEmail, action) {
    const id = randomUUID();
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO approvals (id, user_email, action, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(id, userEmail, JSON.stringify(action), now);
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
    const existing = approvalRepo.get(userEmail, id);
    if (!existing || existing.status !== "pending") return undefined;
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
    const action = JSON.parse(row.action) as ApprovalAction;
    if (action.kind !== expected.kind) return null;
    if (expected.applicationId && action.applicationId !== expected.applicationId) return null;
    const now = new Date().toISOString();
    getDb().prepare("UPDATE approvals SET status = 'consumed', consumed_at = ? WHERE id = ?").run(now, row.id);
    return rowToApproval({ ...row, status: "consumed", consumed_at: now });
  },
};
