// Re-marks hand-picked experience bullets as imported (master-profile
// import) and sets their category tag. For bullets that lost their marker
// and tag in a merge, so the audit stopped treating them as imported.
//
// Category, per bullet: --category if given; otherwise the matching
// master-spec bullet's category (exact text, else the closest same-employer
// spec bullet at >= 0.5 overlap). A bullet with no category source aborts the
// run. Any unknown id aborts the run. Nothing is written without --apply.
//
// USAGE:
//   npx tsx scripts/tag-imported-bullets.ts <userEmail> <id,id,...> [--category consulting_engagement|ai_build] [--apply]

import { profileRepo } from "../lib/server/repositories";
import { splitBullets } from "../lib/profile-merge";
import { bulletId } from "../lib/profile-bullets";
import { engagementContainment } from "../lib/resume-dedupe";
import { specTagsFor } from "./import-master-profile";
import type { Profile, BulletCategory } from "../lib/profile";

const CATEGORIES: BulletCategory[] = ["consulting_engagement", "ai_build"];

export type TagPlan = {
  items: { id: string; company: string; text: string; category: BulletCategory | null; source: string }[];
  missing: string[];
};

export function planTagging(profile: Profile, ids: string[], forced?: BulletCategory): TagPlan {
  const items: TagPlan["items"] = [];
  const found = new Set<string>();
  for (const e of profile.experience) {
    const spec = specTagsFor(e.company) ?? {};
    for (const text of splitBullets(e.bullets)) {
      const id = bulletId("experience", e.company, text);
      if (!ids.includes(id)) continue;
      found.add(id);
      if (forced) { items.push({ id, company: e.company, text, category: forced, source: "--category" }); continue; }
      if (spec[text]) { items.push({ id, company: e.company, text, category: spec[text], source: "master spec (exact text)" }); continue; }
      let best: { text: string; c: number } | null = null;
      for (const specText of Object.keys(spec)) {
        const c = engagementContainment(text, specText);
        if (!best || c > best.c) best = { text: specText, c };
      }
      if (best && best.c >= 0.5) items.push({ id, company: e.company, text, category: spec[best.text], source: `closest master-spec bullet (${best.c.toFixed(2)} overlap)` });
      else items.push({ id, company: e.company, text, category: null, source: "no master-spec match; pass --category" });
    }
  }
  return { items, missing: [...new Set(ids)].filter(id => !found.has(id)) };
}

export function applyTagging(profile: Profile, items: TagPlan["items"]): Profile {
  return {
    ...profile,
    experience: profile.experience.map(e => {
      const mine = items.filter(i => i.company === e.company && i.category);
      if (mine.length === 0) return e;
      const bulletTags = { ...(e.bulletTags ?? {}) };
      const imported = new Set(e.importedBullets ?? []);
      for (const i of mine) { bulletTags[i.text] = i.category!; imported.add(i.text); }
      return { ...e, bulletTags, importedBullets: [...imported] };
    }),
  };
}

function main() {
  const [userEmail, idArg] = process.argv.slice(2);
  const ids = (idArg && !idArg.startsWith("--") ? idArg : "").split(",").map(s => s.trim()).filter(Boolean);
  const catIdx = process.argv.indexOf("--category");
  const forced = catIdx === -1 ? undefined : (process.argv[catIdx + 1] as BulletCategory);
  if (!userEmail || userEmail.startsWith("--") || ids.length === 0 || (forced && !CATEGORIES.includes(forced))) {
    console.error(`Usage: npm run tag:imported-bullets -- <userEmail> <id,id,...> [--category ${CATEGORIES.join("|")}] [--apply]`);
    process.exit(1);
  }
  const profile = profileRepo.get(userEmail);
  if (!profile) { console.error(`No profile found for ${userEmail}. Nothing written.`); process.exit(1); }

  const { items, missing } = planTagging(profile, ids, forced);
  if (missing.length > 0) { console.error(`Unknown bullet id(s): ${missing.join(", ")}. Aborted, nothing written.`); process.exit(1); }
  for (const i of items) console.log(`  [${i.id}] ${i.company} -> imported, ${i.category ?? "NO CATEGORY"} (${i.source})\n      ${i.text}\n`);
  const unresolved = items.filter(i => !i.category);
  if (unresolved.length > 0) { console.error(`${unresolved.length} bullet(s) have no category. Pass --category. Nothing written.`); process.exit(1); }

  if (!process.argv.includes("--apply")) { console.log("Preview only. Re-run with --apply to write."); return; }
  profileRepo.save(userEmail, applyTagging(profile, items));
  console.log(`Tagged ${items.length} bullet(s) as imported.`);
}

if (process.argv[1]?.endsWith("tag-imported-bullets.ts")) main();
