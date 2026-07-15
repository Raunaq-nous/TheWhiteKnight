// Deterministic pre-filter for Feature 2 (interactive profile refinement).
// A bullet/description only becomes an LLM candidate if it fails this check —
// the model never sees already-quantified bullets, and this half of the
// pipeline is fully testable without mocking AI output.

import { Profile } from "./profile";

const CURRENCY_SYMBOLS = /[$€£¥₹]/;

const SCALE_KEYWORDS = [
  "revenue", "users", "user", "headcount", "deal", "margin", "time",
  "budget", "cost", "savings", "roi", "growth", "retention", "conversion",
  "clients", "customers",
];

/** True if the text already contains some form of quantification. */
export function isQuantified(text: string): boolean {
  if (!text) return true; // nothing to ask about — don't flag empty text as weak
  if (/\d/.test(text)) return true;
  if (/%/.test(text)) return true;
  if (CURRENCY_SYMBOLS.test(text)) return true;
  const lower = text.toLowerCase();
  return SCALE_KEYWORDS.some(kw => lower.includes(kw));
}

export type BulletCandidate = {
  targetType: "experience" | "project";
  /** Company name (experience) or project name (project) — used to locate the entry again later. */
  targetId: string;
  targetLabel: string;
  currentText: string;
};

/**
 * Scan every experience bullet and project description and return only the
 * ones lacking any quantification. This is the deterministic pre-filter —
 * the LLM in profileQuestionsPrompt only ever sees what this returns.
 */
export function getWeakBulletCandidates(profile: Profile): BulletCandidate[] {
  const out: BulletCandidate[] = [];

  for (const e of profile.experience) {
    const bullets = e.bullets.split("\n").map(b => b.trim()).filter(Boolean);
    for (const bullet of bullets) {
      if (!isQuantified(bullet)) {
        out.push({
          targetType: "experience",
          targetId: e.company,
          targetLabel: `${e.company} — ${e.role}`,
          currentText: bullet,
        });
      }
    }
  }

  for (const p of profile.projects) {
    if (p.description?.trim() && !isQuantified(p.description)) {
      out.push({
        targetType: "project",
        targetId: p.name,
        targetLabel: p.name,
        currentText: p.description.trim(),
      });
    }
  }

  return out;
}
