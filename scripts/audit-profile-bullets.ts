// AUDIT (read-only by default): lists every experience bullet per employer
// and flags, for each one:
//   - origin: "imported" (text matches a docs/MASTER-PROFILE-SPEC.md Part 4
//     bullet from scripts/import-master-profile.ts) or "legacy" (anything
//     else, i.e. pre-import content)
//   - toolPlacement violations: names a build that config/profile-rules.json
//     assigns to a DIFFERENT employer (the same check that blocks export)
//   - superseded: a legacy bullet whose engagement overlaps an imported
//     bullet under the same employer (containment >= 0.5, the same
//     threshold as resume dedupe)
//
// Nothing is removed unless you name the exact bullet ids AND pass --apply.
//
// USAGE:
//   npx tsx scripts/audit-profile-bullets.ts <userEmail>
//   npx tsx scripts/audit-profile-bullets.ts <userEmail> --remove <id,id,...>          # dry run: shows what would go
//   npx tsx scripts/audit-profile-bullets.ts <userEmail> --remove <id,id,...> --apply  # actually removes them

import { profileRepo } from "../lib/server/repositories";
import { namesMatch, splitBullets } from "../lib/profile-merge";
import { engagementContainment } from "../lib/resume-dedupe";
import { bulletId } from "../lib/profile-bullets";
import { EXPERIENCE_CANDIDATES } from "./import-master-profile";
import profileRulesConfig from "../config/profile-rules.json";
import type { Profile } from "../lib/profile";

const SUPERSEDED_THRESHOLD = 0.5;
const TOOL_PLACEMENT = (profileRulesConfig as { toolPlacement?: Record<string, string> }).toolPlacement ?? {};

export type AuditedBullet = {
  id: string;
  company: string;
  text: string;
  origin: "imported" | "legacy";
  toolViolations: { tool: string; belongsTo: string }[];
  bestImportedMatch: { text: string; containment: number } | null;
  superseded: boolean;
};

export function sameEmployer(a: string, b: string): boolean {
  return namesMatch(a, b);
}

function importedTextsFor(company: string): string[] {
  return EXPERIENCE_CANDIDATES.filter(c => sameEmployer(c.company, company)).flatMap(c => c.bullets);
}

/** Groups of 2+ experience entries that are the same employer under different spellings. */
export function duplicateEmployerEntries(profile: Profile): string[][] {
  const groups: string[][] = [];
  for (const e of profile.experience) {
    const g = groups.find(g => sameEmployer(g[0], e.company));
    if (g) g.push(e.company); else groups.push([e.company]);
  }
  return groups.filter(g => g.length > 1);
}

function toolViolations(text: string, company: string): AuditedBullet["toolViolations"] {
  const out: AuditedBullet["toolViolations"] = [];
  for (const [tool, owner] of Object.entries(TOOL_PLACEMENT)) {
    if (text.toLowerCase().includes(tool.toLowerCase()) && !sameEmployer(owner, company)) {
      out.push({ tool, belongsTo: owner });
    }
  }
  return out;
}

export function auditProfile(profile: Profile): AuditedBullet[] {
  const rows: AuditedBullet[] = [];
  for (const e of profile.experience) {
    const imported = importedTextsFor(e.company);
    const importedSet = new Set(imported);
    for (const text of splitBullets(e.bullets)) {
      const origin = importedSet.has(text) ? "imported" : "legacy";
      let best: AuditedBullet["bestImportedMatch"] = null;
      if (origin === "legacy") {
        for (const cand of imported) {
          const c = engagementContainment(text, cand);
          if (!best || c > best.containment) best = { text: cand, containment: c };
        }
      }
      rows.push({
        id: bulletId("experience", e.company, text),
        company: e.company,
        text,
        origin,
        toolViolations: toolViolations(text, e.company),
        bestImportedMatch: best,
        superseded: origin === "legacy" && !!best && best.containment >= SUPERSEDED_THRESHOLD,
      });
    }
  }
  return rows;
}

