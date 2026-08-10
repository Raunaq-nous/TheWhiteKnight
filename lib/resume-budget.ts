// Structural one-page guarantee — layer 2 of 3 (see lib/prompts.ts for layer
// 1's generation budget, app/resume-document.tsx for layer 3's fixed print
// layout). This is the deterministic backstop: it enforces hard content
// limits regardless of what the model actually returned, with NO browser
// measurement involved. Replaces the old measure-trim-expand JS fit loop,
// which patched around unbounded generation instead of bounding it upfront.

import { ResumeContent, ResumeBullet } from "./resume-schema";
import { RESUME_SPECS, ResumeArchetype } from "./resume-archetype";
import { dedupeExperienceAgainstTopBand } from "./resume-dedupe";

export const ONE_PAGE_BUDGET = {
  // "Exactly 2 lines, max" for the summary — ~100 chars/line at this layout.
  summaryMaxChars: 200,
  keyImpactMaxItems: 3,
  keyImpactItemMaxChars: 180,
  // Per-entry: 2-3 bullets per shown role (BUG D — tightened from 4).
  bulletsPerRoleMax: 3,
  // A shown role must never be left looking thin — the most recent/most
  // relevant role is the most-read part of the page. Enforced by
  // un-promoting top-band items rather than by dedupe sparing a duplicate
  // (see enforceMinBulletsPerRole below).
  experienceMinBulletsPerRole: 2,
  // The Key Projects & Impact / Key Wins band must read as a portfolio
  // across the candidate's career, not a highlight reel of one employer.
  topBandMaxPerCompany: 2,
  // At most this many ROLES are shown at all — the rest are dropped
  // entirely (lowest JD-relevance first), not just trimmed to fewer
  // bullets. New in this pass (BUG D): with the raised per-bullet char
  // cap, showing every role would blow the one-page budget; showing fewer,
  // richer roles reads better and actually fits.
  experienceMaxRoles: 4,
  // Global ceiling across ALL shown roles combined.
  totalExperienceBulletsMax: 10,
  // Target ~200 chars (enforced at generation, lib/prompts.ts); hard
  // ceiling here is deliberately higher than the target so the clamp is a
  // rare backstop, not the primary shortener (BUG B).
  bulletMaxChars: 240,
  skillsMaxCategories: 3,
  skillsMaxItemsPerCategory: 6,
  educationMaxEntries: 2,
} as const;

/**
 * Cuts text to at most maxChars: prefers breaking at the end of the last
 * full sentence that fits, falls back to the last word boundary. Never cuts
 * mid-word and never appends an ellipsis or other filler. Used only for the
 * summary, which can never be dropped entirely — see clampBulletText below
 * for droppable list items (bullets, key wins, project descriptions), which
 * additionally guarantee the result is grammatically complete.
 */
export function clampText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const window = trimmed.slice(0, maxChars);
  const lastSentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (lastSentenceEnd > maxChars * 0.4) return window.slice(0, lastSentenceEnd + 1).trim();
  const lastSpace = window.lastIndexOf(" ");
  if (lastSpace > 0) return window.slice(0, lastSpace).trim();
  return window.trim();
}

// Words that read as an obviously incomplete/dangling clause when they're
// the LAST word of a bullet — a naive character-slice regularly ends on one
// of these (e.g. "...designing governance and", "...used for"). Trimming
// back past them (rather than just capping length) is what the previous
// blind slice failed to do.
const DANGLING_TRAILING_WORDS = new Set([
  "and", "or", "but", "nor", "with", "for", "to", "of", "in", "on", "at", "by",
  "as", "the", "a", "an", "from", "into", "onto", "via", "using", "across", "within",
]);

function stripTrailingPunctuation(s: string): string {
  return s.replace(/[.,;:!?\-–—]+$/, "").trim();
}

function endsGrammatically(s: string): boolean {
  const words = s.trim().split(/\s+/);
  const lastWord = words[words.length - 1];
  if (!lastWord) return false;
  const lettersOnly = lastWord.toLowerCase().replace(/[^a-z]/g, "");
  // A last word with no letters at all — "32%", "$10.45B", "200+", "16" —
  // is a quantified ending, exactly what a good bullet should end on. It
  // can't be a dangling conjunction/preposition, so it's always grammatical.
  if (lettersOnly.length === 0) return true;
  return !DANGLING_TRAILING_WORDS.has(lettersOnly);
}

