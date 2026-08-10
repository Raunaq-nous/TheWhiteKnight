import { Profile } from "./profile";
import { Application } from "./store";
import { ResumeArchetype } from "./resume-archetype";
import { OUTCOME_MARKER_PATTERN } from "./resume-budget";
import { hasIdentifiableOutcome } from "./resume-format-gate";

// Deterministic pre-ranking pass for resume generation (BUG 1 fix).
//
// The resume prompt previously had NO code-side relevance signal at all —
// bullet selection was 100% delegated to one LLM self-judged "priority"
// field. Naive keyword overlap alone doesn't fix this: a bullet about
// BUILDING a tool scores HIGHER on literal keyword density than a bullet
// about DIRECTLY DELIVERING the JD's core work, because the tool's feature
// names happen to reuse the JD's vocabulary (verified numerically: a
// nuclear capital-program delivery bullet vs. an AI-platform bullet whose
// feature list literally contains "cost modeling"/"schedule optimization"/
// "capital allocation" — the AI bullet scores ~3.8x higher on raw overlap
// despite being the less relevant proof point for a capital-projects JD).
//
// Bullets are bucketed BEFORE they are scored on overlap, in two
// dimensions:
//   1. OUTCOME BUCKET (impact density) — a bullet with a QUANTIFIED
//      outcome ($/%/scope marker) always outranks one with only a
//      qualitative outcome (delivered artifact/consequence/decision), which
//      always outranks one with NO identifiable outcome at all. Space was
//      going to narrative bullets with zero result ("Understanding India's
//      competitive structures...") ahead of quantified ones purely because
//      they scored higher on raw JD-keyword overlap — this bucket is
//      checked FIRST, before overlap, so that can't happen again. A
//      no-outcome bullet is only ever selected to fill remaining space.
//   2. TOOL-BUILDING BUCKET — direct-delivery bullets always outrank
//      tool-building bullets, regardless of raw keyword density, UNLESS the
//      target archetype's core work IS building AI/software tools
//      (ai_ml_engineering).
// Within matching buckets, bullets are ordered by keyword overlap. Nothing
// is dropped — every bullet/project survives, just reordered so the model
// (and the deterministic selection/clamp pipeline downstream) sees the
// strongest material first.
const TOOL_BUILDING_PATTERN =
  /\b(built|build|shipped|ship|developed|develop|designed|design|created|create|launched|launch)\b[^.]{0,60}\b(platform|tool|tools|dashboard|engine|app|application|system|automation|agent|agents|bot|pipeline|prototype)\b/i;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "into", "over", "across",
  "your", "you", "are", "was", "were", "has", "have", "had", "will", "our",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t)),
  );
}

function keywordOverlap(text: string, jdTerms: Set<string>): number {
  let overlap = 0;
  for (const t of tokenize(text)) if (jdTerms.has(t)) overlap++;
  return overlap;
}

// Global variant of the (non-global) quantitative outcome pattern, so
// impactDensity can count EVERY quantified marker in a bullet, not just
// detect the first one.
const OUTCOME_MARKER_PATTERN_GLOBAL = new RegExp(OUTCOME_MARKER_PATTERN.source, "gi");

/** Count of quantified outcome markers ($ / % / scope figures) in the text — the "how many numbers back this up" signal. */
export function impactDensity(text: string): number {
  return (text.match(OUTCOME_MARKER_PATTERN_GLOBAL) ?? []).length;
}

export type OutcomeBucket = 2 | 1 | 0; // 2 = quantified, 1 = qualitative only, 0 = none

/** 2 = has a quantified outcome, 1 = has a qualitative-only outcome (delivered artifact/consequence/decision), 0 = no identifiable outcome at all. */
export function outcomeBucket(text: string): OutcomeBucket {
  if (impactDensity(text) > 0) return 2;
  if (hasIdentifiableOutcome(text)) return 1;
  return 0;
}

// JD terms available deterministically at resume-generation time — the AF
// scoring pass already extracted these before this call, unlike the
// LLM-only targetPriorities/subFocus which don't exist until the resume
// prompt's own Step 1 analysis runs.
function jdTermSet(app: Application): Set<string> {
  const terms = [
    ...(app.jdParsed?.keywords ?? []),
    ...(app.jdParsed?.keyRequirements ?? []),
    ...(app.jdParsed?.technicalSkills ?? []),
  ].join(" ");
  return tokenize(terms);
}

// Tool-building bullets are only demoted when the archetype's core work is
// NOT building AI/software tools — for ai_ml_engineering, building the tool
// IS the direct delivery, so nothing should be demoted.
function demotesToolBuilding(archetype: ResumeArchetype): boolean {
  return archetype !== "ai_ml_engineering";
}

type ScoredBullet = { text: string; idx: number; overlap: number; toolBucket: number; outcome: OutcomeBucket; density: number };

