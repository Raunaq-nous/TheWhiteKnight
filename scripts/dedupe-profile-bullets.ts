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
// SURVIVOR RULE. Bullets are ranked best-first, and a bullet is dropped
// only when it duplicates one already kept, so every KEEP shown is a real
// survivor (the old pairwise scan could print a KEEP that a later pair then
// dropped). Ranking, in order:
//   0. a full, verb-led sentence always beats a fragment (a noun phrase, a
//      "$10B ...:" label, or a bare client name). Hard rule, checked first.
//   1. has an outcome clause (quantified or qualitative)
//   2. higher impact density (count of $/%/scope markers)
//   3. imported master-spec text over legacy (tiebreak only)
//   4. longer text
// A dropped bullet's bulletTags category moves to its survivor if the
// survivor has none.
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
import { sameEngagement, engagementContainment } from "../lib/resume-dedupe";
import { outcomeBucket, impactDensity } from "../lib/resume-bullet-relevance";
import { bulletId } from "../lib/profile-bullets";
import { EXPERIENCE_CANDIDATES } from "./import-master-profile";
import type { Profile, ExperienceEntry, BulletCategory } from "../lib/profile";

const TEXT_SIMILARITY_THRESHOLD = 0.6;

export type DuplicatePair = {
  company: string;
  keptText: string;
  droppedText: string;
  keptId: string;
  droppedId: string;
  reason: "text_similarity" | "same_engagement";
  overlap: number;
  whyKept: string;
};

const ACTION_VERBS = new Set([
  "led", "built", "drove", "delivered", "designed", "developed", "created", "launched", "managed", "owned",
  "defined", "co-founded", "cofounded", "founded", "served", "advised", "identified", "structured", "produced",
  "authored", "shipped", "scaled", "grew", "reduced", "increased", "negotiated", "secured", "established",
  "implemented", "deployed", "spearheaded", "directed", "ran", "executed", "analyzed", "analysed", "assessed",
  "evaluated", "modeled", "modelled", "mapped", "formulated", "oversaw", "partnered", "supported", "conducted",
  "orchestrated", "transformed", "redesigned", "automated", "architected", "engineered", "won", "earned",
  "published", "presented", "mentored", "coached", "hired", "trained", "cut", "lifted", "generated",
  "unlocked", "enabled", "facilitated", "prepared", "researched", "synthesized", "synthesised", "translated",
  "crafted", "pioneered", "headed", "championed", "streamlined", "optimized", "optimised", "originated",
]);

/** A full sentence opens with an action verb; a fragment opens with a noun phrase, a figure, or a client name. */
export function isVerbLed(text: string): boolean {
  const first = text.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z-]/g, "") ?? "";
  if (!first) return false;
  return ACTION_VERBS.has(first) || (/^[a-z-]{4,}ed$/.test(first) && !/:$/.test(text.trim().split(/\s+/)[0]));
}

const IMPORTED_TEXTS = new Set(EXPERIENCE_CANDIDATES.flatMap(c => c.bullets));

type Ranked = { text: string; verbLed: boolean; hasOutcome: boolean; density: number; imported: boolean };

function rankOf(text: string): Ranked {
  return { text, verbLed: isVerbLed(text), hasOutcome: outcomeBucket(text) > 0, density: impactDensity(text), imported: IMPORTED_TEXTS.has(text) };
}

/** Negative when a should survive over b. */
export function compareSurvivor(a: string, b: string): number {
  const ra = rankOf(a), rb = rankOf(b);
  return (Number(rb.verbLed) - Number(ra.verbLed))
    || (Number(rb.hasOutcome) - Number(ra.hasOutcome))
    || (rb.density - ra.density)
    || (Number(rb.imported) - Number(ra.imported))
    || (b.length - a.length);
}

function whyKept(kept: string, dropped: string): string {
  const k = rankOf(kept), d = rankOf(dropped);
  if (k.verbLed !== d.verbLed) return "full sentence over fragment";
  if (k.hasOutcome !== d.hasOutcome) return "has an outcome clause";
  if (k.density !== d.density) return `impact density ${k.density} vs ${d.density}`;
  if (k.imported !== d.imported) return "imported (tiebreak)";
  return "longer";
}

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
 * Scans one experience entry's bullets for internal duplicates, best-first
 * (see SURVIVOR RULE above). Returns the surviving bullets in their original
 * order, the updated bulletTags, and one pair per dropped bullet naming the
 * survivor it duplicates.
 */
export function dedupeExperienceEntry(entry: ExperienceEntry): {
  bullets: string[];
  bulletTags: Record<string, BulletCategory> | undefined;
  pairs: DuplicatePair[];
} {
  const bullets = splitBullets(entry.bullets);
  const order = bullets.map((_, i) => i).sort((x, y) => compareSurvivor(bullets[x], bullets[y]) || x - y);
  const kept: number[] = [];
  const dropped = new Set<number>();
  const pairs: DuplicatePair[] = [];
  const tags = { ...(entry.bulletTags ?? {}) };
  const id = (t: string) => bulletId("experience", entry.company, t);

  for (const i of order) {
    const survivor = kept.find(k => isDuplicatePair(bullets[k], bullets[i]));
    if (survivor === undefined) { kept.push(i); continue; }
    dropped.add(i);
    const keptText = bullets[survivor], droppedText = bullets[i];
    pairs.push({
      company: entry.company, keptText, droppedText, keptId: id(keptText), droppedId: id(droppedText),
      reason: isDuplicatePair(keptText, droppedText)!,
      overlap: Math.max(engagementContainment(keptText, droppedText), textSimilarity(keptText, droppedText)),
      whyKept: whyKept(keptText, droppedText),
    });
    const droppedTag = tags[droppedText];
    if (droppedTag && !tags[keptText]) tags[keptText] = droppedTag;
    delete tags[droppedText];
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

export function formatPairs(pairs: DuplicatePair[]): string {
  const out = [`Found ${pairs.length} duplicate bullet pair${pairs.length === 1 ? "" : "s"} (one per bullet that would be dropped):`];
  pairs.forEach((p, n) => {
    const tag = (t: string) => (IMPORTED_TEXTS.has(t) ? "imported" : "legacy");
    out.push(`\n${n + 1}. [${p.company}] ${p.reason} ${p.overlap.toFixed(2)}, kept because: ${p.whyKept}`);
    out.push(`   KEEP [${p.keptId}] (${tag(p.keptText)}): ${p.keptText}`);
    out.push(`   DROP [${p.droppedId}] (${tag(p.droppedText)}): ${p.droppedText}`);
  });
  return out.join("\n");
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

  console.log(formatPairs(pairs));

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
