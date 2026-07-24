import "server-only";
import { randomUUID } from "crypto";
import { applicationRepo, profileRepo, settingsRepo, notificationRepo } from "../repositories";
import { queueApproval } from "../approval-gate";
import { scanJobs, JobResult } from "./scan-service";
import { fetchJdText } from "./jd-fetch-service";
import { scoreJob } from "./scoring-service";
import { generateDraft } from "./draft-service";
import { DEFAULT_BUCKETS } from "../../buckets";
import { htmlToText } from "../../jd-fetch";
import type { Region } from "../../company-targets";
import type { Application } from "../../store";
import type { Profile } from "../../profile";
import {
  AUTOMATION_SCHEDULE_HOURS,
  AutomationSettings,
  AutomationRunLog,
  AutomationRunStatus,
} from "../../automation-settings";

// Scheduled automation layer: scan -> score -> (for good-fit jobs) draft ->
// stage into the SAME human-approval queue everything else uses, then STOP.
// This module NEVER imports approval-executor or send-service — it can only
// ever call queueApproval (stage-only), the same function followup-service
// uses. That import boundary is what makes it structurally incapable of
// sending or submitting anything; see automation-service.test.ts for a
// regression test enforcing it.

const MAX_JOBS_PER_RUN = 15;

export function isDue(settings: AutomationSettings, now: Date): boolean {
  if (!settings.enabled) return false;
  if (!settings.lastRunAt) return true;
  const hours = AUTOMATION_SCHEDULE_HOURS[settings.schedule];
  return now.getTime() - new Date(settings.lastRunAt).getTime() >= hours * 60 * 60 * 1000;
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

export async function runAutomation(
  userEmail: string,
  now: Date,
  opts: { force?: boolean } = {},
): Promise<AutomationRunLog> {
  const id = randomUUID();
  const startedAt = now.toISOString();
  const settings = settingsRepo.getAutomationSettings(userEmail);

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

  const existingApps = applicationRepo.list(userEmail);
  const newJobs = scanResult.jobs.filter(j => !isDuplicateJob(existingApps, { url: j.url, company: j.company, title: j.title }));
  const jobsSkippedDuplicate = jobsFound - newJobs.length;
  const toProcess = newJobs.slice(0, MAX_JOBS_PER_RUN);

  let jobsScored = 0;
  let jobsStaged = 0;
  let jobsSourced = 0;

  for (const job of toProcess) {
    try {
      const jdText = await resolveJdText(job, integration.exaApiKey);
      const scoreResult = await scoreJob({
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

      const nowIso = new Date().toISOString();
      const newApp: Application = {
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
      };

      applicationRepo.save(userEmail, newApp);
      jobsSourced++;
      // Keep this run's own dedup ledger current so two jobs resolving to the
      // same slug/URL within a single run can't both be saved.
      existingApps.push(newApp);

      if (isGoodFit(scoreResult.recommendation)) {
        let draft: unknown = null;
        try {
          draft = await generateDraft({ action: "cover-letter", profile, app: newApp, providerSettings });
        } catch (e: any) {
          errors.push(`Draft failed for ${newApp.company} - ${newApp.role}: ${e.message}`);
        }

        // Stage-only — never executed. See module docstring.
        queueApproval(userEmail, {
          kind: "auto_staged_job",
          applicationId: newApp.id,
          payload: {
            company: newApp.company,
            role: newApp.role,
            score: scoreResult.global,
            recommendation: scoreResult.recommendation,
            draftAction: "cover-letter",
            draft,
          },
        });
        jobsStaged++;
      }
    } catch (e: any) {
      errors.push(`Scoring failed for ${job.company ?? "unknown"} - ${job.title}: ${e.message}`);
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
