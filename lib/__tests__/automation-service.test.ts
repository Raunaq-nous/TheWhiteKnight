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
import { runAutomation, isDue, isDuplicateJob, isGoodFit, resolveJobCap } from "../server/services/automation-service";
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
  settingsRepo.saveAutomationSettings(USER, { enabled: true, schedule: "24h", lastRunAt: null, maxJobsPerRun: 8, ...overrides });
}

// All test runs pass interJobDelayMs: 0 so the suite doesn't spend real
// wall-clock time on the deliberate rate-limit delay between jobs.
function runOnce(userEmail: string, now: Date, opts: { force?: boolean } = {}) {
  return runAutomation(userEmail, now, { ...opts, interJobDelayMs: 0 });
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

describe("resolveJobCap — rate-limit safety", () => {
  it("uses the configured value when it's sane", () => {
    expect(resolveJobCap(5)).toBe(5);
  });

  it("falls back to the default when undefined", () => {
    expect(resolveJobCap(undefined)).toBe(8);
  });

  it("clamps a misconfigured huge value down to the hard ceiling", () => {
    expect(resolveJobCap(10_000)).toBe(25);
  });

  it("clamps zero or negative values up to at least 1", () => {
    expect(resolveJobCap(0)).toBeGreaterThanOrEqual(1);
    expect(resolveJobCap(-5)).toBeGreaterThanOrEqual(1);
  });

  it("never returns something a caller could use to exceed the ceiling", () => {
    for (const v of [26, 100, 1_000_000]) {
      expect(resolveJobCap(v)).toBeLessThanOrEqual(25);
    }
  });
});

// ---------------------------------------------------------------------------
// runAutomation — gating
// ---------------------------------------------------------------------------
describe("runAutomation gating", () => {
  it("is skipped and never scans when automation is disabled", async () => {
    settingsRepo.saveAutomationSettings(USER, { enabled: false, schedule: "24h", lastRunAt: null, maxJobsPerRun: 8 });
    profileRepo.save(USER, makeProfile());

    const run = await runOnce(USER, NOW);
    expect(run.status).toBe("skipped");
    expect(scanJobsMock).not.toHaveBeenCalled();
  });

  it("is skipped and never scans when enabled but not due", async () => {
    enableAutomation({ lastRunAt: new Date(NOW.getTime() - 1000).toISOString() });
    profileRepo.save(USER, makeProfile());

    const run = await runOnce(USER, NOW);
    expect(run.status).toBe("skipped");
    expect(scanJobsMock).not.toHaveBeenCalled();
  });

  it("force:true bypasses the due-check but still respects enabled:false", async () => {
    settingsRepo.saveAutomationSettings(USER, { enabled: false, schedule: "24h", lastRunAt: null, maxJobsPerRun: 8 });
    profileRepo.save(USER, makeProfile());

    const run = await runOnce(USER, NOW, { force: true });
    expect(run.status).toBe("skipped");
    expect(scanJobsMock).not.toHaveBeenCalled();
  });

  it("errors out (without crashing) when no profile exists", async () => {
    enableAutomation();
    scanJobsMock.mockResolvedValue({ jobs: [], counts: { total: 0, beforeFiltering: 0, ats: 0, adzuna: 0, exa: 0 } });

    const run = await runOnce(USER, NOW);
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

    const run = await runOnce(USER, NOW);

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

    const run = await runOnce(USER, NOW);

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

    const first = await runOnce(USER, NOW);
    expect(first.status).toBe("ok");

    const second = await runOnce(USER, new Date(NOW.getTime() + 60_000));
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

    const run = await runOnce(USER, NOW);

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

    const run = await runOnce(USER, NOW);

    expect(run.status).toBe("ok");
    expect(run.jobsScored).toBe(1);
    expect(run.errors.some(e => e.includes("LLM exploded"))).toBe(true);
  });

  it("keeps a job whose scoring throws — saved as unscored, not silently dropped (the aravindpranav/job-agent pattern)", async () => {
    enableAutomation();
    profileRepo.save(USER, makeProfile());

    const okJob = job({ url: "https://boards.greenhouse.io/acme/jobs/ok" });
    const badJob = job({ url: "https://boards.greenhouse.io/acme/jobs/bad", title: "Bad Job" });
    scanJobsMock.mockResolvedValue({ jobs: [okJob, badJob], counts: { total: 2, beforeFiltering: 2, ats: 2, adzuna: 0, exa: 0 } });
    scoreJobMock
      .mockResolvedValueOnce(scoreResult("apply"))
      .mockRejectedValueOnce(new Error("deepseek-ai/DeepSeek-V4-Pro returned empty content"));
    generateDraftMock.mockResolvedValue({ text: "Draft" });

    const run = await runOnce(USER, NOW);

    // Both jobs are sourced (saved to the ledger) — the bad one unscored,
    // never staged, but still visible for manual review, not lost.
    expect(run.jobsSourced).toBe(2);
    expect(run.jobsUnscored).toBe(1);
    expect(run.jobsScored).toBe(1);
    expect(run.jobsStaged).toBe(1); // only the successfully-scored, good-fit job gets staged

    const saved = applicationRepo.list(USER);
    expect(saved).toHaveLength(2);
    const unscored = saved.find(a => a.role === "Bad Job")!;
    expect(unscored.score).toBe(0);
    expect(unscored.bucket).toBe("unscored");
    expect(unscored.afScore).toBeUndefined();
    expect(unscored.jdRaw).toBeTruthy(); // JD text was still resolved and kept
    expect(unscored.nextAction).toContain("review");
  });
});

// ---------------------------------------------------------------------------
// Per-run cap + resumability — a run must never exceed the configured cap,
// and whatever it leaves unprocessed must get picked up by the next run.
// ---------------------------------------------------------------------------
describe("per-run cap and resumability", () => {
  it("never scores/drafts more than maxJobsPerRun new jobs in a single invocation", async () => {
    enableAutomation({ maxJobsPerRun: 2 });
    profileRepo.save(USER, makeProfile());

    const jobs = [1, 2, 3, 4, 5].map(n => job({ url: `https://boards.greenhouse.io/acme/jobs/${n}`, title: `Role ${n}` }));
    scanJobsMock.mockResolvedValue({ jobs, counts: { total: 5, beforeFiltering: 5, ats: 5, adzuna: 0, exa: 0 } });
    scoreJobMock.mockResolvedValue(scoreResult("review_manually", 3.6));

    const run = await runOnce(USER, NOW);

    expect(run.jobsFound).toBe(5);
    expect(run.jobsScored).toBe(2); // capped, not 5
    expect(run.jobsSourced).toBe(2);
    expect(scoreJobMock).toHaveBeenCalledTimes(2);
    expect(applicationRepo.list(USER)).toHaveLength(2);
  });

  it("a misconfigured huge cap is still clamped to the safety ceiling inside a real run", async () => {
    enableAutomation({ maxJobsPerRun: 999 });
    profileRepo.save(USER, makeProfile());

    const jobs = Array.from({ length: 30 }, (_, i) => job({ url: `https://boards.greenhouse.io/acme/jobs/${i}`, title: `Role ${i}` }));
    scanJobsMock.mockResolvedValue({ jobs, counts: { total: 30, beforeFiltering: 30, ats: 30, adzuna: 0, exa: 0 } });
    scoreJobMock.mockResolvedValue(scoreResult("review_manually", 3.6));

    const run = await runOnce(USER, NOW);
    expect(run.jobsScored).toBeLessThanOrEqual(25); // MAX_JOBS_PER_RUN_CEILING
  });

  it("picks up the jobs left over from a capped run on the NEXT run, via the same ledger — no extra bookkeeping needed", async () => {
    enableAutomation({ maxJobsPerRun: 2, schedule: "6h" });
    profileRepo.save(USER, makeProfile());

    const jobs = [1, 2, 3].map(n => job({ url: `https://boards.greenhouse.io/acme/jobs/${n}`, title: `Role ${n}` }));
    scanJobsMock.mockResolvedValue({ jobs, counts: { total: 3, beforeFiltering: 3, ats: 3, adzuna: 0, exa: 0 } });
    scoreJobMock.mockResolvedValue(scoreResult("review_manually", 3.6));

    const firstRun = await runOnce(USER, NOW);
    expect(firstRun.jobsScored).toBe(2);
    expect(firstRun.jobsSkippedDuplicate).toBe(0); // nothing was in the pipeline yet

    // Same scan result returned again (the 3rd posting is still live) — next
    // scheduled run, 6h later.
    const later = new Date(NOW.getTime() + 7 * 60 * 60 * 1000);
    const secondRun = await runOnce(USER, later);

    // The first run's 2 jobs are now in the ledger, so this run only sees
    // job 3 as new. Resumed, not lost, and not rescored.
    expect(secondRun.jobsFound).toBe(3);
    expect(secondRun.jobsSkippedDuplicate).toBe(2);
    expect(secondRun.jobsScored).toBe(1);
    expect(applicationRepo.list(USER)).toHaveLength(3); // all 3 eventually landed in the pipeline
  });

  it("processes jobs sequentially, never concurrently (never more than one in-flight score call)", async () => {
    enableAutomation({ maxJobsPerRun: 3 });
    profileRepo.save(USER, makeProfile());

    const jobs = [1, 2, 3].map(n => job({ url: `https://boards.greenhouse.io/acme/jobs/${n}`, title: `Role ${n}` }));
    scanJobsMock.mockResolvedValue({ jobs, counts: { total: 3, beforeFiltering: 3, ats: 3, adzuna: 0, exa: 0 } });

    let inFlight = 0;
    let maxInFlight = 0;
    scoreJobMock.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
      return scoreResult("review_manually", 3.6);
    });

    await runOnce(USER, NOW);
    expect(maxInFlight).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Run log persistence — "so I can see it worked"
// ---------------------------------------------------------------------------
describe("run log persistence", () => {
  it("appends every run (including skipped ones) to the automation_runs log", async () => {
    settingsRepo.saveAutomationSettings(USER, { enabled: false, schedule: "24h", lastRunAt: null, maxJobsPerRun: 8 });
    profileRepo.save(USER, makeProfile());

    await runOnce(USER, NOW);
    const runs = settingsRepo.getAutomationRuns(USER);
    expect(runs).toHaveLength(0); // disabled skip is not persisted — nothing happened

    enableAutomation();
    scanJobsMock.mockResolvedValue({ jobs: [], counts: { total: 0, beforeFiltering: 0, ats: 0, adzuna: 0, exa: 0 } });
    await runOnce(USER, NOW);

    const afterReal = settingsRepo.getAutomationRuns(USER);
    expect(afterReal).toHaveLength(1);
    expect(afterReal[0].status).toBe("ok");
  });

  it("adds an in-app notification only when at least one job is staged", async () => {
    enableAutomation();
    profileRepo.save(USER, makeProfile());
    scanJobsMock.mockResolvedValue({ jobs: [job()], counts: { total: 1, beforeFiltering: 1, ats: 1, adzuna: 0, exa: 0 } });
    scoreJobMock.mockResolvedValue(scoreResult("review_manually", 3.6));

    await runOnce(USER, NOW);
    expect(notificationRepo.list(USER).filter(n => n.type === "automation_run")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Security invariant: this module can never send or execute anything.
// ---------------------------------------------------------------------------
describe("send-execution import boundary — the property that matters most", () => {
  // Static, source-level regression guard: the autopilot module must import
  // NO send/submit/approve-executing function, ever. This is deliberately a
  // whitelist-by-exclusion check on the actual import statements (not just
  // two hardcoded names) so a future edit that imports a new send/submit/
  // execute-shaped helper fails this test even if nobody remembers to update
  // it by name.
  const FORBIDDEN_IMPORT_PATTERNS = [
    /approval-executor/i,
    /send-service/i,
    /email-channel/i,
    /executeApproval/,
    /executeSend/,
    /resolveApproval/,
    /\bsendEmail\b/,
    /\bsubmitApplication\b/,
  ];

  function importStatementsOf(relativePath: string): string {
    const source = fs.readFileSync(path.join(__dirname, relativePath), "utf-8");
    // Only actual import statements — the module's own docstring discusses
    // these same module/function names in prose, which must not trip this.
    return source.split("\n").filter(line => /^\s*import\b/.test(line)).join("\n");
  }

  it("automation-service.ts imports no send/submit/approve-executing function", () => {
    const importedFrom = importStatementsOf("../server/services/automation-service.ts");
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(importedFrom).not.toMatch(pattern);
    }
    // Sanity check the check itself isn't vacuous — approval-gate (stage-only,
    // allowed) must still be imported.
    expect(importedFrom).toMatch(/approval-gate/);
  });

  it("queueApproval is the ONLY approval-system call anywhere in the file, and it lives in autopilotStage", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../server/services/automation-service.ts"),
      "utf-8",
    );
    const queueApprovalCalls = source.match(/queueApproval\(/g) ?? [];
    expect(queueApprovalCalls.length).toBe(1);

    const stageFnMatch = source.match(/async function autopilotStage\([\s\S]*?\n}/);
    expect(stageFnMatch).not.toBeNull();
    expect(stageFnMatch![0]).toContain("queueApproval(");
  });
});
