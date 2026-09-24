// Runs the REAL resume-generation pipeline (model call included, so the
// server's AI provider key must be set) for one saved application, then
// reports what was rendered: archetype, maxPages, roles, bullets per role,
// how many selected bullets are legacy vs imported master-spec text, and
// the tool-placement and confidentiality gates over every rendered string.
// Read-only: nothing is saved.
//
// USAGE:
//   npx tsx scripts/verify-resume.ts <userEmail> <applicationSlug>

import { profileRepo, applicationRepo } from "../lib/server/repositories";
import { generateResumeContent } from "../lib/server/services/resume-generation-service";
import { runConfidentialityGate } from "../lib/resume-confidentiality";
import { auditProfile } from "./audit-profile-bullets";
import type { ResumeContent } from "../lib/resume-schema";

export function renderedText(c: ResumeContent): string {
  return [
    c.summary,
    ...(c.keyWins ?? []),
    ...(c.projects ?? []).map(p => `${p.name} ${p.description}`),
    ...c.experience.flatMap(e => [e.company, e.role, e.location ?? "", ...e.bullets.map(b => b.text)]),
    ...c.skills.flatMap(s => [s.category, ...s.items]),
    ...(c.leadership ?? []),
  ].join("\n");
}

async function main() {
  const [userEmail, slug] = process.argv.slice(2);
  if (!userEmail || !slug) {
    console.error("Usage: npx tsx scripts/verify-resume.ts <userEmail> <applicationSlug>");
    process.exit(1);
  }
  const profile = profileRepo.get(userEmail);
  const app = applicationRepo.get(userEmail, slug);
  if (!profile || !app) {
    console.error(`Missing ${!profile ? "profile" : `application "${slug}"`} for ${userEmail}.`);
    process.exit(1);
  }

  const { data, archetype, maxPages, toolPlacementGate, formatGate } = await generateResumeContent(profile, app, undefined);
  const origin = new Map(auditProfile(profile).map(r => [r.id, r.origin]));
  const ids = [...data.experience.flatMap(e => e.bullets.map(b => b.sourceBulletId)), ...(data.keyWinIds ?? [])].filter(Boolean);
  const legacy = ids.filter(id => origin.get(id) === "legacy");
  const bainEntries = data.experience.filter(e => /\bbain\b/i.test(e.company)).length;
  const confidentiality = runConfidentialityGate(renderedText(data), undefined, archetype);

  console.log(`archetype=${archetype} maxPages=${maxPages}`);
  console.log(`roles=${data.experience.length} (Bain entries: ${bainEntries})`);
  for (const e of data.experience) console.log(`  ${e.company} | ${e.role} | ${e.tenure}: ${e.bullets.length} bullet(s)`);
  console.log(`experience bullets=${data.experience.reduce((n, e) => n + e.bullets.length, 0)}, key impact items=${(data.keyWins?.length ?? 0) + (data.projects?.length ?? 0)}`);
  console.log(`selected ids=${ids.length}: legacy=${legacy.length}, imported=${ids.length - legacy.length}${legacy.length ? ` (legacy ids: ${legacy.join(",")})` : ""}`);
  console.log(`toolPlacementGate ok=${toolPlacementGate.ok}${toolPlacementGate.ok ? "" : " " + JSON.stringify(toolPlacementGate.violations)}`);
  console.log(`confidentialityGate ok=${confidentiality.ok}${confidentiality.ok ? "" : " blocked=" + JSON.stringify(confidentiality.blockedTerms)}`);
  console.log(`formatGate blocked=${formatGate.blocked}`);
  console.log("Page count is measured at export (DOCX -> PDF); this script does not render a PDF.");
}

if (process.argv[1]?.endsWith("verify-resume.ts")) main();
