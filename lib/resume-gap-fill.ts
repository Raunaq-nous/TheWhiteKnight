// Job-time gap-fill: injecting an answered gap-question bullet into the
// CURRENT resume being built. Writing the same fact back to the canonical
// profile is a separate concern — see appendGapAnswerToProfile in
// lib/profile-enrichment.ts, which reuses the merge engine's dedupe rule.

import { ResumeContent } from "./resume-schema";
import { namesMatch } from "./profile-merge";
import { bulletId } from "./profile-bullets";

export type GapFillTargetType = "experience" | "project";

/**
 * Append a freshly-answered bullet into the matching experience entry
 * (priority 1 — it directly answers a JD gap, so it should survive any
 * later trim) or onto a matching project's description. Returns the
 * content unchanged with applied:false if no matching entry exists —
 * callers should surface that rather than silently dropping the answer.
 *
 * This is the one deliberate exception to "selection, not writing"
 * (lib/resume-selection.ts): the user just supplied this fact themselves
 * and approved it going onto the resume, so authoring its bullet text here
 * is legitimate, the same way writing the summary is. The id computed for
 * it (bulletId) is the SAME id appendGapAnswerToProfile computes when this
 * same text is written back to the canonical profile, so once that write-
 * back lands, this bullet's provenance matches a real profile bullet like
 * any other, going forward.
 */
export function injectGapAnswerIntoResume(
  content: ResumeContent,
  targetType: GapFillTargetType,
  targetId: string,
  newBulletText: string,
): { content: ResumeContent; applied: boolean } {
  if (targetType === "experience") {
    let applied = false;
    const experience = content.experience.map(e => {
      if (applied || !namesMatch(e.company, targetId)) return e;
      applied = true;
      return { ...e, bullets: [...e.bullets, { sourceBulletId: bulletId("experience", targetId, newBulletText), text: newBulletText, priority: 1 }] };
    });
    return { content: { ...content, experience }, applied };
  }

  let applied = false;
  const projects = (content.projects ?? []).map(p => {
    if (applied || !namesMatch(p.name, targetId)) return p;
    applied = true;
    return { ...p, description: `${p.description} ${newBulletText}`.trim() };
  });
  return { content: { ...content, projects }, applied };
}
