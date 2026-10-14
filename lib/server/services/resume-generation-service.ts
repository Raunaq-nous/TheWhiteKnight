import "server-only";
// THE canonical resume-generation pipeline — the ONLY place a ResumeContent
// is ever built from a model call. Every caller (the interactive
// /api/generate route, the automation autopilot's draft-service.ts) MUST
// go through generateResumeContent() below, never call resumePrompt +
// chatJSON directly. That is the actual invariant a gap let slip through
// once already: draft-service.ts's "resume" branch duplicated this
// pipeline but forgot the resolveResumeSelections step, so automation-
// drafted resumes rendered raw model-authored bullet prose instead of real
// profile bullets selected by id — exactly the fabrication risk the
// selection-not-rewriting architecture (lib/resume-selection.ts) exists to
// close. There is now exactly one implementation, so that gap cannot
// reopen by one caller drifting out of sync with the other. A source-level
// test (lib/__tests__/resume-generation-invariant.test.ts) enforces this
// structurally: any file that imports resumePrompt or resumeRefinePrompt
// must also import resolveResumeSelections — today that's this file alone
// (plus app/api/generate/route.ts for the resume-refine path, which
// already called it correctly).
import { chatJSON, ProviderSettings } from "../../ai-client";
import { resumePrompt } from "../../prompts";
import { ResumeContentSchema, ResumeContent, normalizeResumeContent } from "../../resume-schema";
import {
  detectResumeArchetype, withArchetypeSequence, resolveConfiguredMaxPages, resolveConfiguredYearsOfExperience,
  resolveTargetArchetypeKey, ResumeArchetype,
} from "../../resume-archetype";
import { clampToOnePageBudget } from "../../resume-budget";
import { resolveResumeSelections } from "../../resume-selection";
import { runFormatGate, FormatGateResult } from "../../resume-format-gate";
import {
  enforceEmployerLocations, applyConfidentialitySubstitutions, runConfidentialityGate, type ConfidentialityGateResult,
} from "../../resume-confidentiality";
import { buildFilledSelection, buildCandidates, type FillStats } from "../../resume-fill";
import { estimateDocxLines } from "../../resume-layout-estimate";
import { suppressSideBuilds, runToolPlacementGate, ToolPlacementGateResult } from "../../resume-tool-placement";
import { isAiRelatedJd, isTechnicalJd, jdRelevanceTerms } from "../../resume-jd";
import { extractTopRequirements } from "./jd-requirements";
import { finalizeResumeContent, requirementCoverage, type SummaryReport, type RequirementCoverage } from "./resume-finalize";
import type { Profile } from "../../profile";
import type { Application } from "../../store";

export type GenerateResumeContentResult = {
  data: ResumeContent;
  archetype: ResumeArchetype;
  // The resolved page ceiling (config pagesByArchetype, years rule).
  // Callers pass it straight to export so the extraction gate checks the
  // same ceiling the content was built for.
  maxPages: number;
  // Visibility only: the export route re-runs these against the final
  // content and is what actually blocks.
  formatGate: FormatGateResult;
  toolPlacementGate: ToolPlacementGateResult;
  // Every field that reaches the resume, the summary included.
  confidentialityGate: ConfidentialityGateResult;
  // Step 0: the JD's top requirements. jdWarning is set when fewer than 3
  // could be extracted (the JD text is too thin to tailor to).
  jdRequirements: string[];
  jdWarning: string | null;
  // The bullet on the resume covering each top requirement.
  coverage: RequirementCoverage[];
  summaryReport: SummaryReport;
  fill: FillStats & { finalEstimatedLines: number; aiJd: boolean; technicalJd: boolean };
};

/** The profile resume generation reads: never profile.projects (every build is an experience bullet). */
export function resumeSourceProfile(profile: Profile, app: Application, archetype: ResumeArchetype): Profile {
  return { ...profile, projects: [], yearsOfExperience: resolveConfiguredYearsOfExperience(profile, app, archetype) };
}

