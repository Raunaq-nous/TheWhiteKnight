// Merges two experience entries for the SAME employer (e.g. "Bain & Company"
// and "Bain and Company", created as separate roles by an import that ran
// before the name matcher treated "&" and "and" as equal).
//
// The --keep entry's title, tenure, location and current flag are kept
// exactly as they are. Every bullet from the --from entry that isn't
// already in the kept entry (exact text) is appended to it, along with its
// bulletTags category. The --from entry is then deleted. Near-duplicates
// are NOT deduped here on purpose: superseded legacy bullets are removed
// explicitly, by id, with scripts/audit-profile-bullets.ts --remove.
//
// USAGE:
//   npx tsx scripts/merge-employer-entries.ts <userEmail> --keep "Bain & Company" --from "Bain and Company"          # preview only
//   npx tsx scripts/merge-employer-entries.ts <userEmail> --keep "Bain & Company" --from "Bain and Company" --apply  # writes

import { profileRepo } from "../lib/server/repositories";
import { namesMatch, splitBullets } from "../lib/profile-merge";
import { employerCounts, formatCounts } from "./audit-profile-bullets";
import type { Profile, ExperienceEntry } from "../lib/profile";

export type MergePreview = {
  kept: Pick<ExperienceEntry, "company" | "role" | "tenure" | "location" | "current">;
  deleted: Pick<ExperienceEntry, "company" | "role" | "tenure" | "location" | "current">;
  folded: { text: string; category?: string }[];
  alreadyPresent: string[];
  bulletCountAfter: number;
};

export function mergeEmployerEntries(profile: Profile, keepCompany: string, fromCompany: string): { profile: Profile; preview: MergePreview } {
  const keepMatches = profile.experience.filter(e => e.company === keepCompany);
  const fromMatches = profile.experience.filter(e => e.company === fromCompany);
  if (keepMatches.length !== 1) throw new Error(`Expected exactly one entry named "${keepCompany}", found ${keepMatches.length}.`);
  if (fromMatches.length !== 1) throw new Error(`Expected exactly one entry named "${fromCompany}", found ${fromMatches.length}.`);
  const keep = keepMatches[0];
  const from = fromMatches[0];
  if (keep === from) throw new Error("--keep and --from name the same entry.");
  if (!namesMatch(keep.company, from.company)) throw new Error(`"${keepCompany}" and "${fromCompany}" are not the same employer.`);

  const keptBullets = splitBullets(keep.bullets);
  const existing = new Set(keptBullets);
  const folded: MergePreview["folded"] = [];
  const alreadyPresent: string[] = [];
  const tags = { ...(keep.bulletTags ?? {}) };
  for (const text of splitBullets(from.bullets)) {
    if (existing.has(text)) { alreadyPresent.push(text); continue; }
    existing.add(text);
    const category = from.bulletTags?.[text];
    if (category && !tags[text]) tags[text] = category;
    folded.push({ text, category });
  }

  const merged: ExperienceEntry = {
    ...keep,
    bullets: [...keptBullets, ...folded.map(f => f.text)].join("\n"),
    bulletTags: Object.keys(tags).length > 0 ? tags : undefined,
  };
  const experience = profile.experience.filter(e => e !== from).map(e => (e === keep ? merged : e));
  const pick = (e: ExperienceEntry) => ({ company: e.company, role: e.role, tenure: e.tenure, location: e.location, current: e.current });

  return {
    profile: { ...profile, experience },
    preview: { kept: pick(keep), deleted: pick(from), folded, alreadyPresent, bulletCountAfter: keptBullets.length + folded.length },
  };
}

export function formatMergePreview(p: MergePreview): string {
  const fmt = (e: MergePreview["kept"]) => `"${e.company}" | ${e.role} | ${e.tenure} | ${e.location || "(no location)"} | current=${e.current}`;
  return [
    `KEEP (unchanged fields):  ${fmt(p.kept)}`,
    `DELETE entry:             ${fmt(p.deleted)}`,
    `FOLD ${p.folded.length} bullet(s) into the kept entry:`,
    ...p.folded.map(f => `  + [${f.category ?? "untagged"}] ${f.text}`),
    ...(p.alreadyPresent.length ? [`SKIP ${p.alreadyPresent.length} already present`] : []),
    `Kept entry will have ${p.bulletCountAfter} bullet(s).`,
  ].join("\n");
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function main() {
  const userEmail = process.argv[2];
  const keep = arg("--keep");
  const from = arg("--from");
  if (!userEmail || !keep || !from) {
    console.error('Usage: npx tsx scripts/merge-employer-entries.ts <userEmail> --keep "<company>" --from "<company>" [--apply]');
    process.exit(1);
  }
  const profile = profileRepo.get(userEmail);
  if (!profile) {
    console.error(`No profile found for ${userEmail}.`);
    process.exit(1);
  }
  const { profile: next, preview } = mergeEmployerEntries(profile, keep, from);
  console.log(`Bullets per employer before:\n${formatCounts(employerCounts(profile))}\n`);
  console.log(formatMergePreview(preview));
  console.log(`\nBullets per employer after:\n${formatCounts(employerCounts(next))}`);
  if (!process.argv.includes("--apply")) {
    console.log("\nPreview only. Re-run with --apply to write.");
    return;
  }
  profileRepo.save(userEmail, next);
  console.log("\nMerged.");
}

if (process.argv[1]?.endsWith("merge-employer-entries.ts")) main();
