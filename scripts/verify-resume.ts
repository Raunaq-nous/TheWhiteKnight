// Runs the REAL resume pipeline end to end for one saved application:
// the model call (the server's AI provider key must be set), the
// deterministic fill, and the real export (DOCX -> LibreOffice PDF ->
// pdf-parse, with measure-and-fill). Prints what the model returned, what
// the fill added, bullets per employer, the line budget, the measured pages
// and page-two fill, whether sub-labels rendered, and every gate.
// Read-only: nothing is saved, no file is written.
//
// USAGE:
//   npm run verify:resume -- <userEmail> <applicationSlug> [archetype]
import { profileRepo, applicationRepo } from "../lib/server/repositories";
import { generateResumeContent } from "../lib/server/services/resume-generation-service";
import { runResumeExport } from "../lib/server/resume-export-pipeline";
import { balanceViolations, bandItemsFor } from "../lib/resume-balance";
import type { ResumeArchetype } from "../lib/resume-archetype";
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

function perEmployer(c: ResumeContent): string {
  return c.experience.map(e => {
    const kp = bandItemsFor(e.company, c.keyWinCompanies);
    return `${e.company}=${e.bullets.length}${kp ? ` (+${kp} in Key Projects)` : ""}`;
  }).join(", ");
}

/** Balance check: the current role is "run out" when every one of its profile bullets is already shown. */
function balanceReport(c: ResumeContent, profile: { experience: { company: string; bullets: string }[] }): string {
  const current = c.experience[0];
  const available = profile.experience.find(e => current && e.company === current.company)?.bullets.split("\n").filter(b => b.trim()).length ?? 0;
  const used = current ? current.bullets.length + bandItemsFor(current.company, c.keyWinCompanies) : 0;
  const exhausted = used >= available;
  const v = balanceViolations(c.experience, c.keyWinCompanies, exhausted);
  return `${v.length ? "VIOLATIONS: " + v.join("; ") : "ok"} (current role ${current?.company ?? "-"}: ${used} of ${available} bullets shown${exhausted ? ", run out" : ""})`;
}

async function main() {
  const [userEmail, slug, archetypeArg] = process.argv.slice(2);
  if (!userEmail || !slug) {
    console.error("Usage: npm run verify:resume -- <userEmail> <applicationSlug> [archetype]");
    process.exit(1);
  }
  const profile = profileRepo.get(userEmail);
  const app = applicationRepo.get(userEmail, slug);
  if (!profile || !app) {
    console.error(`Missing ${!profile ? "profile" : `application "${slug}"`} for ${userEmail}.`);
    process.exit(1);
  }

  // 1. GENERATION: real model ranking + deterministic fill.
  const { data, archetype, maxPages, toolPlacementGate, formatGate, fill } =
    await generateResumeContent(profile, app, undefined, archetypeArg as ResumeArchetype | undefined);
  const origin = new Map(auditProfile(profile).map(r => [r.id, r.origin]));
  const ids = [...data.experience.flatMap(e => e.bullets.map(b => b.sourceBulletId)), ...(data.keyWinIds ?? [])].filter(Boolean);
  const legacy = ids.filter(id => origin.get(id) === "legacy");
  const confidentiality = runConfidentialityGate(renderedText(data), undefined, archetype);

  console.log(`\n=== GENERATION ===`);
  console.log(`archetype=${archetype} maxPages=${maxPages}`);
  console.log(`ids returned by the model: ${fill.modelRankedIds} (usable: ${fill.modelRankedUsable}, used: ${fill.selectedFromModel})`);
  console.log(`bullets added by the fill: ${fill.addedByFill}${fill.addedByFillIds.length ? ` (${fill.addedByFillIds.join(",")})` : ""}`);
  console.log(`key projects items: ${data.keyWins?.length ?? 0}`);
  console.log(`experience bullets: ${data.experience.reduce((n, e) => n + e.bullets.length, 0)}`);
  console.log(`bullets per employer: ${perEmployer(data)}`);
  console.log(`role balance: ${balanceReport(data, profile)}`);
  console.log(`line budget used: ${fill.finalEstimatedLines} of ${fill.targetLines} target lines (estimate, ${maxPages}-page format)`);
  console.log(`reserve for export fill: ${data.reserve?.length ?? 0}`);
  console.log(`summary proof point moved off the lead Key Projects item: ${fill.summaryProofPointSwapped}`);
  console.log(`selected ids=${ids.length}: legacy=${legacy.length}, imported=${ids.length - legacy.length}${legacy.length ? ` (legacy ids: ${legacy.join(",")})` : ""}`);
  console.log(`toolPlacementGate ok=${toolPlacementGate.ok}${toolPlacementGate.ok ? "" : " " + JSON.stringify(toolPlacementGate.violations)}`);
  console.log(`confidentialityGate ok=${confidentiality.ok}${confidentiality.ok ? "" : " blocked=" + JSON.stringify(confidentiality.blockedTerms)}`);
  console.log(`formatGate blocked=${formatGate.blocked}`);

  // 2. EXPORT: the same pipeline the export route runs, real PDF measurement.
  console.log(`\n=== EXPORT (DOCX -> LibreOffice PDF -> pdf-parse) ===`);
  const exported = await runResumeExport({ resumeContent: data, archetype, maxPages });
  if (!exported.ok) {
    console.log(`EXPORT REJECTED (${exported.status}): ${JSON.stringify(exported.body, null, 2)}`);
    process.exit(2);
  }
  for (const s of exported.fill.steps) {
    console.log(`  fill step ${s.iteration}: pages=${s.pageCount} pageTwo=${s.pageTwoFillPercent ?? "-"}% -> ${s.action}${s.ids.length ? ` [${s.ids.join(",")}]` : ""}`);
  }
  console.log(`measured pages: ${exported.pageCount} (ceiling ${exported.maxPages})`);
  console.log(`page-two fill: ${exported.pageTwoFillPercent ?? "n/a"}%`);
  console.log(`bullets added at export: ${exported.fill.addedIds.length}, dropped: ${exported.fill.droppedIds.length}`);
  console.log(`final bullets per employer: ${perEmployer(exported.resumeContent)}`);
  console.log(`final role balance: ${balanceReport(exported.resumeContent, profile)}`);
  console.log(`sub-labels rendered: ${exported.subLabelsRendered ? "yes" : "no"}`);
  console.log(`confidentiality gate on DOCX and PDF text: passed (export would have been rejected otherwise)`);
}

if (process.argv[1]?.endsWith("verify-resume.ts")) main();
