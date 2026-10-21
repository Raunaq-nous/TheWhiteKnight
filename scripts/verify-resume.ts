// Runs the REAL resume pipeline end to end for one saved application, so
// JD alignment can be checked against the real model on the server:
//   step 0 (the JD's top 5 requirements), the model ranking, the selection,
//   then the real export (DOCX -> LibreOffice PDF -> pdf-parse, with
//   measure-and-fill).
// Prints the extracted requirements and the bullet covering each, the
// summary and its rule check, bullets per employer (with scope lines and
// sub-labels), skills, education lines, the measured page count and page-two
// fill, and every gate.
// Read-only: nothing is saved, no file is written.
//
// USAGE:
//   npm run verify:resume -- <userEmail> <applicationSlug> [archetype]
import { profileRepo, applicationRepo } from "../lib/server/repositories";
import { generateResumeContent } from "../lib/server/services/resume-generation-service";
import { runResumeExport } from "../lib/server/resume-export-pipeline";
import type { ResumeArchetype } from "../lib/resume-archetype";
import { roleSubLabelGroups } from "../lib/resume-sublabels";
import { splitSentences } from "../lib/resume-summary";
import type { ResumeContent } from "../lib/resume-schema";

function printExperience(c: ResumeContent): void {
  for (const e of c.experience) {
    const groups = roleSubLabelGroups(e);
    console.log(`  ${e.company} | ${e.role}: ${e.bullets.length} bullet(s)${groups ? ` [${groups.map(g => `${g.label} ${g.bullets.length}`).join(" / ")}]` : " [flat]"}`);
    if (e.scope) console.log(`    scope: ${e.scope}`);
    const ordered = groups ? groups.flatMap(g => g.bullets) : [...e.bullets].sort((a, b) => a.priority - b.priority);
    for (const b of ordered) console.log(`    - [${b.sourceBulletId}] ${b.text.slice(0, 110)}${b.text.length > 110 ? "..." : ""}`);
  }
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

  const r = await generateResumeContent(profile, app, undefined, archetypeArg as ResumeArchetype | undefined);
  const { data, fill } = r;

  console.log(`\n=== ${app.company} | ${app.role} ===`);
  console.log(`archetype=${r.archetype} maxPages=${r.maxPages} aiJd=${fill.aiJd} technicalJd=${fill.technicalJd}`);

  console.log(`\n=== JD TOP REQUIREMENTS (${r.jdRequirements.length}) ===`);
  if (r.jdWarning) console.log(`WARNING: ${r.jdWarning}`);
  r.coverage.forEach((c, i) => {
    console.log(`${i + 1}. ${c.requirement}`);
    console.log(c.bulletId ? `   covered by [${c.bulletId}] (${c.company}, via ${c.via}): ${c.text}` : "   NOT COVERED by any bullet on the resume");
  });

  console.log(`\n=== SUMMARY (${splitSentences(data.summary).length} sentences, ${data.summary.split(/\s+/).filter(Boolean).length} words) ===`);
  console.log(data.summary);
  const s = r.summaryReport;
  console.log(`rule check: ${s.violations.length ? `first draft broke ${s.violations.join("; ")}` : "first draft passed"}` +
    `${s.retried ? `; retried -> ${s.violationsAfterRetry.length ? s.violationsAfterRetry.join("; ") : "passed"}` : ""}${s.repaired ? "; repaired deterministically" : ""}`);

  console.log(`\n=== EXPERIENCE ===`);
  console.log(`eligible bullets=${fill.eligibleBullets} (ineligible, no outcome clause: ${fill.ineligibleBullets}); relevance threshold=${fill.relevanceThreshold}`);
  console.log(`model ranked ${fill.modelRankedIds} ids; selected from model ${fill.selectedFromModel}, by keyword fallback ${fill.addedByFill}; pinned: ${fill.pinnedIds.join(",") || "none"}`);
  console.log(`bullets per employer: ${data.experience.map(e => `${e.company}=${e.bullets.length}`).join(", ")}`);
  printExperience(data);

  console.log(`\n=== SKILLS (each with the selected bullet that evidences it) ===`);
  const evidence = new Map((data.skillEvidence ?? []).map(x => [x.skill, x.sourceBulletId]));
  for (const g of data.skills) {
    console.log(`  ${g.category}:`);
    for (const item of g.items) console.log(`    - ${item} <- ${evidence.get(item) ? `[${evidence.get(item)}]` : "NO EVIDENCE"}`);
  }
  console.log(`\n=== EDUCATION ===`);
  for (const ed of data.education) {
    console.log(`  ${ed.institution} | ${ed.degree}${ed.field ? `, ${ed.field}` : ""} | ${ed.years}`);
    for (const a of ed.achievements ?? []) console.log(`    - ${a}`);
  }

  console.log(`\n=== GATES (generation) ===`);
  console.log(`confidentiality ok=${r.confidentialityGate.ok}${r.confidentialityGate.ok ? "" : " blocked=" + JSON.stringify(r.confidentialityGate.blockedTerms)}`);
  console.log(`toolPlacement ok=${r.toolPlacementGate.ok}${r.toolPlacementGate.ok ? "" : " " + JSON.stringify(r.toolPlacementGate.violations)}`);
  console.log(`format blocked=${r.formatGate.blocked}`);
  console.log(`estimated lines=${fill.finalEstimatedLines} (page two half full ~${fill.targetLines})`);

  console.log(`\n=== EXPORT (DOCX -> LibreOffice PDF -> pdf-parse) ===`);
  const exported = await runResumeExport({ resumeContent: data, archetype: r.archetype, maxPages: r.maxPages });
  if (!exported.ok) {
    console.log(`EXPORT REJECTED (${exported.status}): ${JSON.stringify(exported.body, null, 2)}`);
    process.exit(2);
  }
  for (const st of exported.fill.steps) {
    console.log(`  fill step ${st.iteration}: pages=${st.pageCount} pageTwo=${st.pageTwoFillPercent ?? "-"}% -> ${st.action}${st.ids.length ? ` [${st.ids.join(",")}]` : ""}`);
  }
  console.log(`page count: ${exported.pageCount} (ceiling ${exported.maxPages})`);
  console.log(`page-two fill: ${exported.pageTwoFillPercent ?? "n/a"}%`);
  if (exported.fillWarning) console.log(`WARNING: ${exported.fillWarning}`);
  console.log(`final bullets per employer: ${exported.resumeContent.experience.map(e => `${e.company}=${e.bullets.length}`).join(", ")}`);
  console.log(`sub-labels rendered: ${exported.subLabelsRendered ? "yes" : "no"}`);
  console.log(`confidentiality gate on DOCX and PDF text: passed (export would have been rejected otherwise)`);
}

if (process.argv[1]?.endsWith("verify-resume.ts")) main();
