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
import { budgetForMaxPages, clampToOnePageBudget } from "../../resume-budget";
import { resolveResumeSelections } from "../../resume-selection";
import { runFormatGate, FormatGateResult } from "../../resume-format-gate";
import {
  applyConfidentialitySubstitutionsToResumeContent, enforceEmployerLocations, applyConfidentialitySubstitutions, runConfidentialityGate,
} from "../../resume-confidentiality";
import { buildFilledSelection, separateSummaryProofPoint, type FillStats } from "../../resume-fill";
import { estimateDocxLines } from "../../resume-layout-estimate";
import { suppressSideBuilds, runToolPlacementGate, ToolPlacementGateResult } from "../../resume-tool-placement";
import { listProfileBullets } from "../../profile-bullets";
import type { Profile } from "../../profile";
import type { Application } from "../../store";

export type GenerateResumeContentResult = {
  data: ResumeContent;
  archetype: ResumeArchetype;
  // The resolved page ceiling for this archetype/candidate — config-first
  // (config/profile-rules.json's pagesByArchetype, keyed by the spec's
  // target-archetype taxonomy; see resolveTargetArchetypeKey /
  // resolveConfiguredMaxPages in lib/resume-archetype.ts), falling back to
  // the generic archetype base + years-of-experience threshold when no
  // configured mapping applies. Callers pass this straight through to the
  // export flow so the extraction gate checks against the SAME ceiling the
  // content was actually budgeted for.
  maxPages: number;
  // Computed here so EVERY resume-producing path gets this signal, not
  // just the export flow (app/api/resume/export/route.ts) — that route
  // still runs its own gate against the final, possibly checkbox-edited
  // content and is what actually blocks a bad export; this copy is for
  // visibility as early as generation itself. Never throws on a hard
  // failure — callers decide what (if anything) to do with it.
  formatGate: FormatGateResult;
  // Same visibility pattern as formatGate — see lib/resume-tool-placement.ts.
  // The export route is what actually blocks on this; here it's surfaced
  // as early as generation.
  toolPlacementGate: ToolPlacementGateResult;
  // What the model ranked and what the deterministic fill added, for
  // verification and logging (scripts/verify-resume.ts).
  fill: FillStats & { summaryProofPointSwapped: boolean; finalEstimatedLines: number };
};

export async function generateResumeContent(
  profile: Profile,
  app: Application,
  providerSettings: ProviderSettings | undefined,
  resumeArchetype?: ResumeArchetype,
): Promise<GenerateResumeContentResult> {
  const archetype = detectResumeArchetype(profile, app, resumeArchetype);
  const maxPages = resolveConfiguredMaxPages(profile, app, archetype);
  // Years of experience flexes by TARGET, not a fixed profile field (spec
  // Part 3) — an "effective" profile carries the configured value into the
  // prompt without ever touching the real, stored profile.
  const effectiveProfile: Profile = { ...profile, yearsOfExperience: resolveConfiguredYearsOfExperience(profile, app, archetype) };

  const data = await chatJSON<ResumeContent>(
    [{ role: "user", content: resumePrompt(effectiveProfile, app, archetype, maxPages) }],
    // "resume_selection": non-reasoning by default — the model only RANKS
    // ids (one score per available bullet), a classification-shaped task.
    // The token ceiling covers a full ranking of a large profile.
    { temperature: 0.6, maxTokens: 6000, task: "resume_selection" },
    providerSettings,
    ResumeContentSchema,
  );

  // RANK, DON'T SELECT: the model's ranking feeds a deterministic fill that
  // builds Key Projects + Experience and fills to the page target. A bullet
  // that would still fail the confidentiality gate after substitution is
  // never picked.
  const isTextAllowed = (text: string) =>
    runConfidentialityGate(applyConfidentialitySubstitutions(text, undefined, archetype), undefined, archetype).ok;
  const fill = buildFilledSelection(effectiveProfile, withArchetypeSequence(data, archetype), archetype, maxPages, { isTextAllowed });
  const filled: ResumeContent = { ...data, experience: fill.experience, keyWinIds: fill.keyWinIds, keyWins: fill.keyWins, keyWinCompanies: fill.keyWinCompanies, reserve: fill.reserve };

  // Every experience/project/key-win text is re-resolved from the profile by
  // id (selection, not writing), at the page ceiling's character cap.
  const resolved = resolveResumeSelections(filled, effectiveProfile, maxPages);
  const normalized = normalizeResumeContent(resolved);
  // Canonical employer locations override whatever the profile says, here
  // too — not just at export — so a resume looks right the moment it's
  // first generated, not only after the export-time gate corrects it.
  const withCanonicalLocations = { ...normalized, experience: enforceEmployerLocations(normalized.experience) };
  // CONFIDENTIALITY substitutions applied at generation, so stored content
  // is already clean. The export gate remains the hard backstop.
  const withConfidentialitySubstitutions = applyConfidentialitySubstitutionsToResumeContent(withCanonicalLocations, undefined, archetype);
  const targetKey = resolveTargetArchetypeKey(app, archetype);
  const withSideBuildsResolved = suppressSideBuilds(withConfidentialitySubstitutions, targetKey);
  const clamped = withArchetypeSequence(clampToOnePageBudget(withSideBuildsResolved, archetype, maxPages), archetype);
  // The summary never repeats the top Key Projects item's proof point.
  const { content: finalContent, changed: summaryProofPointSwapped } = separateSummaryProofPoint(clamped);
  const formatGate = runFormatGate(finalContent);
  const toolPlacementGate = runToolPlacementGate(finalContent);

  const budget = budgetForMaxPages(maxPages);
  const renderedBulletCount = finalContent.experience.reduce((n, e) => n + e.bullets.length, 0);
  const finalEstimatedLines = estimateDocxLines(finalContent, archetype, maxPages);
  console.log(
    `[CareerOS] resume generated for ${app?.company ?? "unknown"} — archetype=${archetype} maxPages=${maxPages} ` +
    `candidateBullets=${listProfileBullets(effectiveProfile).length} modelRanked=${fill.stats.modelRankedIds} addedByFill=${fill.stats.addedByFill} ` +
    `perRoleCap=${budget.bulletsPerRoleMax} globalBulletCap=${budget.totalExperienceBulletsMax} -> ` +
    `rolesRendered=${finalContent.experience.length} bulletsRendered=${renderedBulletCount} keyImpact=${finalContent.keyWins?.length ?? 0} ` +
    `estLines=${finalEstimatedLines}/${fill.stats.targetLines} reserve=${finalContent.reserve?.length ?? 0}`,
  );

  return { data: finalContent, archetype, maxPages, formatGate, toolPlacementGate, fill: { ...fill.stats, summaryProofPointSwapped, finalEstimatedLines } };
}
