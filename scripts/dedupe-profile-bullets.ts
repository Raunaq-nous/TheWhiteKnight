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
//   npx tsx scripts/dedupe-profile-bullets.ts <userEmail>                          # dry run — prints found duplicates, writes nothing
//   npx tsx scripts/dedupe-profile-bullets.ts <userEmail> --except <dropIds>       # veto pairs: those DROP bullets are kept
//   npx tsx scripts/dedupe-profile-bullets.ts <userEmail> [--except ...] --apply   # prints AND applies the dedupe
//
// Reads/writes the same SQLite DB the app itself uses (CAREEROS_DB_PATH /
// CAREEROS_PRIVATE_DIR env vars, same resolution as lib/server/db.ts).

import { profileRepo } from "../lib/server/repositories";
import { getSeedProfile } from "../lib/profile";
import { textSimilarity, splitBullets } from "../lib/profile-merge";
import { sameEngagement, engagementContainment } from "../lib/resume-dedupe";
import { impactDensity } from "../lib/resume-bullet-relevance";
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
  keptOrigin: "imported" | "legacy";
  droppedOrigin: "imported" | "legacy";
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

function opensWithVerb(sentence: string): boolean {
  const word = sentence.trim().split(/\s+/)[0] ?? "";
  const first = word.toLowerCase().replace(/[^a-z-]/g, "");
  if (!first) return false;
  return ACTION_VERBS.has(first) || (/^[a-z-]{4,}ed$/.test(first) && !/:$/.test(word));
}

/** A full sentence opens with an action verb; a fragment opens with a noun phrase, a figure, or a client name. */
export function isVerbLed(text: string): boolean {
  return opensWithVerb(text);
}

// An OUTCOME is what the work produced or changed: a number/scope marker, a
// consequence ("pinpointing high-value growth opportunities", "unlocking
// investment"), or a named decision. Deliberately NOT the format gate's
// broader hasIdentifiableOutcome, whose "delivered artifact" family counts
// "Built ... framework" / "Developed ... strategy" / "Structured ...
// analysis" as an outcome. For a consulting bullet that phrase is the
// activity itself, so it let legacy fragments beat fuller sentences.
const RESULT_CONSEQUENCE =
  /\b(enabling|enabled|resulting in|which led to|leading to|led to|used for|adopted by|driving|drove|informing|informed|guiding|guided|shaping|shaped|pinpointing|pinpointed|identifying|unlocking|unlocked|securing|secured|lifting|lifted|cutting|reducing|reduced|increasing|increased|improving|improved|contributing to|winning|won|closing|closed|that unlocked|that lifted|that informed)\b/i;
const RESULT_DECISION =
  /\bboard[- ]level (recommendation|decision)\b|\binvestment commitment\b|\bc-suite (decision|decision document|recommendation)\b|\binvestment-committee\b/i;

export function hasResultClause(text: string): boolean {
  return impactDensity(text) > 0 || RESULT_CONSEQUENCE.test(text) || RESULT_DECISION.test(text);
}

const IMPORTED_TEXTS = new Set(EXPERIENCE_CANDIDATES.flatMap(c => c.bullets));

type Ranked = { text: string; verbLed: boolean; hasOutcome: boolean; density: number; imported: boolean };

function rankOf(text: string, imported: Set<string> = IMPORTED_TEXTS): Ranked {
  return { text, verbLed: isVerbLed(text), hasOutcome: hasResultClause(text), density: impactDensity(text), imported: imported.has(text) };
}

/** Negative when a should survive over b. */
export function compareSurvivor(a: string, b: string, imported: Set<string> = IMPORTED_TEXTS): number {
  const ra = rankOf(a, imported), rb = rankOf(b, imported);
  return (Number(rb.verbLed) - Number(ra.verbLed))
    || (Number(rb.hasOutcome) - Number(ra.hasOutcome))
    || (rb.density - ra.density)
    || (Number(rb.imported) - Number(ra.imported))
    || (b.length - a.length);
}

