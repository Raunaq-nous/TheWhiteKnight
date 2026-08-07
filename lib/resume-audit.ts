// Adversarial resume audit — client wrapper + the pure merge logic that
// guarantees a deterministic ATS-readability finding (lib/resume-ats-check.ts)
// can never be silently dropped just because the model didn't happen to
// restate it as its own deduction.

import type { Application } from "./store";
import type { ResumeContent } from "./resume-schema";
import type { ResumeArchetype } from "./resume-archetype";
import type { ResumeAuditResult } from "./schemas";
import type { AtsIssue } from "./resume-ats-check";
import { getModelSettings } from "./model-settings";

export type { ResumeAuditResult, ResumeAuditCategory, ResumeAuditDeduction, ResumeAuditBonus } from "./schemas";

// Stored on the Application alongside the resume it scored, so scores can
// be correlated against real response rates later (feature request #4).
export type StoredResumeAudit = ResumeAuditResult & { scoredAt: string; atsReadable: boolean };

/**
 * Merges deterministic ATS-readability issues into the model's own
 * deductions as "formatting_problem" entries, skipping any the model
 * already reported verbatim (the prompt asks it to restate them, but never
 * trust that alone). Every real parse failure ends up in the deductions
 * list either way.
 */
export function mergeAtsIssuesIntoDeductions(audit: ResumeAuditResult, atsIssues: AtsIssue[]): ResumeAuditResult {
  const existingDetails = new Set(audit.deductions.map(d => d.detail));
  const extra = atsIssues
    .filter(i => !existingDetails.has(i.detail))
    .map(i => ({ type: "formatting_problem" as const, detail: i.detail, severity: i.severity }));
  if (extra.length === 0) return audit;
  return { ...audit, deductions: [...audit.deductions, ...extra] };
}

export async function generateResumeAudit(
  resumeContent: ResumeContent,
  archetype: ResumeArchetype | null | undefined,
  app: Application,
): Promise<{ audit: ResumeAuditResult; atsReadable: boolean }> {
  const s = getModelSettings();
  const providerSettings = s.provider !== "together" ? { provider: s.provider, model: s.model, apiKey: s.apiKey } : undefined;
  const res = await fetch("/api/resume/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeContent, archetype, app, providerSettings }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Audit failed: ${res.status}`);
  return data as { audit: ResumeAuditResult; atsReadable: boolean };
}