/** Removes exactly the named bullet ids (and their bulletTags entries). Never removes anything not listed. */
export function removeBullets(profile: Profile, ids: Set<string>): { profile: Profile; removed: { company: string; text: string }[] } {
  const removed: { company: string; text: string }[] = [];
  const experience = profile.experience.map(e => {
    const lines = splitBullets(e.bullets);
    const keep = lines.filter(text => {
      const hit = ids.has(bulletId("experience", e.company, text));
      if (hit) removed.push({ company: e.company, text });
      return !hit;
    });
    if (keep.length === lines.length) return e;
    const bulletTags = e.bulletTags ? Object.fromEntries(Object.entries(e.bulletTags).filter(([t]) => keep.includes(t))) : e.bulletTags;
    return { ...e, bullets: keep.join("\n"), bulletTags };
  });
  return { profile: { ...profile, experience }, removed };
}

export function formatAudit(rows: AuditedBullet[], duplicateEntries: string[][] = []): string {
  const out: string[] = [];
  for (const g of duplicateEntries) {
    out.push(`DUPLICATE EMPLOYER ENTRY: ${g.map(c => `"${c}"`).join(" and ")} are the same employer stored as separate roles; both render on a resume.`);
  }
  const companies = [...new Set(rows.map(r => r.company))];
  for (const company of companies) {
    const mine = rows.filter(r => r.company === company);
    const legacy = mine.filter(r => r.origin === "legacy").length;
    out.push(`\n## ${company}: ${mine.length} bullets (${mine.length - legacy} imported, ${legacy} legacy)`);
    for (const r of mine) {
      const flags = [
        r.origin.toUpperCase(),
        ...r.toolViolations.map(v => `TOOL-PLACEMENT: "${v.tool}" belongs to ${v.belongsTo}`),
        ...(r.superseded ? [`SUPERSEDED (${r.bestImportedMatch!.containment.toFixed(2)} overlap)`] : []),
      ];
      out.push(`  [${r.id}] ${flags.join(" | ")}`);
      out.push(`      ${r.text}`);
      if (r.bestImportedMatch && r.origin === "legacy") {
        out.push(`      closest imported (${r.bestImportedMatch.containment.toFixed(2)}): ${r.bestImportedMatch.text.slice(0, 110)}...`);
      }
    }
  }
  const flagged = rows.filter(r => r.toolViolations.length > 0 || r.superseded);
  out.push(`\n${rows.length} bullets total, ${rows.filter(r => r.origin === "legacy").length} legacy, ${flagged.length} flagged for review: ${flagged.map(r => r.id).join(",") || "none"}`);
  return out.join("\n");
}

function main() {
  const userEmail = process.argv[2] || process.env.ADMIN_EMAIL;
  if (!userEmail) {
    console.error("Usage: npx tsx scripts/audit-profile-bullets.ts <userEmail> [--remove id,id,...] [--apply]");
    process.exit(1);
  }
  const profile = profileRepo.get(userEmail);
  if (!profile) {
    console.error(`No profile found for ${userEmail}.`);
    process.exit(1);
  }
  console.log(formatAudit(auditProfile(profile), duplicateEmployerEntries(profile)));

  const removeIdx = process.argv.indexOf("--remove");
  if (removeIdx === -1) return;
  const ids = new Set((process.argv[removeIdx + 1] ?? "").split(",").map(s => s.trim()).filter(Boolean));
  const { profile: next, removed } = removeBullets(profile, ids);
  console.log(`\nWould remove ${removed.length} of ${ids.size} requested ids:`);
  for (const r of removed) console.log(`  - [${r.company}] ${r.text}`);
  if (!process.argv.includes("--apply")) {
    console.log("Dry run only. Re-run with --apply to remove them.");
    return;
  }
  profileRepo.save(userEmail, next);
  console.log(`Removed ${removed.length} bullet(s).`);
}

if (process.argv[1]?.endsWith("audit-profile-bullets.ts")) main();
