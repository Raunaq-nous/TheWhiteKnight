// Stable bullet identity — the foundation of the "resume generation selects,
// it does not rewrite" architecture. Every experience bullet and every
// project description in the profile gets a deterministic ID derived from
// its content, so the SAME bullet always resolves to the SAME ID across a
// prompt build, the model's selection, dedupe, the checkbox UI, and a later
// gap-fill write-back — with no id column to add to profile storage and no
// migration of existing profile data. An ID changes only if the bullet's own
// text changes, which is the correct behavior: an edited bullet is, for
// selection purposes, a new bullet.

import { Profile } from "./profile";

export type ProfileBulletSourceType = "experience" | "project";

export type ProfileBulletRef = {
  id: string;
  sourceType: ProfileBulletSourceType;
  // Company name (experience) or project name (project) — the same join key
  // namesMatch()/appendGapAnswerToProfile() already use everywhere else in
  // this codebase, so a resolved bullet's provenance can always be traced
  // back to a real profile entry with the existing lookup convention.
  sourceId: string;
  sourceLabel: string;
  text: string;
};

// djb2 — small, deterministic, no crypto dependency needed (this runs
// client-side in the builder as well as server-side in prompt/resolution
// code), collision-safe enough for a few hundred bullets in one profile.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function bulletId(sourceType: ProfileBulletSourceType, sourceId: string, text: string): string {
  const prefix = sourceType === "experience" ? "e" : "p";
  return `${prefix}_${hash(`${sourceType}::${sourceId.trim().toLowerCase()}::${text.trim().toLowerCase()}`)}`;
}

/**
 * Every selectable unit of profile evidence, flattened: one entry per
 * experience bullet line, one entry per project description. Entries
 * flagged excludeFromResume, and empty text, never appear here — they are
 * structurally unselectable, not just discouraged in the prompt.
 */
export function listProfileBullets(profile: Profile): ProfileBulletRef[] {
  const out: ProfileBulletRef[] = [];

  for (const e of profile.experience) {
    if (e.excludeFromResume) continue;
    const lines = (e.bullets ?? "").split("\n").map(b => b.trim()).filter(Boolean);
    for (const text of lines) {
      out.push({
        id: bulletId("experience", e.company, text),
        sourceType: "experience",
        sourceId: e.company,
        sourceLabel: `${e.company} — ${e.role}`,
        text,
      });
    }
  }

  for (const p of profile.projects ?? []) {
    const text = (p.description ?? "").trim();
    if (!text) continue;
    out.push({
      id: bulletId("project", p.name, text),
      sourceType: "project",
      sourceId: p.name,
      sourceLabel: p.name,
      text,
    });
  }

  return out;
}

export function profileBulletIndex(profile: Profile): Map<string, ProfileBulletRef> {
  return new Map(listProfileBullets(profile).map(b => [b.id, b]));
}

/**
 * The prompt-facing rendering of every selectable bullet, grouped by role/
 * project, each line tagged with its id — this is the ONLY form in which
 * bullet text reaches the resume-generation prompt for selection purposes.
 * The model picks ids from this list; it never authors new bullet prose for
 * experience or projects (see lib/resume-selection.ts, which enforces this
 * server-side regardless of what the model actually returns).
 */
export function renderAvailableBulletsBlock(profile: Profile): string {
  const bullets = listProfileBullets(profile);
  if (bullets.length === 0) return "";
  const byLabel = new Map<string, ProfileBulletRef[]>();
  for (const b of bullets) {
    const arr = byLabel.get(b.sourceLabel) ?? [];
    arr.push(b);
    byLabel.set(b.sourceLabel, arr);
  }
  const lines: string[] = [];
  for (const [label, items] of byLabel) {
    lines.push(`${label}:`);
    for (const b of items) lines.push(`  [${b.id}] ${b.text}`);
  }
  return lines.join("\n");
}
