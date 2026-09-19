// BULLET ID DRIFT — a saved resume's experience bullets, projects, and key
// wins are all tagged with a sourceBulletId (see lib/profile-bullets.ts):
// a deterministic hash of that bullet's TEXT. Editing the underlying
// profile bullet changes its text, which changes its id — the saved
// resume still has the OLD id and OLD (now-stale) text, but that id no
// longer resolves against the current profile at all. Silently rendering
// the stale text forever, with no signal that the source of truth moved
// on, is the actual bug this module exists to catch: detection only,
// never a mutation — the caller decides whether to warn, re-resolve, or
// regenerate.
import type { ResumeContent } from "./resume-schema";
import type { Profile } from "./profile";
import { listProfileBullets, profileBulletIndex, ProfileBulletRef } from "./profile-bullets";

export type DriftedBulletLocation = "experience" | "project" | "keyWin";

export type DriftedBullet = {
  location: DriftedBulletLocation;
  sourceBulletId: string;
  // The stale text this resume currently shows for this slot — still
  // real, still rendered; just no longer traceable to a current profile
  // bullet.
  text: string;
  // Which employer this bullet is under (experience only) — lets a
  // re-resolve UI offer only CURRENT bullets from the SAME role, never a
  // replacement from an unrelated job.
  company?: string;
};

/**
 * Finds every bullet/project/key-win in a SAVED resume whose
 * sourceBulletId no longer resolves against the CURRENT profile. Pure —
 * never mutates `content`; this is detection only.
 */
export function findDriftedBullets(content: ResumeContent, profile: Profile): DriftedBullet[] {
  const index = profileBulletIndex(profile);
  const drifted: DriftedBullet[] = [];

  for (const e of content.experience) {
    for (const b of e.bullets) {
      if (b.sourceBulletId && !index.has(b.sourceBulletId)) {
        drifted.push({ location: "experience", sourceBulletId: b.sourceBulletId, text: b.text, company: e.company });
      }
    }
  }

  for (const p of content.projects ?? []) {
    if (p.sourceBulletId && !index.has(p.sourceBulletId)) {
      drifted.push({ location: "project", sourceBulletId: p.sourceBulletId, text: p.description });
    }
  }

  (content.keyWinIds ?? []).forEach((id, i) => {
    if (id && !index.has(id)) {
      drifted.push({ location: "keyWin", sourceBulletId: id, text: content.keyWins?.[i] ?? "" });
    }
  });

  return drifted;
}

/**
 * Current, real profile bullets available as re-resolve replacements for a
 * drifted EXPERIENCE bullet — restricted to the SAME employer, so a
 * replacement never misattributes an achievement to the wrong role.
 */
export function replacementCandidates(profile: Profile, company: string): ProfileBulletRef[] {
  const prefix = `${company} — `;
  return listProfileBullets(profile).filter(b => b.sourceType === "experience" && b.sourceLabel.startsWith(prefix));
}