function withTerminalPeriod(s: string): string {
  const stripped = stripTrailingPunctuation(s);
  return stripped ? `${stripped}.` : stripped;
}

// Splits text after each comma/semicolon/colon — the same clause-boundary
// convention splitOutcomeClause uses below, kept as its own helper so
// clampBulletText can re-split a setup fragment the same way.
function clauseSegments(text: string): string[] {
  return text.trim().split(/(?<=[,;:])\s+/).filter(Boolean);
}

/**
 * Clamps a droppable list item (a key win, a project description, an
 * experience bullet's setup) to at most maxChars while guaranteeing the
 * result is a complete, grammatical clause ending in a period.
 *
 * BUG: compression used to walk backward through WHOLE WORDS from a
 * character-budget window, which could cut inside a noun phrase — e.g.
 * "Designed a portfolio intelligence cockpit integrating..." became
 * "Designed a portfolio," (grammatically terminated by an appended period,
 * but semantically nonsense — the object of "Designed" got truncated
 * mid-phrase). Fixed by trimming at CLAUSE boundaries only (comma/
 * semicolon/colon): a compressed bullet is always some prefix of the
 * original's real clauses, joined whole, never a word-level slice through
 * the middle of one. If even the first clause alone doesn't fit, there is
 * no way to shorten this text without truncating mid-phrase, so the whole
 * item is dropped (returns null) rather than emit a broken fragment.
 */
export function clampBulletText(text: string, maxChars: number): string | null {
  // Reserve 1 character for the terminal period this function always adds,
  // so the returned string (period included) never exceeds maxChars.
  const budget = maxChars - 1;
  const original = stripTrailingPunctuation(text.trim());
  if (original.length === 0) return null;

  const segments = clauseSegments(original);
  for (let count = segments.length; count >= 1; count--) {
    const candidate = stripTrailingPunctuation(segments.slice(0, count).join(" "));
    if (candidate.length === 0) continue;
    if (candidate.length <= budget && endsGrammatically(candidate)) {
      return withTerminalPeriod(candidate);
    }
  }
  return null;
}

// Marks the quantified/scope-marker "outcome" of a CAR bullet — a dollar
// value, a percentage, a "N+ [things]" scale marker, or one of a handful of
// fixed high-signal phrases (board-level, C-suite, multi-billion-dollar).
// Used to find the LAST clause of a bullet that contains real impact, so
// clamping can protect it and shorten everything BEFORE it instead (BUG B).
// NOTE: the currency alternative accepts BOTH the spelled-out word
// ("billion") and the bare abbreviation letter ("B") right after the
// digits — "$10B" is just as real a scope marker as "$10.45B", and a
// digit run abutting a bare letter (no space, no decimal point) can never
// satisfy a trailing \b on its own (word char directly followed by word
// char), so the abbreviation form needs its own explicit alternative
// rather than relying on [bmk]illion to (accidentally) cover it.
export const OUTCOME_MARKER_PATTERN =
  /\$[\d,.]+\s?(?:[bmk]illion|[bmk])?\b|\d+(\.\d+)?%|\b\d+\+\b|\bboard[- ]level\b|\bc-suite\b|\bmulti-billion(?:-dollar)?\b|\bmulti-million(?:-dollar)?\b|\b\d+\+?\s?(?:sites?|projects?|mandates?|clients?|engagements?|workstreams?|deals?|years?|months?|people|hires?)\b/i;

/**
 * Splits text into clauses (after each comma/semicolon/colon), then finds
 * the LAST clause (searching from the end) that contains an outcome marker.
 * Everything from that clause onward is "the outcome" (protected);
 * everything before it is "the setup" (may be shortened).  Returns
 * setup === null when no clause has a marker at all — callers fall back to
 * treating the whole text as ordinary (non-outcome-protected) content.
 */
