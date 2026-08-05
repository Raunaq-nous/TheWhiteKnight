// The interactive resume builder's data model: a JD requirement -> profile
// evidence coverage map, plus the pure (no LLM, no DOM) logic that powers
// the checkbox draft's live behavior — recomputing coverage the instant a
// bullet/section gets unchecked, and building the checked-state view of a
// ResumeContent that both the live preview and the final PDF render from.
//
// Generating the map itself (matching JD requirements to profile evidence)
// genuinely needs LLM judgment — see requirementMapPrompt in lib/prompts.ts
// and app/api/resume/requirement-map/route.ts. Everything in THIS file is
// deterministic and runs entirely client-side once the map exists, so
// toggling a checkbox never needs a round trip.

import { ResumeContent, ResumeSectionKey } from "./resume-schema";
import type { RequirementCoverage } from "./schemas";

export type { RequirementCoverage, ResumeRequirementMap } from "./schemas";
export type CoverageRating = "strong" | "weak" | "none";

export type LiveCoverage = RequirementCoverage & {
  liveRating: CoverageRating;
  lostEvidence: boolean; // true the instant an uncheck drops this from strong/weak to none
};

/**
 * Recomputes each requirement's LIVE rating against whatever text is
 * currently included (i.e. currently checked) in the draft. A requirement
 * whose evidence bullet got unchecked drops to "none" live, even though its
 * originally-generated rating (req.rating) stays around for reference.
 */
export function recomputeCoverage(requirements: RequirementCoverage[], includedTexts: Set<string>): LiveCoverage[] {
  return requirements.map(req => {
    if (!req.evidence) return { ...req, liveRating: req.rating, lostEvidence: false };
    const stillIncluded = includedTexts.has(req.evidence.bulletText);
    if (stillIncluded) return { ...req, liveRating: req.rating, lostEvidence: false };
    return { ...req, liveRating: "none", lostEvidence: req.rating !== "none" };
  });
}

// ---------------------------------------------------------------------------
// Checkbox state — every section and every individual bullet/keyWin/project
// item, all pre-checked. Keyed by index rather than a stable id since
// ResumeContent's bullets don't carry one; the builder always operates on a
// single frozen draft, so index stability isn't a concern within a session.
// ---------------------------------------------------------------------------

export type BuilderCheckedState = {
  sections: Partial<Record<ResumeSectionKey, boolean>>;
  experience: boolean[][]; // [entryIndex][bulletIndex]
  keyWins: boolean[];
  projects: boolean[];
};

export function defaultCheckedState(content: ResumeContent, sequence: ResumeSectionKey[]): BuilderCheckedState {
  const sections: Partial<Record<ResumeSectionKey, boolean>> = {};
  for (const key of sequence) sections[key] = true;
  return {
    sections,
    experience: content.experience.map(e => e.bullets.map(() => true)),
    keyWins: (content.keyWins ?? []).map(() => true),
    projects: (content.projects ?? []).map(() => true),
  };
}

/**
 * Applies the checkbox state to the underlying content, returning a NEW
 * ResumeContent containing only what's currently checked. Both the live
 * preview and the final PDF render from this — unchecking is never a
 * separate "delete" step, it's just what gets passed to the renderer.
 * An experience entry with zero remaining checked bullets is dropped
 * entirely (nothing to show), matching what the renderer would do anyway.
 */
export function applyCheckedState(content: ResumeContent, checked: BuilderCheckedState): ResumeContent {
  // "selectedImpact" is the combined Key Projects & Impact section — its
  // one checkbox covers both keyWins and projects together, since that's
  // how the layout presents it as a single section to the user.
  const impactSectionChecked = checked.sections.selectedImpact ?? checked.sections.keyWins ?? checked.sections.projects ?? true;
  const experienceSectionChecked = checked.sections.experience ?? true;

  const keyWins = impactSectionChecked
    ? (content.keyWins ?? []).filter((_, i) => checked.keyWins[i] ?? true)
    : [];
  const projects = impactSectionChecked
    ? (content.projects ?? []).filter((_, i) => checked.projects[i] ?? true)
    : [];
  const experience = experienceSectionChecked
    ? content.experience
        .map((e, i) => ({ ...e, bullets: e.bullets.filter((_, j) => checked.experience[i]?.[j] ?? true) }))
        .filter(e => e.bullets.length > 0)
    : [];

  return {
    ...content,
    summary: (checked.sections.summary ?? true) ? content.summary : "",
    keyWins,
    projects,
    experience,
    skills: (checked.sections.skills ?? true) ? content.skills : [],
    education: (checked.sections.education ?? true) ? content.education : [],
  };
}

/** Every bullet/keyWin/project TEXT currently included, for recomputeCoverage. */
export function collectIncludedTexts(applied: ResumeContent): Set<string> {
  const texts = new Set<string>();
  for (const w of applied.keyWins ?? []) texts.add(w);
  for (const p of applied.projects ?? []) texts.add(p.description);
  for (const e of applied.experience) for (const b of e.bullets) texts.add(b.text);
  return texts;
}

// ---------------------------------------------------------------------------
// Reactive-probe question — named, specific, never generic. Counts how many
// times a requirement's own words appear in the raw JD text as a rough
// "this JD lists it N times" signal (best-effort; falls back to no count
// phrase when it can't find a clean match).
// ---------------------------------------------------------------------------

function countRequirementMentions(requirement: string, jdText: string): number {
  const key = requirement.toLowerCase().trim();
  if (!key || !jdText) return 0;
  const haystack = jdText.toLowerCase();
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = haystack.indexOf(key, pos);
    if (idx === -1) break;
    count++;
    pos = idx + key.length;
  }
  return count;
}

/**
 * Builds the specific, named reactive-probe question for a requirement that
 * just lost its only evidence. Never generic — always names the exact
 * requirement, and mentions how many times the JD emphasizes it when that
 * count is genuinely known (>= 2).
 */
export function buildReactiveProbeQuestion(req: LiveCoverage, jdText = ""): string {
  const mentions = countRequirementMentions(req.requirement, jdText);
  const emphasis = mentions >= 2 ? `, which this JD mentions ${mentions} times` : "";
  return `You removed the only bullet covering "${req.requirement}"${emphasis}. Do you have another engagement with a quantified result that addresses it?`;
}

/** All requirements that just lost coverage after a toggle — the set the UI should surface reactive-probe callouts for. */
export function findNewlyUncovered(live: LiveCoverage[]): LiveCoverage[] {
  return live.filter(r => r.lostEvidence);
}
