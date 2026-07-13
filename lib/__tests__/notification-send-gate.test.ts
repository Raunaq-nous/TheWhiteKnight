/**
 * Regression test for the notification-bell send path.
 *
 * The bell used to POST straight to /api/send/email with a client-supplied
 * Resend key and send immediately on click. It now stages a "recordSend"
 * approval (via POST /api/approvals, same as app/notifications.tsx does) and
 * relies on the SAME executeApproval gate that /api/approvals/[id] uses.
 * /api/send/email itself now only re-executes an approval that is already
 * approved — it never sends on a bare client request.
 *
 * These tests exercise that gate directly (no HTTP layer, consistent with the
 * rest of the suite): staging must never itself trigger a send, and execution
 * must be refused until a human has approved the record.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

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

import { _resetDbForTesting } from "../server/db";
import { approvalRepo } from "../server/repositories/approval-repo";
import { settingsRepo } from "../server/repositories/settings-repo";
import { applicationRepo } from "../server/repositories/application-repo";
import { queueApproval, resolveApproval } from "../server/approval-gate";
import { executeApproval } from "../server/services/approval-executor";
import type { Application } from "../store";

let tmpDir: string;
let counter = 0;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "careeros-notif-gate-test-"));
  process.env.CAREEROS_DB_PATH = path.join(tmpDir, `test-${++counter}.db`);
  _resetDbForTesting();
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue({ messageId: "mock-msg-id" });
});

afterAll(() => {
  _resetDbForTesting();
  delete process.env.CAREEROS_DB_PATH;
});

const USER = "bell-test@example.com";

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

// Mirrors what app/notifications.tsx's stageEmailForApproval() sends to
// POST /api/approvals.
function stageBellSend(appId: string) {
  return queueApproval(USER, {
    kind: "recordSend",
    applicationId: appId,
    payload: {
      channel: "email",
      to: "hiring.manager@company.com",
      subject: "Following up on the PM role",
      html: "<p>Hi there</p>",
      text: "Hi there",
    },
  });
}

describe("notification bell no longer sends without an approval", () => {
  it("staging an outreach email does not itself call the send transport", () => {
    applicationRepo.save(USER, makeApp("bell-1"));
    settingsRepo.saveIntegrationSettings(USER, { resendApiKey: "re_test", senderEmail: "from@example.com" });

    const approvalId = stageBellSend("bell-1");
    const approval = approvalRepo.get(USER, approvalId);

    expect(approval).toBeDefined();
    expect(approval!.status).toBe("pending");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("refuses to execute a staged-but-unapproved bell send (the /api/send/email guard)", async () => {
    applicationRepo.save(USER, makeApp("bell-2"));
    settingsRepo.saveIntegrationSettings(USER, { resendApiKey: "re_test", senderEmail: "from@example.com" });

    const approvalId = stageBellSend("bell-2");
    const approval = approvalRepo.get(USER, approvalId)!;

    // This is exactly the check /api/send/email/route.ts now performs before
    // it will call executeApproval at all.
    expect(approval.status).not.toBe("approved");

    // Even if something bypassed that guard and called executeApproval directly
    // with a bogus/absent token, the executor itself must still refuse.
    const result = await executeApproval(USER, approvalId, approval.token ?? "no-token");
    expect(result.ok).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("only sends after a human approves the staged record, exactly like the proper path", async () => {
    applicationRepo.save(USER, makeApp("bell-3"));
    settingsRepo.saveIntegrationSettings(USER, { resendApiKey: "re_test", senderEmail: "from@example.com" });

    const approvalId = stageBellSend("bell-3");

    // Human approves on /approvals.
    const resolved = resolveApproval(USER, approvalId, "approve");
    expect(resolved!.status).toBe("approved");

    const result = await executeApproval(USER, approvalId, resolved!.token!);
    expect(result.ok).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
