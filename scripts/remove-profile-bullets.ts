// Plain, hand-picked removal of experience bullets by id. No overlap,
// superseded or duplicate requirement: you chose these. Every id must exist
// in the live profile, or the whole run aborts with nothing written.
//
// USAGE:
//   npx tsx scripts/remove-profile-bullets.ts <userEmail> <id,id,...>           # preview only
//   npx tsx scripts/remove-profile-bullets.ts <userEmail> <id,id,...> --apply   # writes

import { profileRepo } from "../lib/server/repositories";
import { splitBullets } from "../lib/profile-merge";
import { bulletId } from "../lib/profile-bullets";
import { removeBullets, employerCounts, formatCounts } from "./audit-profile-bullets";
import type { Profile } from "../lib/profile";

export type RemovalPlan = {
  found: { id: string; company: string; text: string }[];
  missing: string[];
};

export function planRemoval(profile: Profile, ids: string[]): RemovalPlan {
  const index = new Map<string, { company: string; text: string }>();
  for (const e of profile.experience) {
    for (const text of splitBullets(e.bullets)) index.set(bulletId("experience", e.company, text), { company: e.company, text });
  }
  const unique = [...new Set(ids)];
  return {
    found: unique.filter(id => index.has(id)).map(id => ({ id, ...index.get(id)! })),
    missing: unique.filter(id => !index.has(id)),
  };
}

export function parseIds(arg: string | undefined): string[] {
  return (arg ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

function main() {
  const [userEmail, idArg] = process.argv.slice(2);
  const apply = process.argv.includes("--apply");
  const ids = parseIds(idArg?.startsWith("--") ? undefined : idArg);
  if (!userEmail || userEmail.startsWith("--") || ids.length === 0) {
    console.error("Usage: npm run remove:profile-bullets -- <userEmail> <id,id,...> [--apply]");
    process.exit(1);
  }
  const profile = profileRepo.get(userEmail);
  if (!profile) {
    console.error(`No profile found for ${userEmail}. Nothing written.`);
    process.exit(1);
  }

  const { found, missing } = planRemoval(profile, ids);
  if (missing.length > 0) {
    console.error(`Unknown bullet id(s), not in the live profile: ${missing.join(", ")}`);
    console.error("Aborted. Nothing written.");
    process.exit(1);
  }

  console.log(`Would remove ${found.length} bullet(s):\n`);
  for (const f of found) console.log(`  [${f.id}] ${f.company}\n      ${f.text}\n`);
  const { profile: next, removed } = removeBullets(profile, new Set(found.map(f => f.id)));
  console.log(`Bullets per employer after removal:\n${formatCounts(employerCounts(next))}`);

  if (!apply) {
    console.log("\nPreview only. Re-run with --apply to write.");
    return;
  }
  profileRepo.save(userEmail, next);
  console.log(`\nRemoved ${removed.length} bullet(s).`);
}

if (process.argv[1]?.endsWith("remove-profile-bullets.ts")) main();
