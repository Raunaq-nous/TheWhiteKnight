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
// Ordering (compareScored): the tool-building demotion (direct-delivery
// bullets outrank tool-building ones unless the archetype's core work IS
// building AI/software tools), then JD keyword overlap, then impact (outcome bucket, marker count) only as the tiebreak. Quality is not
// a ranking tier: bullets without an outcome clause are filtered out of
// resume selection entirely (lib/resume-outcome.ts, lib/resume-fill.ts).
// Nothing is dropped here; every bullet is just reordered so the model sees
// the most JD-relevant material first.
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
  // JD RELEVANCE before impact: the tool-building demotion (a tool whose
  // feature names reuse the JD's vocabulary is not the direct evidence),
  // then keyword overlap with the JD, and impact only as the tiebreak.
  // Impact-first ordering made every resume look the same: the same
  // quantified bullets won for every JD. Quality is a separate eligibility
  // filter (lib/resume-outcome.ts), not a ranking tier.
  return (b.toolBucket - a.toolBucket) || (b.overlap - a.overlap) || (b.outcome - a.outcome) || (b.density - a.density) || (a.idx - b.idx);
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

HOW TO READ THIS — bullets are ordered by JD RELEVANCE, with impact (QUANTIFIED > QUALITATIVE > NO OUTCOME) only as the tiebreak. A heavily quantified bullet about work this JD does not ask for is NOT a strong pick for this JD. A TOOL-BUILDING bullet still ranks behind a bullet that directly delivers the JD's core work, unless the JD's core ask IS building AI/software tools: a tool whose feature names reuse the JD's vocabulary is not the direct evidence. Use this as a starting point and apply the JD TOP REQUIREMENTS lens.`;
}