export function splitOutcomeClause(text: string): { setup: string | null; outcome: string } {
  const clauses = text.trim().split(/(?<=[,;:])\s+/).filter(Boolean);
  for (let i = clauses.length - 1; i >= 0; i--) {
    if (OUTCOME_MARKER_PATTERN.test(clauses[i])) {
      const outcome = stripTrailingPunctuation(clauses.slice(i).join(" "));
      const setup = i > 0 ? stripTrailingPunctuation(clauses.slice(0, i).join(" ")) : "";
      return { setup, outcome };
    }
  }
  return { setup: null, outcome: stripTrailingPunctuation(text.trim()) };
}

/**
 * Clamps an EXPERIENCE bullet to at most maxChars while NEVER shortening
 * the outcome clause (BUG B, the highest-priority fix in this pass): only
 * the setup/context portion is trimmed. If the outcome clause alone (plus a
 * period) already exceeds maxChars, or the bullet has no identifiable
 * outcome and doesn't fit any other way, the WHOLE BULLET is dropped
 * (returns null) rather than emit an impact-less fragment.
 */
export function clampBulletPreservingOutcome(text: string, maxChars: number): string | null {
  const { setup, outcome } = splitOutcomeClause(text);

  // No identifiable outcome clause at all — fall back to the grammar-safe
  // (but not outcome-aware) clamp; there's nothing specific to protect.
  if (setup === null) return clampBulletText(text, maxChars);

  const outcomeFinal = withTerminalPeriod(outcome);
  if (outcomeFinal.length > maxChars) {
    // Can't fit even the outcome alone — an impact-less bullet is worse
    // than no bullet at all.
    return null;
  }
  if (!setup) return outcomeFinal;

  const connector = ", ";
  let candidate = `${setup}${connector}${outcomeFinal}`;
  if (candidate.length <= maxChars) return candidate;

  // Shorten the SETUP only, at whole clause boundaries, never touching the
  // outcome and never cutting inside a clause (see clampBulletText above —
  // this is exactly the function that fix applies to).
  const setupBudget = maxChars - connector.length - outcomeFinal.length;
  if (setupBudget < 10) return outcomeFinal; // no room for any setup — outcome alone
  const trimmedSetup = clampBulletText(setup, setupBudget + 1);
  if (!trimmedSetup) return outcomeFinal;
  const setupNoPeriod = stripTrailingPunctuation(trimmedSetup);
  candidate = `${setupNoPeriod}${connector}${outcomeFinal}`;
  return candidate.length <= maxChars ? candidate : outcomeFinal;
}

function topBulletsByPriority(bullets: ResumeBullet[], max: number): ResumeBullet[] {
  const candidates = [...bullets].sort((a, b) => a.priority - b.priority).slice(0, max);
  const clamped = candidates
    .map(b => ({ ...b, text: clampBulletPreservingOutcome(b.text, ONE_PAGE_BUDGET.bulletMaxChars) }))
    .filter((b): b is ResumeBullet => b.text !== null);

  // Never leave an entry with zero bullets just because every candidate
  // failed the outcome/grammar check — fall back to the single best (lowest
  // priority number) candidate, plain-clamped, rather than show nothing.
  if (clamped.length === 0 && candidates.length > 0) {
    const best = candidates[0];
    return [{ ...best, text: clampText(best.text, ONE_PAGE_BUDGET.bulletMaxChars) }];
  }
  return clamped;
}

/**
 * Drops the lowest-relevance ROLES entirely (not just their bullets) when
 * there are more than maxRoles — new in this pass (BUG D). A role's
 * relevance proxy is its single best (lowest-numbered) bullet priority,
 * since "priority" is assigned on a shared global scale across the whole
 * resume (the same assumption trimToGlobalBulletBudget already relies on).
 * Roles with no bullets at all are always dropped first.
 */
function capRolesByRelevance(experience: ResumeContent["experience"], maxRoles: number): ResumeContent["experience"] {
  if (experience.length <= maxRoles) return experience;
  const bestPriority = (e: ResumeContent["experience"][number]) =>
    e.bullets.length > 0 ? Math.min(...e.bullets.map(b => b.priority)) : Infinity;
  return [...experience]
    .sort((a, b) => bestPriority(a) - bestPriority(b))
    .slice(0, maxRoles);
}

