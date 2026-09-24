// AUDIT (read-only by default): lists every experience bullet per employer
// and flags, for each one:
//   - origin: "imported" (text matches a docs/MASTER-PROFILE-SPEC.md Part 4
//     bullet from scripts/import-master-profile.ts) or "legacy" (anything
//     else, i.e. pre-import content)
//   - toolPlacement violations: names a build that config/profile-rules.json
//     assigns to a DIFFERENT employer (the same check that blocks export)
//   - forbidden terms: anything the confidentiality gate blocks ("nuclear
//     utility", "$10.45B", ...)
//   - superseded: a legacy bullet whose engagement overlaps an imported
//     bullet under the same employer (containment >= 0.5)
//
// Removal is by explicit id only, and every id is re-verified against the
// live profile first: it must exist, must be legacy, and must either reach
// --min-overlap with an imported bullet or carry a tool-placement /
// forbidden-term flag. If ANY id fails, nothing is written.
//
// USAGE:
//   npx tsx scripts/audit-profile-bullets.ts <email>                                   # full audit + counts
//   npx tsx scripts/audit-profile-bullets.ts <email> --band [lo hi]                     # legacy vs closest imported, side by side (default 0.50-0.79)
//   npx tsx scripts/audit-profile-bullets.ts <email> --remove <ids> [--min-overlap 0.8] # verify + preview
//   npx tsx scripts/audit-profile-bullets.ts <email> --remove <ids> [--min-overlap 0.8] --apply

import { profileRepo } from "../lib/server/repositories";
import { namesMatch, splitBullets } from "../lib/profile-merge";
import { engagementContainment } from "../lib/resume-dedupe";
import { bulletId } from "../lib/profile-bullets";
import { runConfidentialityGate } from "../lib/resume-confidentiality";
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
  forbiddenTerms: string[];
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
        forbiddenTerms: runConfidentialityGate(text).blockedTerms,
        bestImportedMatch: best,
        superseded: origin === "legacy" && !!best && best.containment >= SUPERSEDED_THRESHOLD,
      });
    }
  }
  return rows;
}

export type EmployerCount = { company: string; total: number; imported: number; legacy: number };

export function employerCounts(profile: Profile): EmployerCount[] {
  const rows = auditProfile(profile);
  return profile.experience.map(e => {
    const mine = rows.filter(r => r.company === e.company);
    const legacy = mine.filter(r => r.origin === "legacy").length;
    return { company: e.company, total: mine.length, imported: mine.length - legacy, legacy };
  });
}

export function formatCounts(counts: EmployerCount[]): string {
  return counts.map(c => `  ${c.company}: ${c.total} (${c.imported} imported, ${c.legacy} legacy)`).join("\n");
}

export type RemovalCheck = { id: string; ok: boolean; reason: string; row?: AuditedBullet };

/**
 * Re-verifies every requested id against the LIVE profile. An id passes
 * only if it exists, is legacy (imported bullets are never removable here),
 * and either reaches minOverlap with an imported bullet or carries a
 * tool-placement or forbidden-term flag.
 */