function whyKept(kept: string, dropped: string, imported: Set<string> = IMPORTED_TEXTS): string {
  const k = rankOf(kept, imported), d = rankOf(dropped, imported);
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
export function dedupeExperienceEntry(entry: ExperienceEntry, except: Set<string> = new Set()): {
  bullets: string[];
  bulletTags: Record<string, BulletCategory> | undefined;
  importedBullets: string[] | undefined;
  pairs: DuplicatePair[];
} {
  const bullets = splitBullets(entry.bullets);
  // Imported = master-spec text OR recorded on the entry by import/merge.
  const importedSet = new Set([...IMPORTED_TEXTS, ...(entry.importedBullets ?? [])]);
  const order = bullets.map((_, i) => i).sort((x, y) => compareSurvivor(bullets[x], bullets[y], importedSet) || x - y);
  const kept: number[] = [];
  const dropped = new Set<number>();
  const pairs: DuplicatePair[] = [];
  const tags = { ...(entry.bulletTags ?? {}) };
  const id = (t: string) => bulletId("experience", entry.company, t);

  for (const i of order) {
    // A vetoed bullet (--except) is never dropped, whatever it duplicates.
    const survivor = except.has(id(bullets[i])) ? undefined : kept.find(k => isDuplicatePair(bullets[k], bullets[i]));
    if (survivor === undefined) { kept.push(i); continue; }
    dropped.add(i);
    const keptText = bullets[survivor], droppedText = bullets[i];
    pairs.push({
      company: entry.company, keptText, droppedText, keptId: id(keptText), droppedId: id(droppedText),
      reason: isDuplicatePair(keptText, droppedText)!,
      overlap: Math.max(engagementContainment(keptText, droppedText), textSimilarity(keptText, droppedText)),
      whyKept: whyKept(keptText, droppedText, importedSet),
      keptOrigin: importedSet.has(keptText) ? "imported" : "legacy",
      droppedOrigin: importedSet.has(droppedText) ? "imported" : "legacy",
    });
    const droppedTag = tags[droppedText];
    if (droppedTag && !tags[keptText]) tags[keptText] = droppedTag;
    delete tags[droppedText];
  }

  const survivors = bullets.filter((_, idx) => !dropped.has(idx));
  const importedBullets = entry.importedBullets?.filter(t => survivors.includes(t));
  return { bullets: survivors, bulletTags: Object.keys(tags).length > 0 ? tags : undefined, importedBullets, pairs };
}

export function dedupeProfile(profile: Profile, except: Set<string> = new Set()): { profile: Profile; pairs: DuplicatePair[] } {
  const allPairs: DuplicatePair[] = [];
  const experience = profile.experience.map(e => {
    const { bullets, bulletTags, importedBullets, pairs } = dedupeExperienceEntry(e, except);
    allPairs.push(...pairs);
    if (pairs.length === 0) return e;
    return { ...e, bullets: bullets.join("\n"), bulletTags, importedBullets };
  });
  return { profile: { ...profile, experience }, pairs: allPairs };
}

export function formatPairs(pairs: DuplicatePair[]): string {
  const out = [`Found ${pairs.length} duplicate bullet pair${pairs.length === 1 ? "" : "s"} (one per bullet that would be dropped):`];
  pairs.forEach((p, n) => {
    out.push(`\n${n + 1}. [${p.company}] ${p.reason} ${p.overlap.toFixed(2)}, kept because: ${p.whyKept}`);
    out.push(`   KEEP [${p.keptId}] (${p.keptOrigin}): ${p.keptText}`);
    out.push(`   DROP [${p.droppedId}] (${p.droppedOrigin}): ${p.droppedText}`);
  });
  return out.join("\n");
}

function main() {
  const userEmail = process.argv[2] || process.env.ADMIN_EMAIL;
  const apply = process.argv.includes("--apply");
  if (!userEmail || userEmail.startsWith("--")) {
    console.error("Usage: npx tsx scripts/dedupe-profile-bullets.ts <userEmail> [--except id,id,...] [--apply]");
    process.exit(1);
  }
  const exceptIdx = process.argv.indexOf("--except");
  const except = new Set(exceptIdx === -1 ? [] : (process.argv[exceptIdx + 1] ?? "").split(",").map(x => x.trim()).filter(Boolean));

  const existing = profileRepo.get(userEmail) ?? getSeedProfile();
  const { profile: deduped, pairs } = dedupeProfile(existing, except);

  if (except.size > 0) {
    const known = new Set(existing.experience.flatMap(e => splitBullets(e.bullets).map(t => bulletId("experience", e.company, t))));
    const unknown = [...except].filter(x => !known.has(x));
    console.log(`Vetoed ${except.size - unknown.length} pair(s) via --except (those bullets are kept).`);
    if (unknown.length > 0) {
      console.error(`--except ids not found in the live profile: ${unknown.join(", ")}. Nothing written.`);
      process.exit(1);
    }
  }
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
