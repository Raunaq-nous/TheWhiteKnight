// SELECTIVE BOLDING — docs/MASTER-PROFILE-SPEC.md Part 8: "Bold keywords
// distributed through the bullet, not one long bold lead phrase... roughly
// three to five bold fragments per bullet." Runs AFTER clampToOnePageBudget,
// on the FINAL rendered bullet string — deterministic, config-driven
// pattern matching, never a model call. This is a hard requirement: bullet
// text is selected from the real profile, never authored (see
// lib/resume-selection.ts) — letting a model return bold spans would mean
// trusting it to reason correctly about text it might reshape in its head,
// and a post-clamp round-trip to re-ask it adds cost and offset-drift risk
// for pure formatting. A deterministic pass over the ALREADY-FINAL string
// has neither problem: it can never disagree with what actually renders,
// because it runs on that exact string.
//
// Text is NEVER mutated — this module only returns spans; the renderer
// (lib/resume-docx.ts) splits the string into alternating plain/bold
// TextRuns at those exact offsets.

import profileRulesConfig from "../config/profile-rules.json";

export type BoldSpan = { start: number; end: number };

type BoldingConfigShape = {
  boldingMethodologyTerms?: string[];
  boldingEntityNouns?: string[];
};
const CONFIG = profileRulesConfig as BoldingConfigShape;

export const MAX_SPANS_PER_BULLET = 5;
// Documents the spec's "roughly three to five bold fragments per bullet"
// target — a real-world expectation for how rich a well-formed bullet's
// matches should be, NOT a floor this module pads toward. A bullet with
// fewer than this many real matches renders with exactly what it found;
// nothing is ever invented to hit this number.
export const TYPICAL_MIN_SPANS = 3;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function overlaps(a: BoldSpan, b: BoldSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

function overlapsAny(span: BoldSpan, existing: BoldSpan[]): boolean {
  return existing.some(e => overlaps(span, e));
}

/**
 * Runs one regex (global flag required) over `text`, returning every match
 * as a span, SKIPPING any match that overlaps a span already in `claimed`.
 * Matches are appended to `claimed` as they're accepted, so a later call
 * with a lower-priority pattern naturally yields territory already taken
 * by an earlier, higher-priority one.
 */
function claimMatches(text: string, pattern: RegExp, claimed: BoldSpan[]): BoldSpan[] {
  const found: BoldSpan[] = [];
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const span: BoldSpan = { start: m.index, end: m.index + m[0].length };
    if (span.start === span.end) { re.lastIndex++; continue; } // guard against zero-width matches looping forever
    if (!overlapsAny(span, claimed)) {
      found.push(span);
      claimed.push(span);
    }
  }
  return found;
}

// --- Category 1: quantities ------------------------------------------------
// Order matters within this category too: a RANGE match ("IRR from 6% to
// the 10% hurdle rate") is tried first so it claims the whole phrase before
// the plainer percent pattern would otherwise carve out just "6%" and "10%"
// as two separate, less meaningful spans.
const RANGE_PATTERN = /\b(?:[A-Z]{2,6}\s+)?from\s+\d+(?:\.\d+)?%\s+to\s+(?:the\s+)?\d+(?:\.\d+)?%(?:\s+[a-z]+){0,2}\b/g;
// "55+ partial and 10 complete live client cases" — a compound scale
// marker named explicitly in the spec (Part 4's Schedule/Cost/Risk
// Diagnostic toolkit scale line), distinct from a plain "N <unit>" count.
const COMPOUND_COUNT_PATTERN = /\b\d+\+?\s+(?:partial|complete)(?:\s+and\s+\d+\+?\s+(?:partial|complete))?\s+(?:live\s+)?(?:client\s+)?(?:cases?|projects?|sites?|engagements?)\b/gi;
const CURRENCY_PATTERN = /\$\d[\d,.]*\s?(?:[bmk]illion|[bmk])?\b/gi;
const COUNT_WITH_UNIT_PATTERN = /\b\d+\+?\s?(?:projects?|sites?|processes?|clients?|mandates?|deals?|years?|months?|people|hires?|workstreams?|engagements?|cases?|industries?|GW|plants?|partners?|teams?|integrators?|territories?|states?|firms?|customers?|activities?)\b/gi;
const BARE_PERCENT_PATTERN = /\b\d+(?:\.\d+)?%/g;

function findQuantitySpans(text: string, claimed: BoldSpan[]): BoldSpan[] {
  return [
    ...claimMatches(text, RANGE_PATTERN, claimed),
    ...claimMatches(text, COMPOUND_COUNT_PATTERN, claimed),
    ...claimMatches(text, CURRENCY_PATTERN, claimed),
    ...claimMatches(text, COUNT_WITH_UNIT_PATTERN, claimed),
    ...claimMatches(text, BARE_PERCENT_PATTERN, claimed),
  ].sort((a, b) => a.start - b.start);
}