export function verifyRemoval(rows: AuditedBullet[], ids: string[], minOverlap: number): RemovalCheck[] {
  return ids.map(id => {
    const row = rows.find(r => r.id === id);
    if (!row) return { id, ok: false, reason: "not found in the live profile" };
    if (row.origin === "imported") return { id, ok: false, reason: "is an imported bullet, never removed by this tool", row };
    const overlap = row.bestImportedMatch?.containment ?? 0;
    const reasons: string[] = [];
    if (overlap >= minOverlap && row.bestImportedMatch) reasons.push(`overlap ${overlap.toFixed(2)}`);
    for (const v of row.toolViolations) reasons.push(`names ${v.belongsTo}'s "${v.tool}"`);
    for (const t of row.forbiddenTerms) reasons.push(`forbidden term "${t}"`);
    if (reasons.length === 0) {
      return { id, ok: false, reason: `overlap ${overlap.toFixed(2)} is below ${minOverlap} and it has no tool-placement or forbidden-term flag`, row };
    }
    return { id, ok: true, reason: reasons.join(", "), row };
  });
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

/** Legacy bullets whose closest imported match falls in [lo, hi), shown side by side for a human decision. */
export function formatBand(rows: AuditedBullet[], lo: number, hi: number): string {
  const inBand = rows
    .filter(r => r.origin === "legacy" && r.bestImportedMatch && r.bestImportedMatch.containment >= lo && r.bestImportedMatch.containment < hi)
    .sort((a, b) => b.bestImportedMatch!.containment - a.bestImportedMatch!.containment);
  const out = [`${inBand.length} legacy bullet(s) with overlap ${lo.toFixed(2)} to ${(hi - 0.01).toFixed(2)}:`];
  for (const r of inBand) {
    const flags = [...r.toolViolations.map(v => `TOOL-PLACEMENT (${v.belongsTo})`), ...r.forbiddenTerms.map(t => `FORBIDDEN "${t}"`)];
    out.push(`\n[${r.id}] ${r.company}  overlap ${r.bestImportedMatch!.containment.toFixed(2)}${flags.length ? "  " + flags.join(" | ") : ""}`);
    out.push(`  LEGACY:   ${r.text}`);
    out.push(`  IMPORTED: ${r.bestImportedMatch!.text}`);
  }
  return out.join("\n");
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
        ...r.forbiddenTerms.map(t => `FORBIDDEN: "${t}"`),
        ...(r.superseded ? [`SUPERSEDED (${r.bestImportedMatch!.containment.toFixed(2)} overlap)`] : []),
      ];
      out.push(`  [${r.id}] ${flags.join(" | ")}`);
      out.push(`      ${r.text}`);
      if (r.bestImportedMatch && r.origin === "legacy") {
        out.push(`      closest imported (${r.bestImportedMatch.containment.toFixed(2)}): ${r.bestImportedMatch.text.slice(0, 110)}...`);
      }
    }
  }
  const flagged = rows.filter(r => r.toolViolations.length > 0 || r.forbiddenTerms.length > 0 || r.superseded);
  out.push(`\n${rows.length} bullets total, ${rows.filter(r => r.origin === "legacy").length} legacy, ${flagged.length} flagged for review: ${flagged.map(r => r.id).join(",") || "none"}`);
  return out.join("\n");
}

export const DEFAULT_BAND: [number, number] = [0.5, 0.8];

/** Band bounds from CLI args; a missing or non-numeric value falls back to the default 0.50-0.79 (upper bound exclusive). */
export function parseBand(lo?: string, hi?: string): [number, number] {
  const num = (v?: string) => (v !== undefined && v.trim() !== "" && !v.startsWith("--") && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const l = num(lo) ?? DEFAULT_BAND[0];
  const h = num(hi) ?? DEFAULT_BAND[1];
  return l < h ? [l, h] : DEFAULT_BAND;
}

function arg(name: string, offset = 1): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + offset];
}

function main() {
  const userEmail = process.argv[2] || process.env.ADMIN_EMAIL;
  if (!userEmail || userEmail.startsWith("--")) {
    console.error("Usage: npx tsx scripts/audit-profile-bullets.ts <email> [--band lo hi] [--remove id,id,... [--min-overlap n] [--apply]]");
    process.exit(1);
  }
  const profile = profileRepo.get(userEmail);
  if (!profile) {
    console.error(`No profile found for ${userEmail}.`);
    process.exit(1);
  }
  const rows = auditProfile(profile);

  if (process.argv.includes("--band")) {
    const [lo, hi] = parseBand(arg("--band", 1), arg("--band", 2));
    console.log(formatBand(rows, lo, hi));
    return;
  }

  const removeArg = arg("--remove");
  if (!removeArg) {
    console.log(formatAudit(rows, duplicateEmployerEntries(profile)));
    console.log(`\nBullets per employer:\n${formatCounts(employerCounts(profile))}`);
    return;
  }

  const ids = [...new Set(removeArg.split(",").map(s => s.trim()).filter(Boolean))];
  const minOverlap = Number(arg("--min-overlap") ?? 0);
  const checks = verifyRemoval(rows, ids, minOverlap);
  console.log(`Verifying ${ids.length} id(s) against the live profile (min overlap ${minOverlap}):`);
  for (const c of checks) {
    console.log(`  ${c.ok ? "OK  " : "FAIL"} [${c.id}] ${c.row ? `${c.row.company}: ` : ""}${c.reason}`);
    if (c.row) console.log(`         ${c.row.text}`);
  }
  const failed = checks.filter(c => !c.ok);
  if (failed.length > 0) {
    console.log(`\n${failed.length} id(s) failed verification. Nothing removed.`);
    process.exit(1);
  }

  const { profile: next, removed } = removeBullets(profile, new Set(ids));
  console.log(`\nBullets per employer after removal:\n${formatCounts(employerCounts(next))}`);
  if (!process.argv.includes("--apply")) {
    console.log(`\nPreview only: ${removed.length} bullet(s) would be removed. Re-run with --apply to write.`);
    return;
  }
  profileRepo.save(userEmail, next);
  console.log(`\nRemoved ${removed.length} bullet(s).`);
}

if (process.argv[1]?.endsWith("audit-profile-bullets.ts")) main();