/**
 * Second-stage trim: after each entry is capped individually to
 * bulletsPerRoleMax, the TOTAL across all shown entries might still exceed
 * the one-page budget. Trims the single globally-lowest-priority bullet
 * (highest priority number) across ALL entries, one at a time, until the
 * total fits — never emptying an entry down to zero. This is the "final
 * clamp trims the lowest-relevance bullet if it still overflows" behavior:
 * a deterministic, one-shot pass over already-known data, not a browser
 * measure-and-trim loop.
 */
function trimToGlobalBulletBudget(
  experience: ResumeContent["experience"],
  maxTotal: number,
): ResumeContent["experience"] {
  const entries = experience.map(e => ({ ...e, bullets: [...e.bullets] }));
  let total = entries.reduce((n, e) => n + e.bullets.length, 0);

  while (total > maxTotal) {
    let worst: { entryIdx: number; bulletIdx: number; priority: number } | null = null;
    entries.forEach((e, entryIdx) => {
      if (e.bullets.length <= 1) return; // never empty an entry entirely
      e.bullets.forEach((b, bulletIdx) => {
        if (!worst || b.priority > worst.priority) {
          worst = { entryIdx, bulletIdx, priority: b.priority };
        }
      });
    });
    if (!worst) break; // every entry is already down to its last bullet
    const { entryIdx, bulletIdx } = worst;
    entries[entryIdx] = { ...entries[entryIdx], bullets: entries[entryIdx].bullets.filter((_, j) => j !== bulletIdx) };
    total--;
  }

  return entries;
}

/**
 * Deterministically enforces the one-page content budget on generated resume
 * content, and nulls out any section this archetype's layout doesn't render.
 * The null-out step is what guarantees a section like "education" renders
 * LAST even though resolveSectionSequence's forgotten-content-bearing-key
 * safety net would otherwise re-append a stray section (e.g. leadership)
 * after it — nulled data renders nothing, regardless of where the key ends
 * up in the resolved sequence.
 *
 * Pure and idempotent — no DOM, no measurement. This is the structural
 * guarantee; it never needs to run more than once.
 */
