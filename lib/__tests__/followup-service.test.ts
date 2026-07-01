/**
 * Phase 4b follow-up service tests.
 *
 * generateDraft and notifyOperator are mocked so no LLM calls or emails fire.
 * All approval state is verified directly against the real SQLite layer.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

// Hoist mocks before any imports that would resolve the real modules.
vi.mock("../server/services/draft-service", () => ({
  generateDraft: vi.fn().mockResolvedValue({ text: "Mock follow-up draft" }),
}));

vi.mock("../server/channels/notify-operator", () => ({
  notifyOperator: vi.fn().mockResolvedValue(undefined),
}));

import { _resetDbForTesting } from "../server/db";
import { approvalRepo } from "../server/repositories/approval-repo";
import { applicationRepo } from "../server/repositories/application-repo";
import { profileRepo } from "../server/repositories/profile-repo";
import { runDueFollowUps } from "../server/services/followup-service";
import type { Application } from "../store";
import type { Profile } from "../profile";

let tmpDir: string;
let counter = 0;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "careeros-fu-test-"));
  process.env.CAREEROS_DB_PATH = path.join(tmpDir, `test-${++counter}.db`);
  _resetDbForTesting();
  vi.clearAllMocks();
});

afterAll(() => {
  _resetDbForTesting();
  delete process.env.CAREEROS_DB_PATH;
});

const USER = "fu-test@example.com";
const NOW = new Date("2024-06-01T12:00:00Z");
const PAST = "2024-05-30T10:00:00Z";
const FUTURE = "2024-06-05T10:00:00Z";

function makeApp(id: string): Application {
  return {
    id,
    slug: `test-app-${id}`,
    company: "Acme Corp",
    role: "Senior PM",
    location: "Remote",
    remote: true,
    status: "applied",
    score: 7,
    bucket: "product",
    sector: "tech",
    seniority: "senior",
    sourceUrl: "https://example.com/job",
    capturedAt: "2024-05-01",
    jdRaw: "Build great products.",
    jdParsed: {},
    nextAction: "Follow up",
    contacts: [],
    interviews: [],
    reminders: [],
    resumeVersions: [],
    notes: "",
    emailEvents: [],
    createdAt: "2024-05-01T00:00:00Z",
    updatedAt: "2024-05-01T00:00:00Z",
  };
}

function makeProfile(): Profile {
  return {
    name: "Test User",
    headline: "PM",
    email: USER,
    phone: "+1234567890",
    location: "Remote",
    locationsOpenTo: "Remote",
    yearsOfExperience: "5",
    experience: [],
    education: [],
    skills: {},
    projects: [],
    publications: [],
    certifications: [],
    voiceNotes: "",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };
}

function seedApp(id: string) {
  applicationRepo.save(USER, makeApp(id));
}

function seedProfile() {
  profileRepo.save(USER, makeProfile());
}

function scheduleFollowUp(applicationId: string, when: string, note = ""): string {
  return approvalRepo.create(USER, {
    kind: "follow_up",
    applicationId,
    payload: { when, note },
  });
}

// ---------------------------------------------------------------------------
// Due selection
// ---------------------------------------------------------------------------
describe("due selection", () => {
  it("processes a follow_up whose when is in the past", async () => {
    seedApp("app-1");
    seedProfile();
    scheduleFollowUp("app-1", PAST);

    const result = await runDueFollowUps(USER, NOW);
    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("does not process a follow_up whose when is in the future", async () => {
    seedApp("app-2");
    seedProfile();
    scheduleFollowUp("app-2", FUTURE);

    const result = await runDueFollowUps(USER, NOW);
    expect(result.processed).toBe(0);
  });

  it("skips a follow_up whose applicationId no longer exists", async () => {
    seedProfile();
    scheduleFollowUp("nonexistent-app", PAST);

    const result = await runDueFollowUps(USER, NOW);
    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(0);
  });

  it("skips when no profile is present", async () => {
    seedApp("app-3");
    scheduleFollowUp("app-3", PAST);

    const result = await runDueFollowUps(USER, NOW);
    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Idempotency — second run is a no-op
// ---------------------------------------------------------------------------
describe("idempotency", () => {
  it("second call with same now processes nothing (original consumed)", async () => {
    seedApp("app-idem");
    seedProfile();
    scheduleFollowUp("app-idem", PAST);

    const first = await runDueFollowUps(USER, NOW);
    expect(first.processed).toBe(1);

    const second = await runDueFollowUps(USER, NOW);
    expect(second.processed).toBe(0);
    expect(second.skipped).toBe(0);
  });

  it("only one follow_up_draft approval exists after two runs", async () => {
    seedApp("app-idem2");
    seedProfile();
    scheduleFollowUp("app-idem2", PAST);

    await runDueFollowUps(USER, NOW);
    await runDueFollowUps(USER, NOW);

    const drafts = approvalRepo.list(USER).filter(a => a.action.kind === "follow_up_draft");
    expect(drafts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Draft attached and original consumed
// ---------------------------------------------------------------------------
describe("draft approval created", () => {
  it("creates a pending follow_up_draft approval containing the draft", async () => {
    seedApp("app-draft");
    seedProfile();
    const fuId = scheduleFollowUp("app-draft", PAST, "Check in about the PM role");

    await runDueFollowUps(USER, NOW);

    const draft = approvalRepo.list(USER).find(a => a.action.kind === "follow_up_draft");
    expect(draft).toBeDefined();
    expect(draft!.status).toBe("pending");
    expect(draft!.action.applicationId).toBe("app-draft");
    expect(draft!.action.payload?.sourceApprovalId).toBe(fuId);
    expect(draft!.action.payload?.draft).toEqual({ text: "Mock follow-up draft" });
  });

  it("draft approval has a payload_digest set", async () => {
    seedApp("app-digest");
    seedProfile();
    scheduleFollowUp("app-digest", PAST);

    await runDueFollowUps(USER, NOW);

    const draft = approvalRepo.list(USER).find(a => a.action.kind === "follow_up_draft");
    expect(draft?.payloadDigest).toBeTruthy();
    expect(draft!.payloadDigest!.length).toBe(64);
  });

  it("original follow_up is consumed after processing", async () => {
    seedApp("app-consumed");
    seedProfile();
    const fuId = scheduleFollowUp("app-consumed", PAST);

    await runDueFollowUps(USER, NOW);

    const original = approvalRepo.list(USER).find(a => a.id === fuId);
    expect(original?.status).toBe("consumed");
  });
});

// ---------------------------------------------------------------------------
// Approval staged but never executed, zero sends
// ---------------------------------------------------------------------------
describe("no execution, no sends", () => {
  it("follow_up_draft approval status is pending (never approved or consumed)", async () => {
    seedApp("app-nostage");
    seedProfile();
    scheduleFollowUp("app-nostage", PAST);

    await runDueFollowUps(USER, NOW);

    const draft = approvalRepo.list(USER).find(a => a.action.kind === "follow_up_draft");
    expect(draft!.status).toBe("pending");
    expect(draft!.consumedAt).toBeNull();
    expect(draft!.resolvedAt).toBeNull();
  });

  it("notifyOperator is called (operator gets notified) but no Resend HTTP call occurs", async () => {
    const { notifyOperator } = await import("../server/channels/notify-operator");
    seedApp("app-notify");
    seedProfile();
    scheduleFollowUp("app-notify", PAST);

    await runDueFollowUps(USER, NOW);

    // notifyOperator was called (operator notification), but it is the mock — no real send.
    expect(notifyOperator).toHaveBeenCalled();
  });

  it("generateDraft is called exactly once per due follow_up", async () => {
    const { generateDraft } = await import("../server/services/draft-service");
    seedApp("app-once");
    seedProfile();
    scheduleFollowUp("app-once", PAST);

    await runDueFollowUps(USER, NOW);

    expect(generateDraft).toHaveBeenCalledOnce();
  });
});
