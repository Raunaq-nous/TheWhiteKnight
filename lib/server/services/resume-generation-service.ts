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
import { applyConfidentialitySubstitutionsToResumeContent, enforceEmployerLocations } from "../../resume-confidentiality";
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
    // "resume_selection": non-reasoning by default — the model only ever
    // SELECTS bullet ids under this schema (see resolveResumeSelections
    // below), a classification-shaped task a reasoning model brings no
    // benefit to and a token-budget risk for.
    { temperature: 0.6, maxTokens: 4000, task: "resume_selection" },
    providerSettings,
    ResumeContentSchema,
  );

  // The model only ever SELECTS bullet ids (see lib/resume-selection.ts) —
  // resolveResumeSelections turns those ids into real profile text (or a
  // compressed, outcome-preserving variant) before anything else touches
  // this content, so nothing downstream ever sees model-authored
  // experience/project/key-win prose. Section order is then stamped
  // deterministically from the archetype spec, and the content budget is
  // clamped deterministically — neither is trusted to the model.
  const resolved = resolveResumeSelections(data, effectiveProfile);
  const normalized = normalizeResumeContent(resolved);
  // Canonical employer locations override whatever the profile says, here
  // too — not just at export — so a resume looks right the moment it's
  // first generated, not only after the export-time gate corrects it.
  const withCanonicalLocations = { ...normalized, experience: enforceEmployerLocations(normalized.experience) };
  // CONFIDENTIALITY substitutions ("$10.45B" -> "$10 billion", "nuclear
  // utility" -> "green energy entity", internal tool names, etc.) applied
  // here too — not just as an export-time gate — so the ResumeContent that
  // actually gets stored/returned is already clean. The export gate
  // (app/api/resume/export/route.ts) remains the hard backstop.
  const withConfidentialitySubstitutions = applyConfidentialitySubstitutionsToResumeContent(withCanonicalLocations, undefined, archetype);
  const targetKey = resolveTargetArchetypeKey(app, archetype);
  const withSideBuildsResolved = suppressSideBuilds(withConfidentialitySubstitutions, targetKey);
  const finalContent = withArchetypeSequence(clampToOnePageBudget(withSideBuildsResolved, archetype, maxPages), archetype);
  const formatGate = runFormatGate(finalContent);
  const toolPlacementGate = runToolPlacementGate(finalContent);

  // Applied-caps visibility (ONE-SHOT FIX): the budget that scaled with
  // maxPages used to be invisible — a generation could silently select 9
  // bullets from a 38-bullet profile with no signal anywhere that the
  // per-role/global caps even ran. Logged on every generation so a budget
  // regression is never silent again.
  const candidateBulletCount = listProfileBullets(effectiveProfile).length;
  const budget = budgetForMaxPages(maxPages);
  const renderedBulletCount = finalContent.experience.reduce((n, e) => n + e.bullets.length, 0);
  console.log(
    `[CareerOS] resume generated for ${app?.company ?? "unknown"} — archetype=${archetype} maxPages=${maxPages} ` +
    `candidateBullets=${candidateBulletCount} perRoleCap=${budget.bulletsPerRoleMax} globalBulletCap=${budget.totalExperienceBulletsMax} ` +
    `roleCap=${budget.experienceMaxRoles} keyImpactCap=${budget.keyImpactMaxItems} -> ` +
    `rolesRendered=${finalContent.experience.length} bulletsRendered=${renderedBulletCount}`,
  );

  return { data: finalContent, archetype, maxPages, formatGate, toolPlacementGate };
}