// --- Category 2: methodology / artifact terms -------------------------------
// Config-driven (config/profile-rules.json's boldingMethodologyTerms) so
// this list can be tuned without a code change. Matched longest-first so a
// longer, more specific phrase ("CapEx and OpEx optimisation levers")
// claims its territory before a shorter one that happens to be a substring
// of it would otherwise fire first.
function findMethodologySpans(text: string, claimed: BoldSpan[]): BoldSpan[] {
  const terms = [...(CONFIG.boldingMethodologyTerms ?? [])].sort((a, b) => b.length - a.length);
  const out: BoldSpan[] = [];
  for (const term of terms) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    out.push(...claimMatches(text, pattern, claimed));
  }
  return out.sort((a, b) => a.start - b.start);
}

// --- Category 3: client/entity descriptors ----------------------------------
// "an adjective-chain ending in a recognised entity noun" — 2 to 4
// qualifier tokens (allowing hyphens/digits, e.g. "utility-scale", "B2B")
// immediately preceding a configured entity noun (config's
// boldingEntityNouns). Common articles/prepositions are excluded from the
// qualifier tokens so a match never drags in "on a" / "for the" — only the
// real descriptive words immediately adjacent to the noun.
const QUALIFIER_STOPWORDS = new Set([
  "a", "an", "the", "on", "in", "of", "for", "to", "with", "at", "by", "its", "this", "that", "into", "from",
]);
const QUALIFIER_TOKEN = `(?!(?:${[...QUALIFIER_STOPWORDS].join("|")})\\b)[A-Za-z][\\w-]*`;

function buildEntityPattern(): RegExp | null {
  const nouns = CONFIG.boldingEntityNouns ?? [];
  if (nouns.length === 0) return null;
  const nounAlternation = nouns.map(escapeRegExp).join("|");
  return new RegExp(`\\b((?:${QUALIFIER_TOKEN}\\s+){2,4}(?:${nounAlternation}))\\b`, "gi");
}

function findEntitySpans(text: string, claimed: BoldSpan[]): BoldSpan[] {
  const pattern = buildEntityPattern();
  if (!pattern) return [];
  return claimMatches(text, pattern, claimed).sort((a, b) => a.start - b.start);
}

// --- Lead-label guard --------------------------------------------------------
// Every selected bullet follows action-verb-first phrasing (see
// BULLET SELECTION FORMULA in lib/prompts.ts) — a span starting at index 0
// would bold the lead verb (and whatever ran on from it), which is exactly
// the "one long bold lead phrase" the spec says never to do. Drop it rather
// than trim it: a partial bold starting mid-verb is worse than no bold.
function dropLeadLabelSpans(spans: BoldSpan[]): BoldSpan[] {
  return spans.filter(s => s.start !== 0);
}

/**
 * Computes the bold spans for one FINAL, already-rendered bullet string.
 * Pure — never mutates or reflows `text`. Priority order when capping at
 * MAX_SPANS_PER_BULLET: quantities, then methodology/artifact terms, then
 * client/entity descriptors — each category only claims territory the
 * higher-priority ones left unclaimed, so spans never overlap. Returns an
 * empty array (never throws, never blocks) when nothing matches.
 */
export function computeBoldSpans(text: string): BoldSpan[] {
  if (!text) return [];
  const claimed: BoldSpan[] = [];
  const quantitySpans = findQuantitySpans(text, claimed);
  const methodologySpans = findMethodologySpans(text, claimed);
  const entitySpans = findEntitySpans(text, claimed);

  const ordered = dropLeadLabelSpans([...quantitySpans, ...methodologySpans, ...entitySpans]);
  return ordered.slice(0, MAX_SPANS_PER_BULLET);
}

/**
 * Splits `text` into an ordered list of { text, bold } segments at the
 * given spans — this is what the docx renderer turns into alternating
 * TextRuns. Spans are assumed non-overlapping and within bounds (exactly
 * what computeBoldSpans guarantees); out-of-range or overlapping input is
 * defensively clipped/dropped rather than allowed to throw or corrupt
 * neighboring text.
 */
export function splitTextByBoldSpans(text: string, spans: BoldSpan[]): { text: string; bold: boolean }[] {
  if (spans.length === 0) return [{ text, bold: false }];

  const valid = [...spans]
    .filter(s => s.start >= 0 && s.end <= text.length && s.start < s.end)
    .sort((a, b) => a.start - b.start);

  const segments: { text: string; bold: boolean }[] = [];
  let cursor = 0;
  for (const span of valid) {
    if (span.start < cursor) continue; // overlap with a previously-placed span — drop it defensively
    if (span.start > cursor) segments.push({ text: text.slice(cursor, span.start), bold: false });
    segments.push({ text: text.slice(span.start, span.end), bold: true });
    cursor = span.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), bold: false });
  return segments;
}
