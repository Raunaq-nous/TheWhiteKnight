/**
 * Phase 3 approval-gate tests.
 *
 * These tests use a real (temp) SQLite file via _resetDbForTesting() so the
 * full repository + DB layer is exercised without HTTP.
 *
 * The server-only stub in vitest.config.ts resolve.alias makes repository
 * imports work outside Next.js.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import { _resetDbForTesting, getDb } from "../server/db";
import { approvalRepo } from "../server/repositories/approval-repo";
import { requireApproval, queueApproval, resolveApproval } from "../server/approval-gate";

let tmpDir: string;
let counter = 0;

beforeEach(() => {
  // Fresh temp DB for each test.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "careeros-test-"));
  process.env.CAREEROS_DB_PATH = path.join(tmpDir, `test-${++counter}.db`);
  _resetDbForTesting();
});

afterAll(() => {
  _resetDbForTesting();
  delete process.env.CAREEROS_DB_PATH;
});

const USER = "test@example.com";

// ---------------------------------------------------------------------------
// requireApproval — always stages, agent can never execute
// ---------------------------------------------------------------------------
describe("requireApproval", () => {
  it("stages the action and returns { staged, approvalId }", () => {
    const result = requireApproval(USER, { kind: "send_email", applicationId: "app-1" });
    expect(result).toMatchObject({ staged: true });
    expect(typeof result.approvalId).toBe("string");
  });

  it("creates a pending approval in the DB", () => {
    const result = requireApproval(USER, { kind: "send_email" });
    const approval = approvalRepo.get(USER, result.approvalId);
    expect(approval).toBeDefined();
    expect(approval!.status).toBe("pending");
    expect(approval!.token).toBeNull();
  });

  it("always returns staged — execution path removed from agent surface", () => {
    const result = requireApproval(USER, { kind: "recordSend", applicationId: "app-1" });
    expect(result.staged).toBe(true);
    // The 'executed' variant no longer exists on ApprovalResult.
    // TypeScript enforces this at compile time; this runtime check confirms it.
    expect("executed" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveApproval — reject path
// ---------------------------------------------------------------------------
describe("resolveApproval reject", () => {
  it("sets status to rejected and does not produce a token", () => {
    const approvalId = queueApproval(USER, { kind: "submit_application" });
    const resolved = resolveApproval(USER, approvalId, "reject");
    expect(resolved!.status).toBe("rejected");
    expect(resolved!.token).toBeNull();
  });

  it("requireApproval with a rejected-approval id cannot be misused: no token issued", () => {
    const approvalId = queueApproval(USER, { kind: "submit_application" });
    resolveApproval(USER, approvalId, "reject");
    // No token was minted, so calling requireApproval with undefined just stages.
    const result = requireApproval(USER, { kind: "submit_application" });
    expect("staged" in result && result.staged).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Payload immutability — no update path may mutate a pending action's payload
// ---------------------------------------------------------------------------
describe("approval payload immutability", () => {
  it("resolve() does not change the stored action payload", () => {
    const action = { kind: "send_email", applicationId: "app-99", payload: { subject: "Hello" } };
    const approvalId = queueApproval(USER, action);

    resolveApproval(USER, approvalId, "approve");

    const after = approvalRepo.get(USER, approvalId);
    expect(after?.action).toEqual(action);
  });

  it("reject() does not change the stored action payload", () => {
    const action = { kind: "submit_application", applicationId: "app-77" };
    const approvalId = queueApproval(USER, action);

    resolveApproval(USER, approvalId, "reject");

    const after = approvalRepo.get(USER, approvalId);
    expect(after?.action).toEqual(action);
  });
});

// ---------------------------------------------------------------------------
// Expiry — expired approvals cannot be resolved or consumed
// ---------------------------------------------------------------------------
describe("approval expiry", () => {
  it("creates approval with expires_at set ~72h in the future", () => {
    const approvalId = queueApproval(USER, { kind: "test_action" });
    const approval = approvalRepo.get(USER, approvalId);
    expect(approval?.expiresAt).toBeTruthy();
    const expiresAt = new Date(approval!.expiresAt!);
    const expectedMin = new Date(Date.now() + 71 * 60 * 60 * 1000);
    expect(expiresAt.getTime()).toBeGreaterThan(expectedMin.getTime());
  });

  it("stores a stable SHA-256 payload digest at create time", () => {
    const action = { kind: "send_email", applicationId: "app-1", payload: { to: "x@y.com" } };
    const approvalId = queueApproval(USER, action);
    const approval = approvalRepo.get(USER, approvalId);
    expect(typeof approval?.payloadDigest).toBe("string");
    expect(approval!.payloadDigest!.length).toBe(64); // hex SHA-256
  });

  it("resolve() returns undefined for an expired pending approval", () => {
    const approvalId = queueApproval(USER, { kind: "test_expired" });
    // Back-date expires_at to the past.
    getDb().prepare("UPDATE approvals SET expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 1000).toISOString(), approvalId);

    const result = resolveApproval(USER, approvalId, "approve");
    expect(result).toBeUndefined();
  });

  it("consume() returns null for an expired approved approval", () => {
    const approvalId = queueApproval(USER, { kind: "recordSend", applicationId: "app-expired" });
    // Resolve normally (not expired yet).
    const resolved = resolveApproval(USER, approvalId, "approve");
    expect(resolved).toBeDefined();
    // Now back-date expires_at.
    getDb().prepare("UPDATE approvals SET expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 1000).toISOString(), approvalId);

    const consumed = approvalRepo.consume(resolved!.token!, { kind: "recordSend", applicationId: "app-expired" });
    expect(consumed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MCP tool list security regression
// ---------------------------------------------------------------------------
describe("MCP tool list security invariant", () => {
  it("resolveApproval and any approve/token-minting function is NOT in the MCP tool list", async () => {
    // Import the exported helper from the MCP server.
    const { getRegisteredToolNames } = await import("../../mcp/server.js");
    const tools = getRegisteredToolNames();

    // Must have at least the core tools
    expect(tools).toContain("queueApproval");
    expect(tools).toContain("getApprovals");

    // CRITICAL: must NOT contain any resolve/approve operation
    const forbidden = tools.filter(name =>
      name.toLowerCase().includes("resolve") ||
      name.toLowerCase().includes("approve") ||
      name.toLowerCase().includes("token") ||
      name.toLowerCase().includes("mint"),
    );
    expect(forbidden).toEqual([]);
  });
});