export function clampToOnePageBudget(content: ResumeContent, archetype: ResumeArchetype): ResumeContent {
  const seq = RESUME_SPECS[archetype].sectionSequence;
  const usesSelectedImpact = seq.includes("selectedImpact");

  const roleCapped = capRolesByRelevance(content.experience, ONE_PAGE_BUDGET.experienceMaxRoles);
  const perEntryCapped = roleCapped.map(e => ({
    ...e,
    bullets: topBulletsByPriority(e.bullets, ONE_PAGE_BUDGET.bulletsPerRoleMax),
  }));

  const clamped: ResumeContent = {
    ...content,
    summary: content.summary ? clampText(content.summary, ONE_PAGE_BUDGET.summaryMaxChars) : content.summary,
    experience: trimToGlobalBulletBudget(perEntryCapped, ONE_PAGE_BUDGET.totalExperienceBulletsMax),
    skills: content.skills
      .slice(0, ONE_PAGE_BUDGET.skillsMaxCategories)
      .map(g => ({ ...g, items: g.items.slice(0, ONE_PAGE_BUDGET.skillsMaxItemsPerCategory) })),
    education: content.education
      .slice(0, ONE_PAGE_BUDGET.educationMaxEntries)
      .map(ed => ({ ...ed, achievements: null })),
    // BUG A: certifications are never rendered, for any archetype,
    // regardless of what the model returned or what's stored — a blanket
    // product decision, not an archetype-specific one.
    certifications: null,
  };

  if (!seq.includes("leadership")) clamped.leadership = null;

  // Same, for a project's description — the whole project entry is dropped
  // if its description can't be trimmed grammatically.
  const clampProject = (p: NonNullable<ResumeContent["projects"]>[number]) => {
    const description = clampBulletText(p.description, ONE_PAGE_BUDGET.keyImpactItemMaxChars);
    return description ? { ...p, description } : null;
  };

  // keyWins and keyWinIds are parallel, index-aligned arrays (see BUG-C-2
  // architectural change: keyWins is resolved server-side from real profile
  // bullet ids, never model-authored prose) — this clamps both in lockstep
  // so a win's id never drifts out of sync with its text, which is what
  // both the checkbox UI's provenance and the id-based dedupe below depend
  // on. Grammar-aware, droppable: an item that can't be trimmed to a
  // complete clause is dropped from BOTH arrays at the same index.
  const clampKeyWins = (maxItems: number) => {
    const wins = (content.keyWins ?? []).slice(0, maxItems);
    const ids = (content.keyWinIds ?? []).slice(0, maxItems);
    const keptWins: string[] = [];
    const keptIds: string[] = [];
    wins.forEach((w, i) => {
      const clamped = clampBulletText(w, ONE_PAGE_BUDGET.keyImpactItemMaxChars);
      if (clamped !== null) { keptWins.push(clamped); keptIds.push(ids[i] ?? ""); }
    });
    return { keyWins: keptWins, keyWinIds: keptIds };
  };

  if (usesSelectedImpact) {
    // Combined Key Projects & Impact band — the total item count across both
    // arrays is what's capped, since they render together as one list.
    const { keyWins, keyWinIds } = clampKeyWins(ONE_PAGE_BUDGET.keyImpactMaxItems);
    const remaining = ONE_PAGE_BUDGET.keyImpactMaxItems - keyWins.length;
    const keptProjects = remaining > 0 ? (content.projects ?? []).slice(0, remaining) : [];
    clamped.keyWins = keyWins;
    clamped.keyWinIds = keyWinIds;
    clamped.projects = keptProjects.map(clampProject).filter((p): p is NonNullable<typeof p> => p !== null);
  } else {
    if (seq.includes("keyWins")) {
      const { keyWins, keyWinIds } = clampKeyWins(ONE_PAGE_BUDGET.keyImpactMaxItems);
      clamped.keyWins = keyWins;
      clamped.keyWinIds = keyWinIds;
    } else {
      clamped.keyWins = null;
      clamped.keyWinIds = null;
    }
    clamped.projects = seq.includes("projects")
      ? (content.projects ?? []).slice(0, ONE_PAGE_BUDGET.keyImpactMaxItems).map(clampProject).filter((p): p is NonNullable<typeof p> => p !== null)
      : null;
  }

  // Every shown role keeps a floor of substantive bullets, and the top band
  // draws from across employers rather than concentrating on one — both
  // run BEFORE dedupe, since they change what got PROMOTED to the top band
  // in the first place, not just what survives after the fact.
  const diversified = capTopBandPerCompany(clamped, ONE_PAGE_BUDGET.topBandMaxPerCompany);
  const floored = enforceMinBulletsPerRole(diversified, ONE_PAGE_BUDGET.experienceMinBulletsPerRole);

  // BUG C: semantic dedupe — drop any experience bullet that describes the
  // same underlying engagement as an already-selected top-band item. Runs
  // last, after both layers have their final content, so it sees exactly
  // what will actually render.
  return dedupeExperienceAgainstTopBand(floored);
}

/**
 * Caps how many top-band (Key Wins/Key Projects & Impact) items can trace
 * back to a single employer — the band should read as a portfolio across
 * the whole career, not a highlight reel of whichever role has the most
 * quantified bullets. Only applies to experience-sourced ids (a project
 * isn't tied to an employer); excess items beyond the cap, in priority
 * order, are dropped from the top band — they remain visible in their
 * originating role's Experience bullets if selected there too.
 */
export function capTopBandPerCompany(content: ResumeContent, maxPerCompany: number): ResumeContent {
  const idToCompany = new Map<string, string>();
  for (const e of content.experience) {
    for (const b of e.bullets) if (b.sourceBulletId) idToCompany.set(b.sourceBulletId, e.company);
  }

  const seenCount = new Map<string, number>();
  const keptKeyWins: string[] = [];
  const keptKeyWinIds: string[] = [];
  let dropped = false;
  (content.keyWinIds ?? []).forEach((id, i) => {
    const company = idToCompany.get(id);
    if (company) {
      const n = seenCount.get(company) ?? 0;
      if (n >= maxPerCompany) { dropped = true; return; }
      seenCount.set(company, n + 1);
    }
    keptKeyWinIds.push(id);
    keptKeyWins.push(content.keyWins?.[i] ?? "");
  });

  if (!dropped) return content;
  return { ...content, keyWins: keptKeyWins, keyWinIds: keptKeyWinIds };
}

