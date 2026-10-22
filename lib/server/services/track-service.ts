import "server-only";
// Career tracks and skill demand, server side: model confirmation for an
// ambiguous track, model skill extraction (always unioned with the rules
// extraction), annotation of applications, and pathway drafts. All on the
// structured model chain except the pathway draft (writing). JD text is
// data, never instructions.

import { z } from "zod";
import { chatJSON, type ProviderSettings } from "../../ai-client";
import { trackConfirmPrompt, skillExtractionPrompt, pathwayDraftPrompt } from "../../prompts";
import { CAREER_TRACKS, trackById, type TrackId } from "../../career-tracks";
import { classifyTrackByRules, extractSkillsByRules, normaliseSkills } from "../../skill-demand";
import { applicationRepo, profileRepo } from "../repositories";
import type { Application } from "../../store";

const TrackSchema = z.object({ trackId: z.string().nullable() });
const SkillsSchema = z.object({ skills: z.array(z.string()) });
const PathwaySchema = z.object({ steps: z.array(z.string()).min(1), proof: z.string(), estimate: z.string() });

/** The application's track: rules, then the model when two tracks are close. A manual track is kept. */
export async function classifyTrack(app: Application, providerSettings?: ProviderSettings, opts: { useModel?: boolean } = {}): Promise<Application["track"]> {
  if (app.track?.method === "manual") return app.track;
  const rules = classifyTrackByRules(app);
  if (!rules) return null;
  let id: TrackId = rules.id;
  let method: "rules" | "model" = "rules";
  if (rules.ambiguous && opts.useModel) {
    try {
      const top = rules.scores.filter(s => s.score > 0).slice(0, 3).map(s => trackById(s.id)!);
      const r = await chatJSON<z.infer<typeof TrackSchema>>(
        [{ role: "user", content: trackConfirmPrompt({ role: app.role, jdExcerpt: app.jdRaw ?? "", tracks: top.map(t => ({ id: t.id, label: t.label, titles: t.titles })) }) }],
        { temperature: 0, maxTokens: 60, task: "jd_extraction" },
        providerSettings,
        TrackSchema,
      );
      if (r.trackId && top.some(t => t.id === r.trackId)) { id = r.trackId as TrackId; method = "model"; }
    } catch { /* keep the rules answer */ }
  }
  return { id, archetype: trackById(id)!.resumeArchetype, confidence: rules.confidence, method };
}

/** Normalised skills for a JD: the rules vocabulary, plus the model's list when allowed. */
export async function extractJobSkills(jdText: string, providerSettings?: ProviderSettings, opts: { useModel?: boolean } = {}): Promise<NonNullable<Application["skillDemand"]>> {
  const rules = extractSkillsByRules(jdText);
  if (!opts.useModel || !jdText.trim()) return { skills: rules, method: "rules", extractedAt: new Date().toISOString() };
  try {
    const r = await chatJSON<z.infer<typeof SkillsSchema>>(
      [{ role: "user", content: skillExtractionPrompt(jdText) }],
      { temperature: 0, maxTokens: 500, task: "skill_extraction" },
      providerSettings,
      SkillsSchema,
    );
    return { skills: normaliseSkills([...rules, ...r.skills.slice(0, 25)]), method: "model", extractedAt: new Date().toISOString() };
  } catch {
    return { skills: rules, method: "rules", extractedAt: new Date().toISOString() };
  }
}

/** Track and skill demand for an application (model use optional). */
export async function annotateApplication(app: Application, providerSettings?: ProviderSettings, opts: { useModel?: boolean } = {}): Promise<Pick<Application, "track" | "skillDemand">> {
  const [track, skillDemand] = await Promise.all([classifyTrack(app, providerSettings, opts), extractJobSkills(app.jdRaw ?? "", providerSettings, opts)]);
  return { track, skillDemand };
}

/**
 * Annotates the user's applications that lack a track or skills: rules for
 * all (free), the model for at most `modelLimit` (re-extracting rules-only
 * ones first when asked).
 */
export async function refreshDemand(userEmail: string, opts: { modelLimit?: number; providerSettings?: ProviderSettings } = {}): Promise<{ annotated: number; withModel: number }> {
  let annotated = 0;
  let withModel = 0;
  for (const app of applicationRepo.list(userEmail)) {
    const needsRules = !app.skillDemand || app.track === undefined;
    const wantsModel = withModel < (opts.modelLimit ?? 0) && app.skillDemand?.method !== "model" && !!app.jdRaw?.trim();
    if (!needsRules && !wantsModel) continue;
    const useModel = wantsModel;
    const a = await annotateApplication(app, opts.providerSettings, { useModel });
    applicationRepo.update(userEmail, app.id, a);
    annotated++;
    if (useModel) withModel++;
  }
  return { annotated, withModel };
}

/** A draft pathway for a demanded skill with no seed (writing chain). Marked draft for the user to accept or edit. */
export async function draftPathway(userEmail: string, trackId: string, skill: string, providerSettings?: ProviderSettings): Promise<{ steps: string[]; proof: string; estimate: string }> {
  const track = trackById(trackId);
  if (!track) throw new Error("Unknown track");
  const profile = profileRepo.get(userEmail);
  const summary = [profile?.headline, ...(profile?.experience ?? []).slice(0, 3).map(e => `${e.role} at ${e.company}`)].filter(Boolean).join("; ");
  const r = await chatJSON<z.infer<typeof PathwaySchema>>(
    [{ role: "user", content: pathwayDraftPrompt({ skill, trackLabel: track.label, profileSummary: summary }) }],
    { temperature: 0.4, maxTokens: 500, task: "drafting" },
    providerSettings,
    PathwaySchema,
  );
  return { steps: r.steps.slice(0, 6).map(s => s.slice(0, 240)), proof: r.proof.slice(0, 240), estimate: r.estimate.slice(0, 60) };
}

export { CAREER_TRACKS };
