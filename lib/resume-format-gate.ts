// FORMAT GATE — runs BEFORE anything is written to disk (no .docx, no .pdf,
// nothing) for the DOCX-first export pipeline. This replaces "generate,
// then eyeball whether it looks right" with a hard, itemized rejection:
// every violation is collected and reported, so a failure is loud and
// specific ("bullet #2 under Bain & Company has no outcome clause"), never
// a silent truncation or a best-effort render of broken content.
//
// Character-cap and per-role-count limits reuse the SAME constants the
// on-screen one-page budget already enforces (lib/resume-budget.ts) — one
// source of truth for "how long/how many," not a second set of numbers
// that could drift from the first.

import { ResumeContent } from "./resume-schema";
import { ONE_PAGE_BUDGET, splitOutcomeClause } from "./resume-budget";

export type FormatGateViolation = { location: string; reason: string };
export type FormatGateResult = { ok: boolean; violations: FormatGateViolation[] };

const FORBIDDEN_CHARS: { char: string; label: string }[] = [
  { char: "[", label: "bracket" },
  { char: "]", label: "bracket" },
  { char: "|", label: "pipe" },
  { char: "—", label: "em-dash" },
];

function checkForbiddenChars(text: string, location: string, violations: FormatGateViolation[]): void {
  for (const { char, label } of FORBIDDEN_CHARS) {
    if (text.includes(char)) {
      violations.push({ location, reason: `contains a ${label} ("${char}") — not allowed in the exported document` });
    }
  }
}

function endsWithTerminalPunctuation(text: string): boolean {
  return /[.!?]$/.test(text.trim());
}

function checkBullet(text: string, location: string, violations: FormatGateViolation[]): void {
  checkForbiddenChars(text, location, violations);
  if (text.length > ONE_PAGE_BUDGET.bulletMaxChars) {
    violations.push({ location, reason: `exceeds the ${ONE_PAGE_BUDGET.bulletMaxChars}-character cap (${text.length} chars)` });
  }
  if (!endsWithTerminalPunctuation(text)) {
    violations.push({ location, reason: "does not end in terminal punctuation (. ! or ?)" });
  }
  // splitOutcomeClause returns setup:null in exactly one case — no clause
  // anywhere in the text contains an outcome marker (a real violation). If
  // the marker sits in the bullet's only/first clause, setup is "" (an
  // empty string, not null) — a single-clause bullet that legitimately
  // ends on its outcome is correctly NOT flagged here.
  if (splitOutcomeClause(text).setup === null) {
    violations.push({ location, reason: "has no identifiable outcome clause (no number, %, or scope marker)" });
  }
}

/**
 * Runs the full format gate over a resolved ResumeContent (post-selection,
 * post-clamp — i.e. exactly what's about to be written). Never mutates or
 * auto-fixes anything: a violation is a REJECTION, not a cleanup pass, per
 * the "fail loudly with the reason" requirement.
 */
export function runFormatGate(content: ResumeContent): FormatGateResult {
  const violations: FormatGateViolation[] = [];

  checkForbiddenChars(content.name, "name", violations);
  // contactLine's "|" is an established internal field separator (schema:
  // "pre-joined \"email | phone\" ONLY"), not formatting that reaches the
  // document — the docx renderer splits on it and lays out real typography,
  // it never prints a literal pipe character. Check each part on its own
  // for the OTHER hazards instead of flagging the separator itself.
  for (const part of content.contactLine.split("|")) {
    for (const { char, label } of FORBIDDEN_CHARS) {
      if (char === "|") continue;
      if (part.includes(char)) violations.push({ location: "contact line", reason: `contains a ${label} ("${char}") — not allowed in the exported document` });
    }
  }
  if (content.summary) checkForbiddenChars(content.summary, "summary", violations);

  for (const win of content.keyWins ?? []) checkForbiddenChars(win, "key win", violations);
  for (const p of content.projects ?? []) checkForbiddenChars(p.description, `project "${p.name}"`, violations);

  for (const e of content.experience) {
    checkForbiddenChars(e.company, `experience entry "${e.company}"`, violations);
    checkForbiddenChars(e.role, `experience entry "${e.company}" role`, violations);
    if (e.bullets.length > ONE_PAGE_BUDGET.bulletsPerRoleMax) {
      violations.push({
        location: `experience entry "${e.company}"`,
        reason: `has ${e.bullets.length} bullets, over the ${ONE_PAGE_BUDGET.bulletsPerRoleMax}-per-role cap`,
      });
    }
    e.bullets.forEach((b, i) => checkBullet(b.text, `experience entry "${e.company}", bullet #${i + 1}`, violations));
  }

  for (const g of content.skills) checkForbiddenChars(g.items.join(" "), `skills category "${g.category}"`, violations);

  return { ok: violations.length === 0, violations };
}

/** Formats a gate result into a single loud, multi-line failure message. */
export function formatGateFailureMessage(result: FormatGateResult): string {
  return `FORMAT GATE FAILED (${result.violations.length} violation${result.violations.length === 1 ? "" : "s"}):\n` +
    result.violations.map(v => `- ${v.location}: ${v.reason}`).join("\n");
}