/**
 * Ensures no shown role drops below `minBullets` once dedupe removes
 * whatever duplicates a top-band selection. Rather than let dedupe spare a
 * duplicate (which would render the same engagement twice), this UN-
 * PROMOTES just enough of that role's top-band-linked bullets — back out
 * of keyWinIds/keyWins — so they render in Experience instead, which is
 * where dedupe would otherwise have deleted them from. A role that never
 * had `minBullets` to begin with is left as-is; there's nothing to
 * redistribute.
 */
export function enforceMinBulletsPerRole(content: ResumeContent, minBullets: number): ResumeContent {
  const topBandIds = new Set(
    [...(content.keyWinIds ?? []), ...(content.projects ?? []).map(p => p.sourceBulletId)].filter(Boolean),
  );
  if (topBandIds.size === 0) return content;

  const idsToUnpromote = new Set<string>();
  for (const e of content.experience) {
    const survivingCount = e.bullets.filter(b => !topBandIds.has(b.sourceBulletId)).length;
    if (survivingCount >= minBullets || e.bullets.length < minBullets) continue;
    // Un-promote the WEAKEST (highest priority number) duplicated bullets
    // first, so the strongest engagement stays in the top band.
    const duplicated = [...e.bullets]
      .filter(b => topBandIds.has(b.sourceBulletId))
      .sort((a, b) => b.priority - a.priority);
    let need = minBullets - survivingCount;
    for (const b of duplicated) {
      if (need <= 0) break;
      idsToUnpromote.add(b.sourceBulletId);
      need--;
    }
  }
  if (idsToUnpromote.size === 0) return content;

  const keyWins: string[] = [];
  const keyWinIds: string[] = [];
  (content.keyWinIds ?? []).forEach((id, i) => {
    if (idsToUnpromote.has(id)) return;
    keyWinIds.push(id);
    keyWins.push(content.keyWins?.[i] ?? "");
  });
  const projects = (content.projects ?? []).filter(p => !idsToUnpromote.has(p.sourceBulletId));

  return { ...content, keyWins, keyWinIds, projects };
}

// Rough line-count estimate for the rendered document, used only to verify
// (in tests) that budget-clamped content structurally fits a single letter
// page — a proxy for the real browser measurement, since this repo's test
// environment has no DOM/print renderer available.
const CHARS_PER_LINE = 92;
const textLines = (s: string) => Math.max(1, Math.ceil(s.length / CHARS_PER_LINE));

export function estimateResumeLineCount(content: ResumeContent, archetype: ResumeArchetype): number {
  const seq = RESUME_SPECS[archetype].sectionSequence;
  let lines = 2; // name + contact line

  for (const key of seq) {
    if (key === "summary" && content.summary?.trim()) {
      lines += 1 + textLines(content.summary);
    } else if (key === "selectedImpact") {
      const items = (content.keyWins?.length ?? 0) + (content.projects?.length ?? 0);
      if (items > 0) lines += 1 + items;
    } else if (key === "keyWins" && content.keyWins?.length) {
      lines += 1 + content.keyWins.length;
    } else if (key === "projects" && content.projects?.length) {
      lines += 1 + content.projects.length;
    } else if (key === "experience" && content.experience.length > 0) {
      lines += 1;
      for (const e of content.experience) {
        // Bullets are now longer (~200 chars target) — a single logical
        // bullet line can wrap to ~2 visual lines at this layout's width.
        lines += 1 + (e.location ? 1 : 0) + e.bullets.reduce((n, b) => n + textLines(b.text), 0);
      }
    } else if (key === "education" && content.education.length > 0) {
      lines += 1;
      for (const ed of content.education) lines += 2 + (ed.achievements?.length ?? 0);
    } else if (key === "skills" && content.skills.length > 0) {
      lines += 1 + content.skills.length;
    } else if (key === "leadership" && content.leadership?.length) {
      lines += 1 + content.leadership.length;
    } else if (key === "certifications" && content.certifications?.length) {
      lines += 1 + content.certifications.length;
    }
  }

  return lines;
}

// A letter page's usable height at the fixed print font/line-height in
// app/resume-document.tsx comfortably holds this many text lines with
// margin to spare — used as the pass/fail line in tests, not at runtime.
export const MAX_LINES_PER_PAGE = 55;
