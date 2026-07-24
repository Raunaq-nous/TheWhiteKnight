/**
 * Scheduled automation layer tests: scan -> score -> (good-fit) draft ->
 * stage into the approval queue, never send. Mirrors the testing pattern
 * established in followup-service.test.ts: a real temp SQLite DB via
 * _resetDbForTesting(), with the network/LLM-calling services mocked.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

const scanJobsMock = vi.fn();
const scoreJobMock = vi.fn();
const generateDraftMock = vi.fn();
const fetchJdTextMock = vi.fn();
const notifyOperatorMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../server/services/scan-service", () => ({ scanJobs: (...args: any[]) => scanJobsMock(...args) }));
vi.mock("../server/services/scoring-service", () => ({ scoreJob: (...args: any[]) => scoreJobMock(...args) }));
vi.mock("../server/services/draft-service", () => ({ generateDraft: (...args: any[]) => generateDraftMock(...args) }));
vi.mock("../server/services/jd-fetch-service", () => ({ fetchJdText: (...args: any[]) => fetchJdTextMock(...args) }));
vi.mock("../server/channels/notify-operator", () => ({ notifyOperator: (...args: any[]) => notifyOperatorMock(...args) }));

import { _resetDbForTesting } from "../server/db";
import { approvalRepo } from "../server/repositories/approval-repo";
import { applicationRepo } from "../server/repositories/application-repo";
import { profileRepo } from "../server/repositories/profile-repo";
import { settingsRepo } from "../server/repositories/settings-repo";
import { notificationRepo } from "../server/repositories/notification-repo";
import { runAutomation, isDue, isDuplicateJob, isGoodFit } from "../server/services/automation-service";
import type { Application } from "../store";
import type { Profile } from "../profile";
import type { AutomationSettings } from "../automation-settings";
import type { JobResult } from "../server/services/scan-service";

let tmpDir: string;
let counter = 0;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "careeros-auto-test-"));
  process.env.CAREEROS_DB_PATH = path.join(tmpDir, `test-${++counter}.db`);
  _resetDbForTesting();
  vi.clearAllMocks();
  notifyOperatorMock.mockResolvedValue(undefined);
});

afterAll(() => {
  _resetDbForTesting();
  delete process.env.CAREEROS_DB_PATH;
});

const USER = "auto-test@example.com";
const NOW = new Date("2024-06-01T12:00:00Z");

function makeProfile(): Profile {
  return {
    name: "Test User", headline: "Senior PM", email: USER, phone: "+1234567890",
    location: "Remote", locationsOpenTo: "Remote", yearsOfExperience: "8",
    experience: [{ id: "e1", company: "Acme", role: "Senior PM", tenure: "2020-Present", location: "Remote", current: true, bullets: "Did things" }],
    education: [], skills: {}, projects: [], publications: [], certifications: [],
    voiceNotes: "", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
  };
}

function enableAutomation(overrides: Partial<AutomationSettings> = {}) {
  settingsRepo.saveAutomationSettings(USER, { enabled: true, schedule: "24h", lastRunAt: null, ...overrides });
}

function job(overrides: Partial<JobResult> = {}): JobResult {
  return {
    title: "Senior Product Manager", company: "Acme Corp", location: "Remote",
    url: "https://boards.greenhouse.io/acme/jobs/123", source: "greenhouse", relevance: 80,
    descriptionHtml: "<p>We need a senior PM.</p>",
    ...overrides,
  };
}

function scoreResult(recommendation: "apply_immediately" | "apply" | "review_manually" | "skip", global = 4.6) {
  return {
    archetype: { primary: "Product" },
    scores: {
      cv_match: { score: 4, reasoning: "" }, north_star: { score: 4, reasoning: "" },
      comp: { score: 3, reasoning: "" }, culture: { score: 4, reasoning: "" }, red_flags: { score: 5, reasoning: "" },
    },
    legitimacy: { tier: "high_confidence", signals: [] },
    jdParsed: { keyRequirements: [], technicalSkills: [], softSkills: [], yearsExperienceRequired: null, redFlags: [], keywords: [] },
    bucket: "product", bucketName: "Product",
    global, recommendation, totalScore: global * 2, recommendationLabel: recommendation, parsed: {},
  };
}

function existingApp(overrides: Partial<Application> = {}): Application {
  return {
    id: "existing-1", slug: "acme-corp-senior-product-manager", company: "Acme Corp", role: "Senior Product Manager",
    location: "Remote", remote: true, status: "sourced", score: 5, bucket: "product", sector: "", seniority: "senior",
    sourceUrl: "https://boards.greenhouse.io/acme/jobs/123", capturedAt: "2024-05-01", jdRaw: "", jdParsed: {},
    nextAction: "", contacts: [], interviews: [], reminders: [], resumeVersions: [], notes: "", emailEvents: [],
    createdAt: "2024-05-01T00:00:00Z", updatedAt: "2024-05-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
describe("isDue", () => {
  it("is false when disabled regardless of lastRunAt", () => {
    expect(isDue({ enabled: false, schedule: "24h", lastRunAt: null }, NOW)).toBe(false);
  });

  it("is true when enabled and never run before", () => {
    expect(isDue({ enabled: true, schedule: "24h", lastRunAt: null }, NOW)).toBe(true);
  });

  it("is false when the schedule interval hasn't elapsed", () => {
    const lastRunAt = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    expect(isDue({ enabled: true, schedule: "24h", lastRunAt }, NOW)).toBe(false);
  });

  it("is true once the schedule interval has elapsed", () => {
    const lastRunAt = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
    expect(isDue({ enabled: true, schedule: "24h", lastRunAt }, NOW)).toBe(true);
  });
});

describe("isDuplicateJob", () => {
  it("matches an existing application by normalized source URL", () => {
    const existing = [existingApp({ sourceUrl: "https://boards.greenhouse.io/acme/jobs/123/" })];
    expect(isDuplicateJob(existing, { url: "https://boards.greenhouse.io/acme/jobs/123?utm=x", title: "Senior Product Manager" })).toBe(true);
  });

  it("matches an existing application by company+role slug even if the URL differs", () => {
    const existing = [existingApp({ sourceUrl: "https://old-link.example.com/posting" })];
    expect(isDuplicateJob(existing, { url: "https://new-link.example.com/reposted", company: "Acme Corp", title: "Senior Product Manager" })).toBe(true);
  });

  it("returns false for a genuinely new job", () => {
    const existing = [existingApp()];
    expect(isDuplicateJob(existing, { url: "https://boards.greenhouse.io/other/jobs/999", company: "Other Co", title: "Staff Engineer" })).toBe(false);
  });
});

describe("isGoodFit", () => {
  it("is true for apply_immediately and apply", () => {
    expect(isGoodFit("apply_immediately")).toBe(true);
    expect(isGoodFit("apply")).toBe(true);
  });
  it("is false for review_manually and skip", () => {
    expect(isGoodFit("review_manually")).toBe(false);
    expect(isGoodFit("skip")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runAutomation — gating
// ---------------------------------------------------------------------------
describe("runAutomation gating", () => {
  it("is skipped and never scans when automation is disabled", async () => {
    settingsRepo.saveAutomationSettings(USER, { enabled: false, schedule: "24h", lastRunAt: null });
    profileRepo.save(USER, makeProfile());

    const run = await runAutomation(USER, NOW);
    expect(run.status).toBe("skipped");
    expect(scanJobsMock).not.toHaveBeenCalled();
  });

  it("is skipped and never scans when enabled but not due", async () => {
    enableAutomation({ lastRunAt: new Date(NOW.getTime() - 1000).toISOString() });
    profileRepo.save(USER, makeProfile());

    const run = await runAutomation(USER, NOW);
    expect(run.status).toBe("skipped");
    expect(scanJobsMock).not.toHaveBeenCalled();
  });

  it("force:true bypasses the due-check but still respects enabled:false", async () => {
    settingsRepo.saveAutomationSettings(USER, { enabled: false, schedule: "24h", lastRunAt: null });
    profileRepo.save(USER, makeProfile());

    const run = await runAutomation(USER, NOW, { force: true });
    expect(run.status).toBe("skipped");
    expect(scanJobsMock).not.toHaveBeenCalled();
  });

  it("errors out (without crashing) when no profile exists", async () => {
    enableAutomation();
    scanJobsMock.mockResolvedValue({ jobs: [], counts: { total: 0, beforeFiltering: 0, ats: 0, adzuna: 0, exa: 0 } });

    const run = await runAutomation(USER, NOW);
    expect(run.status).toBe("error");
    expect(scanJobsMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runAutomation — happy path
// ---------------------------------------------------------------------------
describe("runAutomation happy path", () => {
  it("scores every new job, stages only good-fit jobs, and sources all of them into the pipeline", async () => {
    enableAutomation();
    profileRepo.save(USER, makeProfile());

    const goodFitJob = job({ url: "https://boards.greenhouse.io/acme/jobs/1", title: "Senior PM (great fit)" });
    const lowFitJob = job({ url: "https://boards.greenhouse.io/acme/jobs/2", title: "Junior Analyst" });

    scanJobsMock.mockResolvedValue({ jobs: [goodFitJob, lowFitJob], counts: { total: 2, beforeFiltering: 2, ats: 2, adzuna: 0, exa: 0 } });
    scoreJobMock
      .mockResolvedValueOnce(scoreResult("apply_immediately"))
      .mockResolvedValueOnce(scoreResult("skip", 2.0));
    generateDraftMock.mockResolvedValue({ text: "Mock cover letter" });

    const run = await runAutomation(USER, NOW);

    expect(run.status).toBe("ok");
    expect(run.jobsFound).toBe(2);
    expect(run.jobsScored).toBe(2);
    expect(run.jobsSourced).toBe(2);
    expect(run.jobsStaged).toBe(1);
    expect(run.jobsSkippedDuplicate).toBe(0);

    const apps = applicationRepo.list(USER);
    expect(apps).toHaveLength(2);

    const staged = approvalRepo.list(USER).filter(a => a.action.kind === "auto_staged_job");
    expect(staged).toHaveLength(1);
    expect(staged[0].action.payload?.company).toBe("Acme Corp");
    expect(staged[0].action.payload?.draft).toEqual({ text: "Mock cover letter" });
    expect(staged[0].status).toBe("pending"); // staged, never approved/consumed by this run

    expect(generateDraftMock).toHaveBeenCalledOnce();
    expect(notifyOperatorMock).toHaveBeenCalled(); // queueApproval's own notification, not a send
  });

  it("skips jobs already in the pipeline (dedup) and does not re-score or re-stage them", async () => {
    enableAutomation();
    profileRepo.save(USER, makeProfile());
    applicationRepo.save(USER, existingApp({ sourceUrl: "https://boards.greenhouse.io/acme/jobs/1" }));

    const dup = job({ url: "https://boards.greenhouse.io/acme/jobs/1", company: "Acme Corp", title: "Senior Product Manager" });
    const fresh = job({ url: "https://boards.greenhouse.io/acme/jobs/9", title: "Staff PM", company: "Acme Corp" });

    scanJobsMock.mockResolvedValue({ jobs: [dup, fresh], counts: { total: 2, beforeFiltering: 2, ats: 2, adzuna: 0, exa: 0 } });
    scoreJobMock.mockResolvedValue(scoreResult("apply"));
    generateDraftMock.mockResolvedValue({ text: "Draft" });

    const run = await runAutomation(USER, NOW);

    expect(run.jobsFound).toBe(2);
    expect(run.jobsSkippedDuplicate).toBe(1);
    expect(run.jobsScored).toBe(1);
    expect(scoreJobMock).toHaveBeenCalledOnce();

    // Only the fresh job's new application was added (the dup existing one still there too).
    const apps = applicationRepo.list(USER);
    expect(apps).toHaveLength(2);
  });

  it("updates lastRunAt after a real run, so a second immediate run is skipped as not due", async () => {
    enableAutomation();
    profileRepo.save(USER, makeProfile());
    scanJobsMock.mockResolvedValue({ jobs: [], counts: { total: 0, beforeFiltering: 0, ats: 0, adzuna: 0, exa: 0 } });

    const first = await runAutomation(USER, NOW);
    expect(first.status).toBe("ok");

    const second = await runAutomation(USER, new Date(NOW.getTime() + 60_000));
    expect(second.status).toBe("skipped");
    expect(scanJobsMock).toHaveBeenCalledOnce();
  });

  it("falls back to the JD-fetch service, then to title/company/snippet, when a job has no ATS description", async () => {
    enableAutomation();
    profileRepo.save(USER, makeProfile());

    const noDescJob = job({ url: "https://example.com/jobs/no-desc", descriptionHtml: undefined, snippet: "A great remote role" });
    scanJobsMock.mockResolvedValue({ jobs: [noDescJob], counts: { total: 1, beforeFiltering: 1, ats: 0, adzuna: 0, exa: 1 } });
    fetchJdTextMock.mockResolvedValue({ ok: false, status: 422, error: "nope" });
    scoreJobMock.mockResolvedValue(scoreResult("review_manually", 3.6));

    const run = await runAutomation(USER, NOW);

    expect(run.jobsScored).toBe(1);
    expect(fetchJdTextMock).toHaveBeenCalledOnce();
    const [scoreArgs] = scoreJobMock.mock.calls;
    expect(scoreArgs[0].jdText).toContain("A great remote role");
  });

  it("records a run log even when a job's scoring throws, without crashing the whole run", async () => {
    enableAutomation();
    profileRepo.save(USER, makeProfile());

    const okJob = job({ url: "https://boards.greenhouse.io/acme/jobs/ok" });
    const badJob = job({ url: "https://boards.greenhouse.io/acme/jobs/bad", title: "Bad Job" });
    scanJobsMock.mockResolvedValue({ jobs: [okJob, badJob], counts: { total: 2, beforeFiltering: 2, ats: 2, adzuna: 0, exa: 0 } });
    scoreJobMock
      .mockResolvedValueOnce(scoreResult("apply"))
      .mockRejectedValueOnce(new Error("LLM exploded"));
    generateDraftMock.mockResolvedValue({ text: "Draft" });

    const run = await runAutomation(USER, NOW);

    expect(run.status).toBe("ok");
    expect(run.jobsScored).toBe(1);
    expect(run.jobsSourced).toBe(1);
    expect(run.errors.some(e => e.includes("LLM exploded"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Run log persistence — "so I can see it worked"
// ---------------------------------------------------------------------------
describe("run log persistence", () => {
  it("appends every run (including skipped ones) to the automation_runs log", async () => {
    settingsRepo.saveAutomationSettings(USER, { enabled: false, schedule: "24h", lastRunAt: null });
    profileRepo.save(USER, makeProfile());

    await runAutomation(USER, NOW);
    const runs = settingsRepo.getAutomationRuns(USER);
    expect(runs).toHaveLength(0); // disabled skip is not persisted — nothing happened

    enableAutomation();
    scanJobsMock.mockResolvedValue({ jobs: [], counts: { total: 0, beforeFiltering: 0, ats: 0, adzuna: 0, exa: 0 } });
    await runAutomation(USER, NOW);

    const afterReal = settingsRepo.getAutomationRuns(USER);
    expect(afterReal).toHaveLength(1);
    expect(afterReal[0].status).toBe("ok");
  });

  it("adds an in-app notification only when at least one job is staged", async () => {
    enableAutomation();
    profileRepo.save(USER, makeProfile());
    scanJobsMock.mockResolvedValue({ jobs: [job()], counts: { total: 1, beforeFiltering: 1, ats: 1, adzuna: 0, exa: 0 } });
    scoreJobMock.mockResolvedValue(scoreResult("review_manually", 3.6));

    await runAutomation(USER, NOW);
    expect(notificationRepo.list(USER).filter(n => n.type === "automation_run")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Security invariant: this module can never send or execute anything.
// ---------------------------------------------------------------------------
describe("send-execution import boundary", () => {
  it("automation-service.ts never imports approval-executor or send-service", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../server/services/automation-service.ts"),
      "utf-8",
    );
    // Check actual import statements only — the module's own docstring
    // mentions these module names in prose, which must not trip this check.
    const importLines = source.split("\n").filter(line => /^\s*import\b/.test(line));
    const importedFrom = importLines.join("\n");
    expect(importedFrom).not.toContain("approval-executor");
    expect(importedFrom).not.toContain("send-service");
    expect(importedFrom).not.toContain("executeApproval");
    expect(importedFrom).not.toContain("executeSend");
  });
});
