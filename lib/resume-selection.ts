// Selection, not rewriting — the core of this architecture. Resume
// generation's job for experience/projects/key wins is to pick which real
// profile bullets to show and rank them; it is structurally incapable of
// inventing prose for them. The model returns bullet IDs (see
// lib/profile-bullets.ts for how those ids are derived and presented in the
// prompt); this file is the ONLY place that turns an id into rendered text,
// by looking the id up in the profile and, only if it doesn't fit the
// length budget, compressing it with the same outcome-preserving clamp the
// one-page budget already uses (lib/resume-budget.ts) — so "compression"
// is a deterministic, outcome-safe operation, never a free LLM rewrite.
//
// Whatever free text the model wrote in a bullet's own "text"/"description"
// field is discarded here, unconditionally. An id that doesn't match a real
// profile bullet resolves to nothing — the bullet is dropped, never
// rendered with fabricated content. Free generation stays legitimate for
// exactly one field: the summary, which this module never touches.

import { Profile } from "./profile";
import { namesMatch } from "./profile-merge";
import { ResumeContent, ResumeBullet, ResumeProject } from "./resume-schema";
import { ProfileBulletRef, profileBulletIndex } from "./profile-bullets";
import { clampBulletPreservingOutcome, ONE_PAGE_BUDGET } from "./resume-budget";

/**
 * Resolves a single bullet id to real profile text. Returns null — never a
 * fabricated or partial string — when the id is unknown, or when even the
 * outcome-preserving compression can't fit it inside maxChars (dropping the
 * whole bullet rather than emit an impact-less fragment, same rule as the
 * one-page clamp).
 */
export function resolveBulletText(id: string | undefined | null, index: Map<string, ProfileBulletRef>, maxChars: number): string | null {
  if (!id) return null;
  const ref = index.get(id);
  if (!ref) return null;
  if (ref.text.length <= maxChars) return ref.text;
  return clampBulletPreservingOutcome(ref.text, maxChars);
}

/**
 * Turns the model's raw selection output (ids + priority, possibly with
 * unresolvable ids or model-authored text that must be ignored) into the
 * final ResumeContent that is safe to clamp, dedupe, and render — every
 * experience bullet, project, and key win in the result is either real
 * profile text or a deterministic compression of it, tagged with the
 * profile bullet id it came from.
 */
export function resolveResumeSelections(raw: ResumeContent, profile: Profile): ResumeContent {
  const index = profileBulletIndex(profile);

  const experience = raw.experience
    .map(e => ({
      ...e,
      bullets: e.bullets
        .map((b): ResumeBullet | null => {
          const text = resolveBulletText(b.sourceBulletId, index, ONE_PAGE_BUDGET.bulletMaxChars);
          return text ? { sourceBulletId: b.sourceBulletId, text, priority: b.priority } : null;
        })
        .filter((b): b is ResumeBullet => b !== null),
    }))
    // An entry the model proposed but whose every bullet id was invalid
    // contributes nothing real — dropping it here (rather than rendering an
    // empty role) is the same "no fabricated content" guarantee applied to
    // a whole entry.
    .filter(e => e.bullets.length > 0);

  const projects = (raw.projects ?? [])
    .map((p): ResumeProject | null => {
      const ref = p.sourceBulletId ? index.get(p.sourceBulletId) : undefined;
      if (!ref || ref.sourceType !== "project") return null;
      const text = resolveBulletText(p.sourceBulletId, index, ONE_PAGE_BUDGET.keyImpactItemMaxChars);
      if (!text) return null;
      const match = profile.projects?.find(pp => namesMatch(pp.name, ref.sourceId));
      return {
        sourceBulletId: p.sourceBulletId,
        name: match?.name ?? ref.sourceId,
        description: text,
        repoUrl: match?.repoUrl ?? null,
      };
    })
    .filter((p): p is ResumeProject => p !== null);

  const keyWinIds: string[] = [];
  const keyWins: string[] = [];
  for (const id of raw.keyWinIds ?? []) {
    const text = resolveBulletText(id, index, ONE_PAGE_BUDGET.keyImpactItemMaxChars);
    if (text) { keyWinIds.push(id); keyWins.push(text); }
  }

  return { ...raw, experience, projects, keyWinIds, keyWins };
}
