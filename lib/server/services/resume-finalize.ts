import "server-only";
// The post-selection steps shared by generation and refine, so both paths
// produce the same company-by-company resume:
//   skills (two JD-matched taxonomy rows), education lines, confidentiality
//   substitutions over every field, then the summary rules (one corrective
//   model retry, then a deterministic repair) and the generation-time gates.

import { chatJSON, type ProviderSettings } from "../../ai-client";
import { summaryRewritePrompt } from "../../prompts";
import { normalizeResumeContent, type ResumeContent } from "../../resume-schema";
import type { Profile } from "../../profile";
import type { Application } from "../../store";
import type { ResumeArchetype } from "../../resume-archetype";
import { applyConfidentialitySubstitutionsToResumeContent, runConfidentialityGate, renderedResumeText, type ConfidentialityGateResult } from "../../resume-confidentiality";
import { selectResumeSkills, skillEvidence } from "../../resume-skills";
import { finalizeEducation } from "../../resume-education";
import { summaryViolations, repairSummary } from "../../resume-summary";
import { keywordOverlap, tokens } from "../../resume-jd";
import { z } from "zod";

export type SummaryReport = { violations: string[]; retried: boolean; violationsAfterRetry: string[]; repaired: boolean };
export type RequirementCoverage = { requirement: string; bulletId: string | null; company: string | null; text: string | null; via: "model" | "overlap" | null };

export type FinalizeContext = {
  profile: Profile;
  app: Application;
  archetype: ResumeArchetype;
  requirements: string[];
  jdTerms: Set<string>;
  aiJd: boolean;
  technicalJd: boolean;
  providerSettings?: ProviderSettings;
  // Refine passes false: no model retry, deterministic repair only.
  allowSummaryRetry?: boolean;
};

function jdTextOf(app: Application): string {
  return [app.jdRaw ?? "", ...(app.jdParsed?.keyRequirements ?? [])].join("\n");
}

const SummarySchema = z.object({ summary: z.string() });

export async function finalizeResumeContent(content: ResumeContent, ctx: FinalizeContext): Promise<{
  content: ResumeContent; summaryReport: SummaryReport; confidentialityGate: ConfidentialityGateResult;
}> {
  // Skills only where a SELECTED bullet evidences them.
  const bullets = content.experience.flatMap(e => e.bullets.map(b => ({ sourceBulletId: b.sourceBulletId, text: b.text })));
  const skills = selectResumeSkills(content.skills ?? [], { jdTerms: ctx.jdTerms, aiJd: ctx.aiJd, technicalJd: ctx.technicalJd, bullets });
  const withSections: ResumeContent = {
    ...content,
    projects: [], keyWins: [], keyWinIds: [], keyWinCompanies: [],
    skills,
    skillEvidence: skillEvidence(skills, bullets),
    education: finalizeEducation(content.education ?? [], ctx.profile),
  };
  let out = applyConfidentialitySubstitutionsToResumeContent(withSections, undefined, ctx.archetype);

  // SUMMARY RULES. Bullets include the reserve: export may add from it.
  const check = {
    bulletTexts: [...out.experience.flatMap(e => e.bullets.map(b => b.text)), ...(out.reserve ?? []).map(r => r.text)],
    jdText: jdTextOf(ctx.app),
  };
  const report: SummaryReport = { violations: summaryViolations(out.summary, check), retried: false, violationsAfterRetry: [], repaired: false };
  if (report.violations.length && ctx.allowSummaryRetry !== false) {
    report.retried = true;
    try {
      const current = out.experience[0];
      const data = await chatJSON<z.infer<typeof SummarySchema>>(
        [{ role: "user", content: summaryRewritePrompt({
          summary: out.summary, violations: report.violations, role: ctx.app.role, company: ctx.app.company,
          yearsClaim: ctx.profile.yearsOfExperience ?? "", currentPosition: current ? `${current.role} at ${current.company}` : "",
          requirements: ctx.requirements,
        }) }],
        // The summary is writing: the writing chain.
        { temperature: 0.3, maxTokens: 300, task: "drafting" },
        ctx.providerSettings,
        SummarySchema,
      );
      const rewritten = normalizeResumeContent({ ...out, summary: data.summary }).summary;
      out = applyConfidentialitySubstitutionsToResumeContent({ ...out, summary: rewritten }, undefined, ctx.archetype);
    } catch (e) {
      console.warn(`[CareerOS] summary rewrite failed, repairing deterministically: ${(e as Error).message}`);
    }
  }
  report.violationsAfterRetry = summaryViolations(out.summary, check);
  if (report.violationsAfterRetry.length) {
    out = { ...out, summary: repairSummary(out.summary, check) };
    report.repaired = true;
  }

  // CONFIDENTIALITY GATE over every field that reaches the resume.
  const confidentialityGate = runConfidentialityGate(renderedResumeText(out), undefined, ctx.archetype);
  return { content: out, summaryReport: report, confidentialityGate };
}

/** For each top requirement, the bullet on the resume that covers it: the model's pick if shown, else the best keyword match. */
export function requirementCoverage(content: ResumeContent, requirements: string[]): RequirementCoverage[] {
  const shown = content.experience.flatMap(e => e.bullets.map(b => ({ id: b.sourceBulletId, company: e.company, text: b.text })));
  const modelPicks = content.requirementCoverage ?? [];
  return requirements.map((requirement, i) => {
    const pick = modelPicks.find(p => p.requirement.trim().toLowerCase() === requirement.trim().toLowerCase()) ?? modelPicks[i];
    const byModel = pick?.sourceBulletId ? shown.find(b => b.id === pick.sourceBulletId) : undefined;
    if (byModel) return { requirement, bulletId: byModel.id, company: byModel.company, text: byModel.text, via: "model" as const };
    const terms = tokens(requirement);
    const best = shown
      .map(b => ({ b, n: keywordOverlap(b.text, terms) }))
      .sort((a, b) => b.n - a.n)[0];
    if (best && best.n >= 2) return { requirement, bulletId: best.b.id, company: best.b.company, text: best.b.text, via: "overlap" as const };
    return { requirement, bulletId: null, company: null, text: null, via: null };
  });
}