export async function generateResumeContent(
  profile: Profile,
  app: Application,
  providerSettings: ProviderSettings | undefined,
  resumeArchetype?: ResumeArchetype,
): Promise<GenerateResumeContentResult> {
  const archetype = detectResumeArchetype(profile, app, resumeArchetype);
  const maxPages = resolveConfiguredMaxPages(profile, app, archetype);
  // Years flex by TARGET (spec Part 3); projects are never read. The real,
  // stored profile is untouched.
  const effectiveProfile = resumeSourceProfile(profile, app, archetype);

  // STEP 0 — the JD's top 5 requirements, before anything is ranked.
  const jd = await extractTopRequirements(app, providerSettings);
  const aiJd = isAiRelatedJd(app, jd.requirements);
  const technicalJd = isTechnicalJd(app, archetype);
  const jdTerms = jdRelevanceTerms(app, jd.requirements);

  // A bullet that would still fail the confidentiality gate after
  // substitution is never eligible.
  const isTextAllowed = (text: string) =>
    runConfidentialityGate(applyConfidentialitySubstitutions(text, undefined, archetype), undefined, archetype).ok;
  const eligibleIds = new Set(buildCandidates(effectiveProfile, new Map(), maxPages, { isTextAllowed }).pool.map(c => c.id));

  const data = await chatJSON<ResumeContent>(
    [{ role: "user", content: resumePrompt(effectiveProfile, app, archetype, maxPages, { topRequirements: jd.requirements, eligibleIds }) }],
    // "resume_selection": the model RANKS eligible ids and writes the summary.
    { temperature: 0.4, maxTokens: 6000, task: "resume_selection" },
    providerSettings,
    ResumeContentSchema,
  );

  // Selection from the ranking: quality filter, JD relevance first, taper.
  const fill = buildFilledSelection(effectiveProfile, withArchetypeSequence(data, archetype), archetype, maxPages, { isTextAllowed, jdTerms, aiJd });
  const filled: ResumeContent = {
    ...data, experience: fill.experience, keyWinIds: [], keyWins: [], keyWinCompanies: [], projects: [], reserve: fill.reserve,
  };

  // Every bullet's text is re-resolved from the profile by id.
  const resolved = resolveResumeSelections(filled, effectiveProfile, maxPages);
  const normalized = normalizeResumeContent(resolved);
  const withCanonicalLocations = { ...normalized, experience: enforceEmployerLocations(normalized.experience) };
  const targetKey = resolveTargetArchetypeKey(app, archetype);
  const withSideBuildsResolved = suppressSideBuilds(withCanonicalLocations, targetKey);
  const clamped = withArchetypeSequence(clampToOnePageBudget(withSideBuildsResolved, archetype, maxPages), archetype);

  // Skills, education, confidentiality over every field, summary rules.
  const { content: finalContent, summaryReport, confidentialityGate } = await finalizeResumeContent(clamped, {
    profile: effectiveProfile, app, archetype, requirements: jd.requirements, jdTerms, aiJd, technicalJd, providerSettings,
  });
  const formatGate = runFormatGate(finalContent);
  const toolPlacementGate = runToolPlacementGate(finalContent);
  const coverage = requirementCoverage(finalContent, jd.requirements);

  const finalEstimatedLines = estimateDocxLines(finalContent, archetype, maxPages);
  const renderedBulletCount = finalContent.experience.reduce((n: number, e) => n + e.bullets.length, 0);
  console.log(
    `[CareerOS] resume generated for ${app?.company ?? "unknown"} — archetype=${archetype} maxPages=${maxPages} ` +
    `jdRequirements=${jd.requirements.length}${jd.tooThin ? " (THIN JD)" : ""} aiJd=${aiJd} eligible=${fill.stats.eligibleBullets} ` +
    `ineligible=${fill.stats.ineligibleBullets} modelRanked=${fill.stats.modelRankedIds} -> roles=${finalContent.experience.length} ` +
    `bullets=${renderedBulletCount} estLines=${finalEstimatedLines}/${fill.stats.targetLines} reserve=${finalContent.reserve?.length ?? 0} ` +
    `summaryViolations=${summaryReport.violations.length} confidentiality=${confidentialityGate.ok ? "ok" : "BLOCKED " + confidentialityGate.blockedTerms.join(",")}`,
  );

  return {
    data: finalContent, archetype, maxPages, formatGate, toolPlacementGate, confidentialityGate,
    jdRequirements: jd.requirements, jdWarning: jd.warning, coverage, summaryReport,
    fill: { ...fill.stats, finalEstimatedLines, aiJd, technicalJd },
  };
}
