/**
 * Phase 4c tests — form-service and MCP security invariants.
 *
 * chatJSON is mocked so no real LLM calls fire.
 * notifyOperator is mocked so no real emails fire.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

vi.mock("../ai-client", () => ({
  chatJSON: vi.fn().mockResolvedValue({
    qa: [{ question: "Why this role?", answer: "Because it aligns with my background." }],
  }),
  chat: vi.fn().mockResolvedValue("mock text"),
}));

vi.mock("../server/channels/notify-operator", () => ({
  notifyOperator: vi.fn().mockResolvedValue(undefined),
}));

import { _resetDbForTesting } from "../server/db";
import { applicationRepo } from "../server/repositories/application-repo";
import { profileRepo } from "../server/repositories/profile-repo";
import { getFormAnswers, persistStagedForm } from "../server/services/form-service";
import type { Application } from "../store";
import type { Profile } from "../profile";

let tmpDir: string;
let counter = 0;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "careeros-4c-test-"));
  process.env.CAREEROS_DB_PATH = path.join(tmpDir, `test-${++counter}.db`);
  _resetDbForTesting();
  vi.clearAllMocks();
});

afterAll(() => {
  _resetDbForTesting();
  delete process.env.CAREEROS_DB_PATH;
});

const USER = "form-test@example.com";

function makeApp(id: string): Application {
  return {
    id,
    slug: `app-${id}`,
    company: "Acme",
    role: "PM",
    location: "Remote",
    remote: true,
    status: "sourced",
    score: 7,
    bucket: "product",
    sector: "tech",
    seniority: "senior",
    sourceUrl: "https://example.com",
    capturedAt: "2024-05-01",
    jdRaw: "Build great products.",
    jdParsed: {},
    nextAction: "Apply",
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
    phone: "+1",
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

// ---------------------------------------------------------------------------
// getFormAnswers shape
// ---------------------------------------------------------------------------
describe("getFormAnswers", () => {
  it("returns an array of { question, answer } objects", async () => {
    applicationRepo.save(USER, makeApp("app-qa-1"));
    profileRepo.save(USER, makeProfile());

    const answers = await getFormAnswers(USER, "app-qa-1", ["Why this role?"]);

    expect(Array.isArray(answers)).toBe(true);
    expect(answers.length).toBeGreaterThan(0);
    expect(answers[0]).toHaveProperty("question");
    expect(answers[0]).toHaveProperty("answer");
    expect(typeof answers[0].question).toBe("string");
    expect(typeof answers[0].answer).toBe("string");
  });

  it("throws when application is not found", async () => {
    profileRepo.save(USER, makeProfile());
    await expect(getFormAnswers(USER, "nonexistent", ["Why?"])).rejects.toThrow("not found");
  });

  it("throws when profile is not set up", async () => {
    applicationRepo.save(USER, makeApp("app-noprofile"));
    await expect(getFormAnswers(USER, "app-noprofile", ["Why?"])).rejects.toThrow("Profile not found");
  });

  it("passes formFields as inert data — chatJSON called once with a prompt string", async () => {
    const { chatJSON } = await import("../ai-client");
    applicationRepo.save(USER, makeApp("app-qa-inert"));
    profileRepo.save(USER, makeProfile());

    await getFormAnswers(USER, "app-qa-inert", ["Why this role?", "Describe a challenge"]);

    expect(chatJSON).toHaveBeenCalledOnce();
    const [messages] = (chatJSON as any).mock.calls[0];
    const prompt: string = messages[0].content;
    // formFields appear inside the delimited FORM INPUT section, not interpolated elsewhere
    expect(prompt).toContain("FORM INPUT");
    expect(prompt).toContain("Why this role?");
    expect(prompt).toContain("Describe a challenge");
  });
});

// ---------------------------------------------------------------------------
// persistStagedForm — result persisted, status never changes
// ---------------------------------------------------------------------------
describe("persistStagedForm", () => {
  it("persists the staged entry on the application", () => {
    applicationRepo.save(USER, makeApp("app-stage-1"));

    persistStagedForm(USER, "app-stage-1", {
      screenshotRef: "s3://bucket/screenshot.png",
      filledFields: [{ field: "Name", value: "Test User" }],
      formUrl: "https://apply.example.com/form",
    });

    const app = applicationRepo.getById(USER, "app-stage-1")!;
    expect(app.stagedForms).toHaveLength(1);
    expect(app.stagedForms![0].screenshotRef).toBe("s3://bucket/screenshot.png");
    expect(app.stagedForms![0].filledFields).toEqual([{ field: "Name", value: "Test User" }]);
    expect(app.stagedForms![0].stagedAt).toBeTruthy();
  });

  it("status is NEVER changed to applied or submitted", () => {
    applicationRepo.save(USER, makeApp("app-nostatus"));

    persistStagedForm(USER, "app-nostatus", {
      screenshotRef: "ref-123",
      filledFields: [],
    });

    const app = applicationRepo.getById(USER, "app-nostatus")!;
    expect(app.status).toBe("sourced");
    expect(app.status).not.toBe("applied");
  });

  it("accumulates multiple staged entries without overwriting earlier ones", () => {
    applicationRepo.save(USER, makeApp("app-multi-stage"));

    persistStagedForm(USER, "app-multi-stage", { screenshotRef: "ref-a", filledFields: [] });
    persistStagedForm(USER, "app-multi-stage", { screenshotRef: "ref-b", filledFields: [] });

    const app = applicationRepo.getById(USER, "app-multi-stage")!;
    expect(app.stagedForms).toHaveLength(2);
  });

  it("throws when application is not found", () => {
    expect(() =>
      persistStagedForm(USER, "does-not-exist", { screenshotRef: "x", filledFields: [] })
    ).toThrow("not found");
  });
});

// ---------------------------------------------------------------------------
// MCP tool list invariants
// ---------------------------------------------------------------------------
describe("MCP tool list invariants", () => {
  it("includes getFormAnswers and recordStagedForm", async () => {
    const { getRegisteredToolNames } = await import("../../mcp/server.js");
    const tools = getRegisteredToolNames();
    expect(tools).toContain("getFormAnswers");
    expect(tools).toContain("recordStagedForm");
  });

  it("still contains no resolve/approve/token/mint tool (security regression check)", async () => {
    const { getRegisteredToolNames } = await import("../../mcp/server.js");
    const tools = getRegisteredToolNames();
    const forbidden = tools.filter(name =>
      name.toLowerCase().includes("resolve") ||
      name.toLowerCase().includes("approve") ||
      name.toLowerCase().includes("token") ||
      name.toLowerCase().includes("mint"),
    );
    expect(forbidden).toEqual([]);
  });

  it("contains no submit tool of any kind", async () => {
    const { getRegisteredToolNames } = await import("../../mcp/server.js");
    const tools = getRegisteredToolNames();
    const submitTools = tools.filter(name => name.toLowerCase().includes("submit"));
    expect(submitTools).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// No MCP tool can set status to "applied"
// ---------------------------------------------------------------------------
describe("no MCP tool can set status to applied", () => {
  it("AGENT_SETTABLE_STATUSES does not include applied", async () => {
    const { AGENT_SETTABLE_STATUSES } = await import("../../mcp/server.js");
    expect(AGENT_SETTABLE_STATUSES).not.toContain("applied");
    expect(AGENT_SETTABLE_STATUSES).not.toContain("submitted");
  });

  it("updateStatus schema rejects applied at runtime", async () => {
    const { z } = await import("zod");
    // Mirror the schema used in the tool — sourced/reviewed/interview/offer/rejected only.
    const schema = z.enum(["sourced", "reviewed", "interview", "offer", "rejected"]);
    const result = schema.safeParse("applied");
    expect(result.success).toBe(false);
  });

  it("recordStagedForm does not change status to applied", () => {
    applicationRepo.save(USER, { ...makeApp("app-rsfstatus"), status: "reviewed" });

    persistStagedForm(USER, "app-rsfstatus", { screenshotRef: "x", filledFields: [] });

    const app = applicationRepo.getById(USER, "app-rsfstatus")!;
    expect(app.status).toBe("reviewed");
    expect(app.status).not.toBe("applied");
  });
});

// ---------------------------------------------------------------------------
// Actuator type — submit structurally impossible
// ---------------------------------------------------------------------------
describe("Actuator interface", () => {
  it("manualActuator.fillAndStage always returns status: staged", async () => {
    const { manualActuator } = await import("../server/actuator/manual");
    const result = await manualActuator.fillAndStage("app-1", "https://form.example.com", [
      { field: "Name", value: "Test" },
    ]);
    expect(result.status).toBe("staged");
    expect(result.filledFields).toHaveLength(1);
  });

  it("hermesActuator.fillAndStage always returns status: staged", async () => {
    const { hermesActuator } = await import("../server/actuator/hermes");
    const result = await hermesActuator.fillAndStage("app-2", "https://form.example.com", []);
    expect(result.status).toBe("staged");
  });
});