function scoreBullet(text: string, jdTerms: Set<string>, demote: boolean, idx: number): ScoredBullet {
  const isToolBuilding = TOOL_BUILDING_PATTERN.test(text);
  const toolBucket = demote && isToolBuilding ? 0 : 1; // 1 = direct-delivery tier, ranks first
  return { text, idx, overlap: keywordOverlap(text, jdTerms), toolBucket, outcome: outcomeBucket(text), density: impactDensity(text) };
}

function compareScored(a: ScoredBullet, b: ScoredBullet): number {
  // Impact density (outcome bucket, then raw marker count) is checked
  // BEFORE JD-keyword overlap — a quantified bullet must never lose a slot
  // to a narrative one just because the narrative happens to reuse more of
  // the JD's vocabulary.
  return (b.outcome - a.outcome) || (b.toolBucket - a.toolBucket) || (b.density - a.density) || (b.overlap - a.overlap) || (a.idx - b.idx);
}

function rankBulletLines(bulletsText: string, jdTerms: Set<string>, demote: boolean): string {
  const bullets = bulletsText.split("\n").map(b => b.trim()).filter(Boolean);
  const scored = bullets.map((text, idx) => scoreBullet(text, jdTerms, demote, idx));
  scored.sort(compareScored);
  return scored.map(s => s.text).join("\n");
}

// Reorders (never drops) every experience entry's bullets and every project
// by relevance to this JD, so the complete profile reaches the prompt with
// the most relevant material first. The model still selects/trims from this
// full, ranked set — this pass never truncates content, EXCEPT entries the
// candidate explicitly flagged excludeFromResume (kept everywhere else in
// the app — profile, scoring — just never surfaced on a generated resume).
export function rankProfileForResume(profile: Profile, app: Application, archetype: ResumeArchetype): Profile {
  const jdTerms = jdTermSet(app);
  const demote = demotesToolBuilding(archetype);

  const experience = profile.experience
    .filter(e => !e.excludeFromResume)
    .map(e => ({
      ...e,
      bullets: rankBulletLines(e.bullets, jdTerms, demote),
    }));

  const projects = profile.projects
    ? [...profile.projects]
        .map((p, idx) => ({ p, score: scoreBullet(p.description, jdTerms, demote, idx) }))
        .sort((a, b) => compareScored(a.score, b.score))
        .map(({ p }) => p)
    : profile.projects;

  return { ...profile, experience, projects };
}

export type BulletRelevanceHint = {
  company: string;
  text: string;
  keywordOverlap: number;
  toolBuilding: boolean;
  outcomeBucket: OutcomeBucket;
  impactDensity: number;
};

export function computeBulletRelevanceHints(profile: Profile, app: Application): BulletRelevanceHint[] {
  const jdTerms = jdTermSet(app);
  const hints: BulletRelevanceHint[] = [];
  for (const entry of profile.experience) {
    const bullets = entry.bullets.split("\n").map(b => b.trim()).filter(Boolean);
    for (const text of bullets) {
      hints.push({
        company: entry.company,
        text,
        keywordOverlap: keywordOverlap(text, jdTerms),
        toolBuilding: TOOL_BUILDING_PATTERN.test(text),
        outcomeBucket: outcomeBucket(text),
        impactDensity: impactDensity(text),
      });
    }
  }
  return hints;
}

const OUTCOME_BUCKET_LABEL: Record<OutcomeBucket, string> = { 2: "QUANTIFIED", 1: "QUALITATIVE", 0: "NO OUTCOME" };

export function renderRelevanceHintsBlock(hints: BulletRelevanceHint[]): string {
  if (hints.length === 0) return "";
  const lines = hints
    .map(h => `- [${h.company}] impact=${OUTCOME_BUCKET_LABEL[h.outcomeBucket]}(${h.impactDensity}) overlap=${h.keywordOverlap}${h.toolBuilding ? " TOOL-BUILDING" : ""} :: "${h.text}"`)
    .join("\n");
  return `DETERMINISTIC RELEVANCE RANKING — the experience section above is already reordered by this exact logic (most relevant bullet first, within each role); these are the scores behind that order, shown for transparency, not something to re-derive:
${lines}

HOW TO READ THIS — bullets are ranked by IMPACT FIRST: a QUANTIFIED bullet (has a real number/%/scope marker) always outranks a QUALITATIVE one (a real but unquantified outcome — a delivered artifact, a named decision), which always outranks a NO OUTCOME bullet (pure activity description with no result at all) — regardless of raw JD-keyword overlap. A NO OUTCOME bullet should only be selected to fill remaining space after every bullet with real impact has been placed. Within the same impact tier, a bullet marked TOOL-BUILDING (building a tool/platform whose feature names happen to reuse the JD's vocabulary) still ranks behind a same-tier bullet that directly delivers the JD's core work, unless the JD's core ask IS building AI/software tools. Respect this ordering when assigning "priority": bullets presented earlier within a role are the stronger pick — never rank a NO OUTCOME bullet ahead of a QUANTIFIED one.`;
}
