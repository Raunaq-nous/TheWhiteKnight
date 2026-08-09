// FORMAT GATE — runs BEFORE anything is written to disk (no .docx, no .pdf,
// nothing) for the DOCX-first export pipeline. Every violation is collected
// and reported, so a failure is loud and specific ("bullet #2 under Bain &
// Company has no outcome clause"), never a silent truncation.
//
// GRADED, not all-or-nothing:
// - HARD (blocks export): brackets, pipes, em-dashes, and a bullet that
//   doesn't end in terminal punctuation (a truncated/mid-sentence bullet).
//   These make the document unusable or dishonest-looking — there is no
//   legitimate version of shipping one of these.
// - WARN (export proceeds; surfaced to the user, never silent): over the
//   character cap, over the per-role bullet count, or no identifiable
//   outcome. These are real quality signals, but a resume with three
//   qualitative-instead-of-quantified bullets is still a resume you can
//   send today — the user decides whether to fix them now or later, via
//   the gap-fill flow outcomeWarnings feeds (see app/resume-document.tsx).
//
// Character-cap and per-role-count limits reuse the SAME constants the
// on-screen one-page budget already enforces (lib/resume-budget.ts) — one
// source of truth for "how long/how many." Actual page overflow is still
// caught with certainty downstream, by the PDF EXTRACTION GATE measuring
// the real rendered page count (lib/resume-pdf-extract-gate.ts) — these
// caps are an early heuristic warning, not the only line of defense.

import { ResumeContent } from "./resume-schema";
import { ONE_PAGE_BUDGET, OUTCOME_MARKER_PATTERN } from "./resume-budget";

export type FormatGateSeverity = "hard" | "warn";
export type FormatGateViolation = { location: string; reason: string; severity: FormatGateSeverity };

// A bullet flagged for having no identifiable outcome, structured (not just
// a display string) so the UI can route it directly into the existing
// bullet-rewrite flow (lib/profile-enrichment.ts rewriteBulletFromAnswer +
// replaceBulletInProfile) without re-parsing "location" text.
export type OutcomeWarning = { company: string; bulletIndex: number; text: string };

export type FormatGateResult = {
  // True only when a HARD violation exists — this is what actually blocks
  // export. Warnings never flip this.
  blocked: boolean;
  hardFailures: FormatGateViolation[];
  warnings: FormatGateViolation[];
  outcomeWarnings: OutcomeWarning[];
};

const FORBIDDEN_CHARS: { char: string; label: string }[] = [
  { char: "[", label: "bracket" },
  { char: "]", label: "bracket" },
  { char: "|", label: "pipe" },
  { char: "—", label: "em-dash" },
];

// Widened outcome detection (PROBLEM 1). OUTCOME_MARKER_PATTERN (imported)
// already covers quantitative outcomes: $/%/currency, "N+", and fixed
// scope phrases (board-level, C-suite, multi-billion, "N+ sites/projects/
// etc."). The three patterns below cover QUALITATIVE outcomes that are
// real results, just not numbers — a bullet only needs to hit ONE of the
// four families to count as having an outcome.

// (a) Delivered-artifact outcomes: an action verb followed, within the same
// clause-ish window, by a concrete deliverable noun.
const DELIVERED_ARTIFACT_PATTERN =
  /\b(delivered|produced|built|structured|created|developed|designed|drafted|formulated|shipped|launched)\b[^.;]{0,80}?\b(framework|model|strategy|roadmap|plan|analysis|recommendation|dashboard|report|proposal|assessment|playbook|blueprint|toolkit|program|system|pipeline|platform|engine|engagement model|business plan|case|cockpit)\b/i;

// (b) Consequence clauses: the bullet explicitly names what its work led to.
const CONSEQUENCE_CLAUSE_PATTERN =
  /\b(enabling|enabled|resulting in|directly shaping|shaping|which led to|leading to|led to|used for|adopted by|driving|drove|informing|informed|guiding|guided)\b/i;

// (c) Decision outcomes: the work produced or unlocked a specific,
// named decision — a real result even with no number attached.
const DECISION_OUTCOME_PATTERN =
  /\bboard[- ]level (recommendation|decision)\b|\binvestment commitment\b|\bc-suite (decision|recommendation)\b|\binvestment-committee\b/i;

/** True if `text` contains ANY identifiable outcome — quantitative or qualitative. Pure activity description with no result at all returns false. */
export function hasIdentifiableOutcome(text: string): boolean {
  return OUTCOME_MARKER_PATTERN.test(text)
    || DELIVERED_ARTIFACT_PATTERN.test(text)
    || CONSEQUENCE_CLAUSE_PATTERN.test(text)
    || DECISION_OUTCOME_PATTERN.test(text);
}

