import "server-only";
import { randomUUID } from "crypto";
import { applicationRepo, profileRepo, settingsRepo, notificationRepo } from "../repositories";
import { queueApproval } from "../approval-gate";
import { scanJobs, JobResult } from "./scan-service";
import { fetchJdText } from "./jd-fetch-service";
import { scoreJob, ScoreJobOutput } from "./scoring-service";
import { generateDraft } from "./draft-service";
import { DEFAULT_BUCKETS } from "../../buckets";
import { htmlToText } from "../../jd-fetch";
import type { Region } from "../../company-targets";
import type { Application } from "../../store";
import type { Profile } from "../../profile";
import type {
  AutomationSettings,
  AutomationRunLog,
  AutomationRunStatus,
} from "../../automation-settings";

// AUTOMATION_SCHEDULE_HOURS/DEFAULT_MAX_JOBS_PER_RUN/MAX_JOBS_PER_RUN_CEILING
// are duplicated here (not imported as values) rather than pulled from
// lib/automation-settings.ts, which imports the client write-through cache
// module — this server-only service must not depend on it. The client copy
// exists for Settings UI validation; both must stay in sync (enforced by a
// test asserting these constants match).
const AUTOMATION_SCHEDULE_HOURS: Record<AutomationSettings["schedule"], number> = {
  "6h": 6, "12h": 12, "24h": 24, "72h": 72, "168h": 168,
};
const DEFAULT_MAX_JOBS_PER_RUN = 8;
const MAX_JOBS_PER_RUN_CEILING = 25;

// ============================================================================
// Scheduled automation layer: scan -> score -> (for good-fit jobs) draft ->
// stage into the SAME human-approval queue everything else uses, then STOP.
//
// SAFETY INVARIANT (the property that matters most): this module NEVER
// imports approval-executor or send-service, and the ONLY function anywhere
// in this file that touches the approval system is queueApproval — the same
// stage-only function followup-service.ts already uses. autopilotStage()
// below is the single chokepoint where that call happens; nothing else in
// this module calls it or anything execute/send/submit-shaped. See
// automation-service.test.ts's "send-execution import boundary" test, which
// statically greps this file's import statements for a regression.
//
// RATE-LIMIT / RUNTIME SAFETY: a single invocation never scores or drafts
// more than settings.maxJobsPerRun jobs (hard-ceiling-clamped regardless of
// what's configured), processes them SEQUENTIALLY (never in parallel), and
// sleeps INTER_JOB_DELAY_MS between each one — so one run can never burst
// past Exa/Together's per-minute limits or run indefinitely.
//
// RESUMABILITY: the applications table IS the persistent scan ledger.
// Whatever this run doesn't get to (beyond the cap) is simply never saved,
// so it is NOT excluded by isDuplicateJob() next time — the next run's scan
// naturally re-surfaces it and picks up where this run left off. Nothing
// extra needs to be persisted to "remember" where a run stopped.
// ============================================================================

// Sequential delay between processing each job (score + optional draft),
// so a run with several new jobs never bursts requests past Exa/Together
// per-minute rate limits. Overridable only by tests (see opts below) — real
// cron/manual runs always use this real delay.
const INTER_JOB_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

export function isDue(settings: Pick<AutomationSettings, "enabled" | "schedule" | "lastRunAt">, now: Date): boolean {
  if (!settings.enabled) return false;
  if (!settings.lastRunAt) return true;
  const hours = AUTOMATION_SCHEDULE_HOURS[settings.schedule];
  return now.getTime() - new Date(settings.lastRunAt).getTime() >= hours * 60 * 60 * 1000;
}

