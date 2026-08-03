import { Profile } from "./profile";
import { Application } from "./store";
import { ResumeArchetype } from "./resume-archetype";

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
// The fix: bullets are bucketed BEFORE they are scored on overlap.
// Direct-delivery bullets always outrank tool-building bullets, regardless
// of raw keyword density, UNLESS the target archetype's core work IS
// building AI/software tools (ai_ml_engineering) — in which case
// tool-building bullets are exactly what should rank highest. Within each
// bucket, bullets are ordered by keyword overlap. Nothing is dropped —
// every bullet/project survives, just reordered so the model sees the most
// relevant material first and can select/write from the complete set.
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

function rankBulletLines(bulletsText: string, jdTerms: Set<string>, demote: boolean): string {
  const bullets = bulletsText.split("\n").map(b => b.trim()).filter(Boolean);
  const scored = bullets.map((text, idx) => {
    const isToolBuilding = TOOL_BUILDING_PATTERN.test(text);
    const bucket = demote && isToolBuilding ? 0 : 1; // 1 = direct-delivery tier, ranks first
    return { text, idx, overlap: keywordOverlap(text, jdTerms), bucket };
  });
  scored.sort((a, b) => (b.bucket - a.bucket) || (b.overlap - a.overlap) || (a.idx - b.idx));
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
    ? [...profile.projects].sort((a, b) => {
        const scoreA = keywordOverlap(a.description, jdTerms) - (demote && TOOL_BUILDING_PATTERN.test(a.description) ? 100 : 0);
        const scoreB = keywordOverlap(b.description, jdTerms) - (demote && TOOL_BUILDING_PATTERN.test(b.description) ? 100 : 0);
        return scoreB - scoreA;
      })
    : profile.projects;

  return { ...profile, experience, projects };
}

export type BulletRelevanceHint = {
  company: string;
  text: string;
  keywordOverlap: number;
  toolBuilding: boolean;
};

export function computeBulletRelevanceHints(profile: Profile, app: Application): BulletRelevanceHint[] {
  const jdTerms = jdTermSet(app);
  const hints: BulletRelevanceHint[] = [];
  for (const entry of profile.experience) {
    const bullets = entry.bullets.split("\n").map(b => b.trim()).filter(Boolean);
    for (const text of bullets) {
      hints.push({ company: entry.company, text, keywordOverlap: keywordOverlap(text, jdTerms), toolBuilding: TOOL_BUILDING_PATTERN.test(text) });
    }
  }
  return hints;
}

export function renderRelevanceHintsBlock(hints: BulletRelevanceHint[]): string {
  if (hints.length === 0) return "";
  const lines = hints
    .map(h => `- [${h.company}] overlap=${h.keywordOverlap}${h.toolBuilding ? " TOOL-BUILDING" : ""} :: "${h.text}"`)
    .join("\n");
  return `DETERMINISTIC RELEVANCE RANKING — the experience section above is already reordered by this exact logic (most relevant bullet first, within each role); these are the scores behind that order, shown for transparency, not something to re-derive:
${lines}

HOW TO READ THIS — a bullet marked TOOL-BUILDING describes building a tool, platform, or system whose feature names happen to reuse the JD's vocabulary (e.g. "cost modeling engine", "schedule optimization platform"). Unless the JD's core ask IS building AI/software tools, a bullet that shows DIRECTLY DELIVERING the JD's core work (leading the actual capital program, making the actual recommendation, owning the actual deal) outranks a TOOL-BUILDING bullet even when the tool-building bullet's raw overlap score is higher — that demotion is already applied to the ordering above. Respect this ordering when assigning "priority": bullets presented earlier within a role are generally the stronger pick, but still use judgment.`;
}
