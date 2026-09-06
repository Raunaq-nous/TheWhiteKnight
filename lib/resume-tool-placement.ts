// TOOL PLACEMENT AND SIDE-BUILD VISIBILITY — implements docs/MASTER-PROFILE-
// SPEC.md's "Tool placement" and "Side builds" rules (Part 8), driven by
// config/profile-rules.json's toolPlacement + sideBuildsAllowed, not prose.
//
// Two separate operations:
//   1. suppressSideBuilds — a deterministic content transform (like
//      clampToOnePageBudget): drops personal side-build projects entirely
//      for a target archetype the spec doesn't allow them on (senior
//      consulting, chief of staff) so that space goes to client
//      engagements instead, per the spec.
//   2. runToolPlacementGate — a pure, blocking CHECK (like the
//      confidentiality gate): each named build in toolPlacement belongs to
//      exactly one employer; if that build's name turns up under a
//      DIFFERENT employer's experience entry, that is a fabrication risk
//      (the tool never worked there) and the build fails, naming the
//      mismatch. This is a hard-coded correction list, not a fuzzy
//      classifier — an unnamed/unlisted build is never flagged.
//
// Client-safe (plain JSON import, no fs/server-only) — same convention as
// the target-archetype resolution in lib/resume-archetype.ts, since this
// also needs to run from generateResumeContent (server) with no barrier to
// being unit-tested directly.

import type { ResumeContent } from "./resume-schema";
import type { TargetArchetypeKey } from "./resume-archetype";
import profileRulesConfig from "../config/profile-rules.json";

type ToolPlacementConfigShape = {
  toolPlacement?: Record<string, string>;
  sideBuildsAllowed?: string[];
};
const CONFIG = profileRulesConfig as ToolPlacementConfigShape;

/** Loose company-name match — case/&-vs-and/punctuation-insensitive, same convention as lib/resume-confidentiality.ts's employer-location matching. */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Drops content.projects (personal side builds — CareerOS, the fantasy
 * cricket platform, MateMate, etc.) entirely when the resolved target
 * archetype key is not in config.sideBuildsAllowed. Senior consulting and
 * chief-of-staff resumes spend that space on client engagements instead.
 * A target key with no config entry at all (e.g. finance_ib/general with
 * no startup signal) is treated the same as "not allowed" — side builds
 * only show where the spec explicitly names them as appropriate.
 */
export function suppressSideBuilds(content: ResumeContent, targetKey: TargetArchetypeKey | undefined): ResumeContent {
  const allowed = new Set(CONFIG.sideBuildsAllowed ?? []);
  if (targetKey && allowed.has(targetKey)) return content;
  if (!content.projects?.length) return content;
  return { ...content, projects: [] };
}

export type ToolPlacementViolation = {
  tool: string;
  expectedEmployer: string;
  foundUnder: string;
};

export type ToolPlacementGateResult = {
  ok: boolean;
  violations: ToolPlacementViolation[];
};

/**
 * Checks every named build in config.toolPlacement against where it
 * actually appears in the resume. A build's name found in a bullet under
 * an experience entry whose company does not match its configured
 * employer is a hard failure — the tool never belonged there, so citing it
 * there is a fabrication, not a stylistic slip. Scans experience bullets
 * only (projects are personal side builds, a different category entirely
 * — see suppressSideBuilds above; toolPlacement names professional
 * employer-attributed builds).
 */
export function runToolPlacementGate(content: ResumeContent): ToolPlacementGateResult {
  const toolPlacement = CONFIG.toolPlacement ?? {};
  const violations: ToolPlacementViolation[] = [];

  for (const [tool, expectedEmployer] of Object.entries(toolPlacement)) {
    const expectedNormalized = normalizeCompanyName(expectedEmployer);
    const toolPattern = new RegExp(tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    for (const e of content.experience) {
      const hasTool = e.bullets.some(b => toolPattern.test(b.text));
      if (!hasTool) continue;
      if (normalizeCompanyName(e.company) !== expectedNormalized) {
        violations.push({ tool, expectedEmployer, foundUnder: e.company });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

export function toolPlacementGateFailureMessage(result: ToolPlacementGateResult): string {
  return `TOOL PLACEMENT GATE FAILED — build rejected. ${result.violations
    .map(v => `"${v.tool}" belongs to ${v.expectedEmployer}, found under ${v.foundUnder}`)
    .join("; ")}`;
}
