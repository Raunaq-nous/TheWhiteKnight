// ONE-SHOT SCAN + DEDUPE — finds experience bullets within the SAME
// employer that describe the same underlying engagement but are phrased
// differently (e.g. the master-profile import creating a second, differently-
// worded "EMEA B2B Series A" bullet under Aranca alongside one that was
// already there). lib/profile-merge.ts's isNewBullet only runs at IMPORT
// time, comparing a candidate against what's already in the profile — it
// can't retroactively catch a duplicate that's already landed in a single
// profile from two separate imports/edits. This script scans what's
// already there.
//
// Detection reuses the SAME semantic check profile-merge.ts now uses at
// import time (lib/resume-dedupe.ts's sameEngagement, containment-based —
// catches near-duplicates Jaccard alone misses) plus the plain Jaccard
// textSimilarity check, at the same thresholds.
//
// Within a duplicate pair, the LONGER (more detailed) bullet is kept; the
// shorter one is dropped. If the dropped bullet carried an explicit
// bulletTags category and the survivor has none, the tag is carried over
// rather than lost.
//
// USAGE:
//   npx tsx scripts/dedupe-profile-bullets.ts <userEmail>            # dry run — prints found duplicates, writes nothing
//   npx tsx scripts/dedupe-profile-bullets.ts <userEmail> --apply    # prints AND applies the dedupe
//
// Reads/writes the same SQLite DB the app itself uses (CAREEROS_DB_PATH /
// CAREEROS_PRIVATE_DIR env vars, same resolution as lib/server/db.ts).

import { profileRepo } from "../lib/server/repositories";
import { getSeedProfile } from "../lib/profile";
import { textSimilarity, splitBullets } from "../lib/profile-merge";
import { sameEngagement } from "../lib/resume-dedupe";
import type { Profile, ExperienceEntry, BulletCategory } from "../lib/profile";

const TEXT_SIMILARITY_THRESHOLD = 0.6;

export type DuplicatePair = {
  company: string;
  keptText: string;
  droppedText: string;
  reason: "text_similarity" | "same_engagement";
};

// Same thresholds lib/profile-merge.ts's isNewBullet uses (the default
// sameEngagement threshold, 0.5) — deliberately conservative, not the
// looser 0.4 an earlier pass here tried: at 0.4, two genuinely distinct
// consulting engagements under the same employer (e.g. a beverage-company
// GTM launch and an unrelated consumer-electronics repositioning) shared
// enough generic strategy-consulting vocabulary (channel, market,
// strategy...) to false-positive as "the same engagement" even though
// they plainly are not. This script deletes bullets on --apply, so a
// false positive here is worse than the alternative script (profile-
// merge.ts's import-time diff) where it just means a reviewer sees one
// fewer "new" item — hence staying at the more conservative default.
function isDuplicatePair(a: string, b: string): DuplicatePair["reason"] | null {
  if (textSimilarity(a, b) >= TEXT_SIMILARITY_THRESHOLD) return "text_similarity";
  if (sameEngagement(a, b)) return "same_engagement";
  return null;
}

/**
 * Scans one experience entry's bullets for internal duplicates. Returns the
 * deduped bullet list (longer text wins), the updated bulletTags (a tag
 * carried over from a dropped bullet to its surviving duplicate when the
 * survivor had none), and every pair found (for reporting).
 */
export function dedupeExperienceEntry(entry: ExperienceEntry): {
  bullets: string[];
  bulletTags: Record<string, BulletCategory> | undefined;
  pairs: DuplicatePair[];
} {
  const bullets = splitBullets(entry.bullets);
  const dropped = new Set<number>();
  const pairs: DuplicatePair[] = [];
  const tags = { ...(entry.bulletTags ?? {}) };

  for (let i = 0; i < bullets.length; i++) {
    if (dropped.has(i)) continue;
    for (let j = i + 1; j < bullets.length; j++) {
      if (dropped.has(j)) continue;
      const reason = isDuplicatePair(bullets[i], bullets[j]);
      if (!reason) continue;
      const [keepIdx, dropIdx] = bullets[i].length >= bullets[j].length ? [i, j] : [j, i];
      dropped.add(dropIdx);
      pairs.push({ company: entry.company, keptText: bullets[keepIdx], droppedText: bullets[dropIdx], reason });
      // Carry the dropped bullet's explicit category tag over to the
      // survivor if the survivor doesn't already have one of its own.
      const droppedTag = tags[bullets[dropIdx]];
      if (droppedTag && !tags[bullets[keepIdx]]) tags[bullets[keepIdx]] = droppedTag;
      delete tags[bullets[dropIdx]];
      if (dropIdx === i) break; // i itself was dropped — move to the next i
    }
  }

  const survivors = bullets.filter((_, idx) => !dropped.has(idx));
  return { bullets: survivors, bulletTags: Object.keys(tags).length > 0 ? tags : undefined, pairs };
}

export function dedupeProfile(profile: Profile): { profile: Profile; pairs: DuplicatePair[] } {
  const allPairs: DuplicatePair[] = [];
  const experience = profile.experience.map(e => {
    const { bullets, bulletTags, pairs } = dedupeExperienceEntry(e);
    allPairs.push(...pairs);
    if (pairs.length === 0) return e;
    return { ...e, bullets: bullets.join("\n"), bulletTags };
  });
  return { profile: { ...profile, experience }, pairs: allPairs };
}

function main() {
  const userEmail = process.argv[2] || process.env.ADMIN_EMAIL;
  const apply = process.argv[3] === "--apply";
  if (!userEmail) {
    console.error("Usage: npx tsx scripts/dedupe-profile-bullets.ts <userEmail> [--apply]");
    process.exit(1);
  }

  const existing = profileRepo.get(userEmail) ?? getSeedProfile();
  const { profile: deduped, pairs } = dedupeProfile(existing);

  console.log(`Found ${pairs.length} duplicate bullet pair${pairs.length === 1 ? "" : "s"}:\n`);
  for (const p of pairs) {
    console.log(`[${p.company}] (${p.reason})`);
    console.log(`  KEEP:  ${p.keptText}`);
    console.log(`  DROP:  ${p.droppedText}\n`);
  }

  if (!apply) {
    console.log(pairs.length > 0 ? "Dry run only — nothing written. Re-run with --apply to remove these." : "No duplicates found.");
    return;
  }

  if (pairs.length === 0) {
    console.log("No duplicates found — nothing to apply.");
    return;
  }

  profileRepo.save(userEmail, deduped);
  console.log(`Applied — removed ${pairs.length} duplicate bullet${pairs.length === 1 ? "" : "s"}.`);
}

if (process.argv[1] && process.argv[1].endsWith("dedupe-profile-bullets.ts")) {
  main();
}
