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
import { detectResumeArchetype, withArchetypeSequence, resolveMaxPages, ResumeArchetype } from "../../resume-archetype";
import { clampToOnePageBudget } from "../../resume-budget";
import { resolveResumeSelections } from "../../resume-selection";
import { runFormatGate, FormatGateResult } from "../../resume-format-gate";
import type { Profile } from "../../profile";
import type { Application } from "../../store";

export type GenerateResumeContentResult = {
  data: ResumeContent;
  archetype: ResumeArchetype;
  // The resolved page ceiling for this archetype/candidate (see
  // resolveMaxPages in lib/resume-archetype.ts — 1 by default, up to 2 for
  // general consulting/product/ai_ml/finance_ib once the candidate has 5+
  // years, never 2 for MBB or under-5-years). Callers pass this straight
  // through to the export flow so the extraction gate checks against the
  // SAME ceiling the content was actually budgeted for.
  maxPages: number;
  // Computed here so EVERY resume-producing path gets this signal, not
  // just the export flow (app/api/resume/export/route.ts) — that route
  // still runs its own gate against the final, possibly checkbox-edited
  // content and is what actually blocks a bad export; this copy is for
  // visibility as early as generation itself. Never throws on a hard
  // failure — callers decide what (if anything) to do with it.
  formatGate: FormatGateResult;
};

export async function generateResumeContent(
  profile: Profile,
  app: Application,
  providerSettings: ProviderSettings | undefined,
  resumeArchetype?: ResumeArchetype,
): Promise<GenerateResumeContentResult> {
  const archetype = detectResumeArchetype(profile, app, resumeArchetype);
  const maxPages = resolveMaxPages(profile, app, archetype);

  const data = await chatJSON<ResumeContent>(
    [{ role: "user", content: resumePrompt(profile, app, archetype) }],
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
  // deterministically from the archetype spec, and the one-page content
  // budget is clamped deterministically — neither is trusted to the model.
  const resolved = resolveResumeSelections(data, profile);
  const finalContent = withArchetypeSequence(clampToOnePageBudget(normalizeResumeContent(resolved), archetype, maxPages), archetype);
  const formatGate = runFormatGate(finalContent);

  return { data: finalContent, archetype, maxPages, formatGate };
}
