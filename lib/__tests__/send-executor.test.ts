/**
 * Phase 4d — send-service + approval-executor tests.
 *
 * Resend transport is mocked so no real HTTP calls fire.
 * notifyOperator is mocked so no emails fire during staging.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

// vi.hoisted ensures mockSendEmail is available inside the hoisted factory.
const mockSendEmail = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ messageId: "mock-msg-id" }),
);

vi.mock("../server/channels/email-channel", () => ({
  buildEmailChannel: vi.fn().mockReturnValue({
    sendEmail: mockSendEmail,
  }),
}));

vi.mock("../server/channels/notify-operator", () => ({
  notifyOperator: vi.fn().mockResolvedValue(undefined),
}));

import { _resetDbForTesting, getDb } from "../server/db";
import { approvalRepo } from "../server/repositories/approval-repo";
import { settingsRepo } from "../server/repositories/settings-repo";
import { applicationRepo } from "../server/repositories/application-repo";
import { queueApproval, resolveApproval } from "../server/approval-gate";
import { executeApproval } from "../server/services/approval-executor";
import type { Application } from "../store";

let tmpDir: string;
let counter = 0;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "careeros-4d-test-"));
  process.env.CAREEROS_DB_PATH = path.join(tmpDir, `test-${++counter}.db`);
  _resetDbForTesting();
  vi.clearAllMocks();
  // Reset email channel mock to default success
  mockSendEmail.mockResolvedValue({ messageId: "mock-msg-id" });
});

afterAll(() => {
  _resetDbForTesting();
  delete process.env.CAREEROS_DB_PATH;
});

const USER = "exec-test@example.com";

function makeApp(id: string): Application {
  return {
    id, slug: `app-${id}`, company: "Acme", role: "PM",
    location: "Remote", remote: true, status: "applied", score: 7,
    bucket: "product", sector: "tech", seniority: "senior",
    sourceUrl: "https://example.com", capturedAt: "2024-05-01",
    jdRaw: "", jdParsed: {}, nextAction: "", contacts: [],
    interviews: [], reminders: [], resumeVersions: [], notes: "",
    emailEvents: [], createdAt: "2024-05-01T00:00:00Z", updatedAt: "2024-05-01T00:00:00Z",
  };
}

function seedResend() {
  settingsRepo.saveIntegrationSettings(USER, {
    resendApiKey: "re_test_key",
    senderEmail: "from@example.com",
  });
}

function stageEmailApproval(appId: string) {
  return queueApproval(USER, {
    kind: "recordSend",
    applicationId: appId,
    payload: {
      channel: "email",
      to: "recruiter@company.com",
      subject: "Application for PM role",
      html: "<p>Hello</p>",
    },
  });
}

// ---------------------------------------------------------------------------
// 1. Valid email approval → transport called exactly once, approval consumed
// ---------------------------------------------------------------------------
describe("valid email approval", () => {
  it("calls Resend transport exactly once and marks approval consumed", async () => {
    applicationRepo.save(USER, makeApp("app-email-1"));
    seedResend();

    const approvalId = stageEmailApproval("app-email-1");
    const resolved = resolveApproval(USER, approvalId, "approve");
    const token = resolved!.token!;

    const result = await executeApproval(USER, approvalId, token);

    expect(result.ok).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledOnce();

    const approval = approvalRepo.get(USER, approvalId);
    expect(approval!.status).toBe("consumed");
  });

  it("records the email event on the application after send", async () => {
    applicationRepo.save(USER, makeApp("app-email-2"));
    seedResend();

    const approvalId = stageEmailApproval("app-email-2");
    const resolved = resolveApproval(USER, approvalId, "approve");

    await executeApproval(USER, approvalId, resolved!.token!);

    const app = applicationRepo.getById(USER, "app-email-2")!;
    expect(app.emailEvents.length).toBeGreaterThan(0);
    expect(app.emailEvents.at(-1)).toMatchObject({
      channel: "email",
      to: "recruiter@company.com",
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Staged (pending, no approval yet) → transport not called
// ---------------------------------------------------------------------------
describe("staged approval — no human approval yet", () => {
  it("executor refuses pending approval; transport not called", async () => {
    applicationRepo.save(USER, makeApp("app-pending-1"));
    seedResend();

    const approvalId = stageEmailApproval("app-pending-1");
    // Do NOT resolve — approval stays pending.
    const result = await executeApproval(USER, approvalId, "fake-token");

    expect(result.ok).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();

    const approval = approvalRepo.get(USER, approvalId);
    expect(approval!.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// 3. Digest mismatch → transport not called, approval stays approved
// ---------------------------------------------------------------------------
describe("digest mismatch", () => {
  it("refuses to execute and does not consume when digest is corrupted", async () => {
    applicationRepo.save(USER, makeApp("app-digest-1"));
    seedResend();

    const approvalId = stageEmailApproval("app-digest-1");
    const resolved = resolveApproval(USER, approvalId, "approve");
    const token = resolved!.token!;

    // Corrupt the stored digest.
    getDb()
      .prepare("UPDATE approvals SET payload_digest = ? WHERE id = ?")
      .run("corrupted-digest-value", approvalId);

    const result = await executeApproval(USER, approvalId, token);

    expect(result.ok).toBe(false);
    expect((result as any).error).toMatch(/digest/i);
    expect(mockSendEmail).not.toHaveBeenCalled();

    // Approval must NOT be consumed — it stays retryable.
    const approval = approvalRepo.get(USER, approvalId);
    expect(approval!.status).toBe("approved");
    expect(approval!.consumedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. LinkedIn manual → transport never called, returns draft, consumed
// ---------------------------------------------------------------------------
describe("linkedin_manual channel", () => {
  it("never calls Resend and returns the draft message", async () => {
    applicationRepo.save(USER, makeApp("app-li-1"));
    seedResend();

    const approvalId = queueApproval(USER, {
      kind: "recordSend",
      applicationId: "app-li-1",
      payload: {
        channel: "linkedin_manual",
        draft: "Hi, I saw your opening and would love to connect.",
      },
    });
    const resolved = resolveApproval(USER, approvalId, "approve");

    const result = await executeApproval(USER, approvalId, resolved!.token!);

    expect(result.ok).toBe(true);
    expect(mockSendEmail).not.toHaveBeenCalled();
    if (result.ok) {
      const detail = result.detail as any;
      expect(detail.channel).toBe("linkedin_manual");
      expect(typeof detail.draft).toBe("string");
      expect(detail.draft.length).toBeGreaterThan(0);
    }
    const approval = approvalRepo.get(USER, approvalId);
    expect(approval!.status).toBe("consumed");
  });
});

// ---------------------------------------------------------------------------
// 5. Replay of an executed approval → no second send
// ---------------------------------------------------------------------------
describe("replay protection", () => {
  it("refuses to execute a consumed approval and does not call transport again", async () => {
    applicationRepo.save(USER, makeApp("app-replay-1"));
    seedResend();

    const approvalId = stageEmailApproval("app-replay-1");
    const resolved = resolveApproval(USER, approvalId, "approve");
    const token = resolved!.token!;

    // First execution succeeds.
    const first = await executeApproval(USER, approvalId, token);
    expect(first.ok).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledOnce();

    // Second attempt on the same consumed approval must be rejected.
    const second = await executeApproval(USER, approvalId, token);
    expect(second.ok).toBe(false);
    expect((second as any).error).toMatch(/already executed/i);

    // Transport called only once total.
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Failure-safe: send failure leaves approval retryable
// ---------------------------------------------------------------------------
describe("failure-safe on send error", () => {
  it("does not consume approval when Resend throws", async () => {
    applicationRepo.save(USER, makeApp("app-fail-1"));
    seedResend();
    mockSendEmail.mockRejectedValueOnce(new Error("Resend network error"));

    const approvalId = stageEmailApproval("app-fail-1");
    const resolved = resolveApproval(USER, approvalId, "approve");
    const token = resolved!.token!;

    const result = await executeApproval(USER, approvalId, token);

    expect(result.ok).toBe(false);
    expect((result as any).retryable).toBe(true);

    // Approval must still be "approved" — retryable.
    const approval = approvalRepo.get(USER, approvalId);
    expect(approval!.status).toBe("approved");
    expect(approval!.consumedAt).toBeNull();
  });
});
