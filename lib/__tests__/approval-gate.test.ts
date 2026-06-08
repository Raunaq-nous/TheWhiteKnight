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
import { _resetDbForTesting } from "../server/db";
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
// requireApproval — no token
// ---------------------------------------------------------------------------
describe("requireApproval without token", () => {
  it("stages the action and returns { staged, approvalId }", () => {
    const result = requireApproval(USER, { kind: "send_email", applicationId: "app-1" });
    expect(result).toMatchObject({ staged: true });
    expect("approvalId" in result && typeof result.approvalId).toBe("string");
  });

  it("creates a pending approval in the DB", () => {
    const result = requireApproval(USER, { kind: "send_email" });
    if (!("approvalId" in result)) throw new Error("expected staged");
    const approval = approvalRepo.get(USER, result.approvalId);
    expect(approval).toBeDefined();
    expect(approval!.status).toBe("pending");
    expect(approval!.token).toBeNull();
  });

  it("never executes when no token provided", () => {
    const result = requireApproval(USER, { kind: "recordSend", applicationId: "app-1" });
    expect("staged" in result && result.staged).toBe(true);
    expect("executed" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requireApproval — with valid token
// ---------------------------------------------------------------------------
describe("requireApproval with valid approval token", () => {
  it("executes and returns { executed, approvalId }", () => {
    const approvalId = queueApproval(USER, { kind: "recordSend", applicationId: "app-1" });
    const resolved = resolveApproval(USER, approvalId, "approve");
    expect(resolved).toBeDefined();
    expect(resolved!.token).toBeTruthy();

    const result = requireApproval(
      USER,
      { kind: "recordSend", applicationId: "app-1" },
      resolved!.token!,
    );
    expect(result).toMatchObject({ executed: true, approvalId });
  });

  it("token is single-use: second call stages instead of executing", () => {
    const approvalId = queueApproval(USER, { kind: "recordSend", applicationId: "app-1" });
    const resolved = resolveApproval(USER, approvalId, "approve");
    const token = resolved!.token!;

    requireApproval(USER, { kind: "recordSend", applicationId: "app-1" }, token);

    const second = requireApproval(USER, { kind: "recordSend", applicationId: "app-1" }, token);
    expect("staged" in second && second.staged).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// requireApproval — wrong action kind
// ---------------------------------------------------------------------------
describe("requireApproval token kind mismatch", () => {
  it("stages (does not execute) when token was approved for a different action kind", () => {
    const approvalId = queueApproval(USER, { kind: "send_email" });
    const resolved = resolveApproval(USER, approvalId, "approve");
    const token = resolved!.token!;

    const result = requireApproval(USER, { kind: "recordSend", applicationId: "app-1" }, token);
    expect("staged" in result && result.staged).toBe(true);
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