// Clamps a user-configured cap into a safe range regardless of what's
// stored — a misconfigured huge number (or 0/negative) can never blow past
// MAX_JOBS_PER_RUN_CEILING or fall to zero.
export function resolveJobCap(maxJobsPerRun: number | undefined): number {
  const requested = maxJobsPerRun ?? DEFAULT_MAX_JOBS_PER_RUN;
  return Math.max(1, Math.min(MAX_JOBS_PER_RUN_CEILING, Math.floor(requested) || DEFAULT_MAX_JOBS_PER_RUN));
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.search = "";
    url.hash = "";
    let s = url.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

// Duplicated from lib/store.ts's generateSlug rather than imported: store.ts
// pulls in the client write-through cache module, which this server-only
// service must not depend on.
function slugify(company: string, role: string): string {
  return `${company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${role.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

// The dedupe check against the persistent scan ledger (the applications
// table itself — see module docstring). Anything already saved here, staged
// or not, is never re-scored or re-staged.
export function isDuplicateJob(
  existing: Application[],
  job: { url: string; company?: string; title: string },
): boolean {
  const normUrl = normalizeUrl(job.url);
  const slug = slugify(job.company ?? "", job.title);
  return existing.some(a => normalizeUrl(a.sourceUrl) === normUrl || a.slug === slug);
}

export function isGoodFit(recommendation: string): boolean {
  return recommendation === "apply_immediately" || recommendation === "apply";
}

// Mirrors the profile -> query/keywords heuristic already used by the manual
// scan UI (app/batch/page.tsx), so automated scans target the same roles a
// manual scan would.
function buildScanParams(profile: Profile): { query: string; roleKeywords: string[]; excludeKeywords: string[] } {
  const roleKeywords: string[] = [];
  if (profile.roleType) roleKeywords.push(profile.roleType.replace(/-/g, " "));
  if (profile.headline) roleKeywords.push(profile.headline);
  const latestRole = profile.experience?.[0]?.role;
  if (latestRole) roleKeywords.push(latestRole);

  const excludeKeywords: string[] = [];
  const yoe = parseInt((profile.yearsOfExperience || "0").replace(/[^0-9]/g, ""), 10) || 0;
  const headlineLower = (profile.headline || "").toLowerCase();
  if (yoe >= 7 || /senior|director|vp|head|lead|principal|chief/.test(headlineLower)) {
    excludeKeywords.push("intern", "junior", "entry-level", "fresher", "trainee");
  }
  if (yoe < 2 || /student|intern|graduate/.test(headlineLower)) {
    excludeKeywords.push("director", "vp", "head of", "chief", "principal");
  }

  const query = latestRole || profile.headline || profile.roleType?.replace(/-/g, " ") || "";
  return { query, roleKeywords, excludeKeywords };
}

// Full description when the ATS feed already returned one (free, no extra
// request); otherwise a best-effort fetch of the job's own page; otherwise
// fall back to whatever title/company/snippet the scan already has. Scoring
// on a thin fallback is coarser but the job still gets scored and staged
// rather than silently dropped.
async function resolveJdText(job: JobResult, exaApiKey?: string): Promise<string> {
  if (job.descriptionHtml && job.descriptionHtml.trim()) {
    return htmlToText(job.descriptionHtml);
  }
  try {
    const fetched = await fetchJdText(job.url, exaApiKey);
    if (fetched.ok && fetched.text.trim()) return fetched.text;
  } catch {
    // fall through to the snippet-only fallback below
  }
  return [job.title, job.company, job.snippet].filter(Boolean).join("\n");
}

function skippedRun(id: string, startedAt: string, reason: string): AutomationRunLog {
  return {
    id, startedAt, finishedAt: new Date().toISOString(), status: "skipped", reason,
    jobsFound: 0, jobsScored: 0, jobsStaged: 0, jobsSourced: 0, jobsSkippedDuplicate: 0, errors: [],
  };
}

// The ONLY place in this module that touches the approval system. Drafts
// materials for a good-fit job and stages it via queueApproval — stage-only,
// exactly like followup-service.ts's use of the same function. Never calls
// anything execute/send/submit-shaped. Returns whether it staged anything
// plus any non-fatal draft error, so the caller can accumulate run stats.
async function autopilotStage(
  userEmail: string,
  app: Application,
  scoreResult: ScoreJobOutput,
  profile: Profile,
  providerSettings: Parameters<typeof generateDraft>[0]["providerSettings"],
): Promise<{ staged: boolean; error?: string }> {
  if (!isGoodFit(scoreResult.recommendation)) return { staged: false };

  let draft: unknown = null;
  let error: string | undefined;
  try {
    draft = await generateDraft({ action: "cover-letter", profile, app, providerSettings });
  } catch (e: any) {
    error = `Draft failed for ${app.company} - ${app.role}: ${e.message}`;
  }

  queueApproval(userEmail, {
    kind: "auto_staged_job",
    applicationId: app.id,
    payload: {
      company: app.company,
      role: app.role,
      score: scoreResult.global,
      recommendation: scoreResult.recommendation,
      draftAction: "cover-letter",
      draft,
    },
  });

  return { staged: true, error };
}

export type RunAutomationOpts = {
  force?: boolean;
  // Test-only override for the inter-job delay so the suite doesn't have to
  // spend real wall-clock time — real cron/manual-run callers never pass this.
  interJobDelayMs?: number;
};

export async function runAutomation(
  userEmail: string,
  now: Date,
  opts: RunAutomationOpts = {},
): Promise<AutomationRunLog> {
  const id = randomUUID();
  const startedAt = now.toISOString();
  const settings = settingsRepo.getAutomationSettings(userEmail);
  const interJobDelayMs = opts.interJobDelayMs ?? INTER_JOB_DELAY_MS;

  if (!settings.enabled) {
    return skippedRun(id, startedAt, "Automation is disabled");
  }
  if (!opts.force && !isDue(settings, now)) {
    return skippedRun(id, startedAt, "Not due yet per the configured schedule");
  }

  const profile = profileRepo.get(userEmail);
  if (!profile) {
    const run = { ...skippedRun(id, startedAt, "No profile found"), status: "error" as AutomationRunStatus };
    settingsRepo.appendAutomationRun(userEmail, run);
    return run;
  }

  const integration = settingsRepo.getIntegrationSettings(userEmail);
  const companies = settingsRepo.getCompanyTargets(userEmail).filter(c => c.enabled);
  const modelSettings = settingsRepo.getModelSettings(userEmail);
  const providerSettings = modelSettings.provider !== "together"
    ? { provider: modelSettings.provider, model: modelSettings.model, apiKey: modelSettings.apiKey }
    : undefined;

  const { query, roleKeywords, excludeKeywords } = buildScanParams(profile);
  const regions = Array.from(new Set(companies.flatMap(c => c.region))) as Region[];

  const errors: string[] = [];
  let scanResult;
  try {
    scanResult = await scanJobs({
      query: query || "role",
      regions: regions.length > 0 ? regions : ["global"],
      companies,
      exaApiKey: integration.exaApiKey,
      adzunaAppId: integration.adzunaAppId,
      adzunaAppKey: integration.adzunaAppKey,
      numResults: 30,
      roleKeywords,
      excludeKeywords,
    });
  } catch (e: any) {
    const run: AutomationRunLog = {
      id, startedAt, finishedAt: new Date().toISOString(), status: "error",
      reason: `Scan failed: ${e.message}`,
      jobsFound: 0, jobsScored: 0, jobsStaged: 0, jobsSourced: 0, jobsSkippedDuplicate: 0, errors: [e.message],
    };
    settingsRepo.appendAutomationRun(userEmail, run);
    return run;
  }

  errors.push(...(scanResult.errors ?? []));
  const jobsFound = scanResult.jobs.length;

  // Dedupe against the persistent ledger (applications table) — anything
  // already saved, from this or any prior run, is excluded here.
  const existingApps = applicationRepo.list(userEmail);
  const newJobs = scanResult.jobs.filter(j => !isDuplicateJob(existingApps, { url: j.url, company: j.company, title: j.title }));
  const jobsSkippedDuplicate = jobsFound - newJobs.length;

  // Hard per-run cap, clamped to a safe ceiling regardless of configuration.
  // Anything beyond the cap is simply left unprocessed and unsaved this run —
  // since it's not in the ledger, the next run's dedupe pass won't exclude
  // it, so it's naturally picked up then. This is what makes runs resumable
  // without any extra "where did we stop" bookkeeping.
  const jobCap = resolveJobCap(settings.maxJobsPerRun);
  const toProcess = newJobs.slice(0, jobCap);

  let jobsScored = 0;
  let jobsStaged = 0;
  let jobsSourced = 0;
  let jobsUnscored = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const job = toProcess[i];
    if (i > 0) await sleep(interJobDelayMs);

    // Resolving the JD text is a hard prerequisite — with no JD there is
    // nothing meaningful to save, so this failure still skips the job.
    let jdText: string;
    try {
      jdText = await resolveJdText(job, integration.exaApiKey);
    } catch (e: any) {
      errors.push(`Could not fetch JD for ${job.company ?? "unknown"} - ${job.title}: ${e.message}`);
      continue;
    }

    // Scoring failure (e.g. a reasoning model exhausting its token budget on
    // a dense JD — see lib/ai-client.ts) is NOT treated the same way: the
    // job is still saved, marked unscored, so it stays visible in the
    // pipeline for manual review instead of silently vanishing and crashing
    // the run (the aravindpranav/job-agent pattern). scoreResult stays null
    // on failure; the save block below branches on that.
    let scoreResult: ScoreJobOutput | null = null;
    try {
      scoreResult = await scoreJob({
        jdText,
        company: job.company ?? "Unknown",
        role: job.title,
        location: job.location ?? "",
        seniority: "senior",
        sector: "",
        remote: /remote/i.test(job.location ?? ""),
        buckets: DEFAULT_BUCKETS.map(b => ({ id: b.id, name: b.name, description: b.description })),
        profile,
        providerSettings,
      });
      jobsScored++;
    } catch (e: any) {
      errors.push(`Scoring failed for ${job.company ?? "unknown"} - ${job.title}: ${e.message}. Job kept, marked unscored.`);
      jobsUnscored++;
    }

    try {
      const nowIso = new Date().toISOString();
      const newApp: Application = scoreResult ? {
        id: randomUUID(),
        slug: slugify(job.company ?? "unknown", job.title),
        company: job.company ?? "Unknown",
        role: job.title,
        location: job.location ?? "",
        remote: /remote/i.test(job.location ?? ""),
        status: "sourced",
        score: scoreResult.totalScore,
        bucket: scoreResult.bucket,
        bucketName: scoreResult.bucketName,
        sector: "",
        seniority: "senior",
        sourceUrl: job.url,
        capturedAt: nowIso.split("T")[0],
        jdRaw: jdText,
        jdParsed: scoreResult.parsed,
        afScore: {
          archetype: scoreResult.archetype,
          scores: scoreResult.scores,
          global: scoreResult.global,
          recommendation: scoreResult.recommendation,
          legitimacy: scoreResult.legitimacy,
        },
        nextAction: isGoodFit(scoreResult.recommendation) ? "Review auto-staged draft and approve" : "Review and decide",
        contacts: [],
        interviews: [],
        reminders: [],
        resumeVersions: [],
        notes: "Auto-discovered and scored by the scheduled automation job.",
        emailEvents: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      } : {
        // Unscored fallback: no afScore, no bucket confidence — kept in the
        // pipeline at the bottom of the queue (score 0) rather than lost.
        id: randomUUID(),
        slug: slugify(job.company ?? "unknown", job.title),
        company: job.company ?? "Unknown",
        role: job.title,
        location: job.location ?? "",
        remote: /remote/i.test(job.location ?? ""),
        status: "sourced",
        score: 0,
        bucket: "unscored",
        bucketName: "Unscored (AI scoring failed)",
        sector: "",
        seniority: "senior",
        sourceUrl: job.url,
        capturedAt: nowIso.split("T")[0],
        jdRaw: jdText,
        jdParsed: null,
        nextAction: "AI scoring failed — review and score manually",
        contacts: [],
        interviews: [],
        reminders: [],
        resumeVersions: [],
        notes: "Auto-discovered by the scheduled automation job, but AI scoring failed. Kept for manual review instead of being dropped.",
        emailEvents: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // Save to the ledger FIRST — even if drafting/staging fails below, this
      // job is now permanently recorded and will never be re-scored.
      applicationRepo.save(userEmail, newApp);
      jobsSourced++;
      existingApps.push(newApp); // keeps this run's own in-memory ledger view current

      if (scoreResult) {
        const staged = await autopilotStage(userEmail, newApp, scoreResult, profile, providerSettings);
        if (staged.staged) jobsStaged++;
        if (staged.error) errors.push(staged.error);
      }
    } catch (e: any) {
      errors.push(`Failed to save ${job.company ?? "unknown"} - ${job.title}: ${e.message}`);
    }
  }

  const run: AutomationRunLog = {
    id,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: "ok",
    jobsFound,
    jobsScored,
    jobsStaged,
    jobsSourced,
    jobsSkippedDuplicate,
    jobsUnscored,
    errors,
  };

  settingsRepo.appendAutomationRun(userEmail, run);
  settingsRepo.saveAutomationSettings(userEmail, { ...settings, lastRunAt: now.toISOString() });

  if (jobsStaged > 0) {
    notificationRepo.add(userEmail, {
      type: "automation_run",
      title: `Automation staged ${jobsStaged} job${jobsStaged === 1 ? "" : "s"} for review`,
      body: `Scan found ${jobsFound} posting${jobsFound === 1 ? "" : "s"}, scored ${jobsScored}, staged ${jobsStaged} for your approval. ${jobsSkippedDuplicate} already in your pipeline were skipped.`,
    });
  }

  return run;
}