function checkForbiddenChars(text: string, location: string, hardFailures: FormatGateViolation[]): void {
  for (const { char, label } of FORBIDDEN_CHARS) {
    if (text.includes(char)) {
      hardFailures.push({ location, reason: `contains a ${label} ("${char}") — not allowed in the exported document`, severity: "hard" });
    }
  }
}

function endsWithTerminalPunctuation(text: string): boolean {
  return /[.!?]$/.test(text.trim());
}

function checkBullet(
  text: string,
  location: string,
  company: string,
  bulletIndex: number,
  hardFailures: FormatGateViolation[],
  warnings: FormatGateViolation[],
  outcomeWarnings: OutcomeWarning[],
): void {
  checkForbiddenChars(text, location, hardFailures);

  if (!endsWithTerminalPunctuation(text)) {
    hardFailures.push({ location, reason: "does not end in terminal punctuation (. ! or ?) — reads as truncated/mid-sentence", severity: "hard" });
  }

  if (text.length > ONE_PAGE_BUDGET.bulletMaxChars) {
    warnings.push({ location, reason: `exceeds the ${ONE_PAGE_BUDGET.bulletMaxChars}-character cap (${text.length} chars)`, severity: "warn" });
  }

  if (!hasIdentifiableOutcome(text)) {
    warnings.push({ location, reason: "has no identifiable outcome (no number, %, scope marker, delivered artifact, or consequence clause) — could be stronger", severity: "warn" });
    outcomeWarnings.push({ company, bulletIndex, text });
  }
}

/**
 * Runs the full format gate over a resolved ResumeContent (post-selection,
 * post-clamp — i.e. exactly what's about to be written). Never mutates or
 * auto-fixes anything — a HARD violation blocks export outright; a WARN
 * violation is reported but never silent, never blocking.
 */
export function runFormatGate(content: ResumeContent): FormatGateResult {
  const hardFailures: FormatGateViolation[] = [];
  const warnings: FormatGateViolation[] = [];
  const outcomeWarnings: OutcomeWarning[] = [];

  checkForbiddenChars(content.name, "name", hardFailures);
  // contactLine's "|" is an established internal field separator (schema:
  // "pre-joined \"email | phone\" ONLY"), not formatting that reaches the
  // document — the docx renderer splits on it and lays out real typography,
  // it never prints a literal pipe character. Check each part on its own
  // for the OTHER hazards instead of flagging the separator itself.
  for (const part of content.contactLine.split("|")) {
    for (const { char, label } of FORBIDDEN_CHARS) {
      if (char === "|") continue;
      if (part.includes(char)) hardFailures.push({ location: "contact line", reason: `contains a ${label} ("${char}") — not allowed in the exported document`, severity: "hard" });
    }
  }
  if (content.summary) checkForbiddenChars(content.summary, "summary", hardFailures);

  for (const win of content.keyWins ?? []) checkForbiddenChars(win, "key win", hardFailures);
  for (const p of content.projects ?? []) checkForbiddenChars(p.description, `project "${p.name}"`, hardFailures);

  for (const e of content.experience) {
    checkForbiddenChars(e.company, `experience entry "${e.company}"`, hardFailures);
    checkForbiddenChars(e.role, `experience entry "${e.company}" role`, hardFailures);
    if (e.bullets.length > ONE_PAGE_BUDGET.bulletsPerRoleMax) {
      warnings.push({
        location: `experience entry "${e.company}"`,
        reason: `has ${e.bullets.length} bullets, over the ${ONE_PAGE_BUDGET.bulletsPerRoleMax}-per-role cap`,
        severity: "warn",
      });
    }
    e.bullets.forEach((b, i) => checkBullet(b.text, `experience entry "${e.company}", bullet #${i + 1}`, e.company, i, hardFailures, warnings, outcomeWarnings));
  }

  for (const g of content.skills) checkForbiddenChars(g.items.join(" "), `skills category "${g.category}"`, hardFailures);

  return { blocked: hardFailures.length > 0, hardFailures, warnings, outcomeWarnings };
}

/** Formats the HARD failures into a single loud, multi-line rejection message. */
export function formatGateFailureMessage(result: FormatGateResult): string {
  return `FORMAT GATE FAILED (${result.hardFailures.length} blocking violation${result.hardFailures.length === 1 ? "" : "s"}):\n` +
    result.hardFailures.map(v => `- ${v.location}: ${v.reason}`).join("\n");
}
