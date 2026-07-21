import { Profile } from "./profile";
import { Application } from "./store";

// Deterministic, non-authoritative relevance signal for resume bullet selection
// (bug fix: the resume prompt previously had NO code-side relevance signal at
// all — 100% delegated to one LLM self-judged "priority" field, with nothing
// to catch the specific failure mode where a bullet about BUILDING a tool
// scores higher on literal keyword density than a bullet about DIRECTLY
// DELIVERING the JD's core work, because the tool's feature names happen to
// reuse the JD's vocabulary). This hint is deliberately not a ranking — see
// TOOL_BUILDING_PATTERN below — it is surfaced to the LLM as a rough signal
// alongside an explicit instruction not to be fooled by it.
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

export type BulletRelevanceHint = {
  company: string;
  text: string;
  keywordOverlap: number;
  toolBuilding: boolean;
};

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

export function computeBulletRelevanceHints(profile: Profile, app: Application): BulletRelevanceHint[] {
  const jdTerms = jdTermSet(app);
  const hints: BulletRelevanceHint[] = [];
  for (const entry of profile.experience) {
    const bullets = entry.bullets.split("\n").map(b => b.trim()).filter(Boolean);
    for (const text of bullets) {
      const bulletTerms = tokenize(text);
      let overlap = 0;
      for (const t of bulletTerms) if (jdTerms.has(t)) overlap++;
      hints.push({ company: entry.company, text, keywordOverlap: overlap, toolBuilding: TOOL_BUILDING_PATTERN.test(text) });
    }
  }
  return hints;
}

export function renderRelevanceHintsBlock(hints: BulletRelevanceHint[]): string {
  if (hints.length === 0) return "";
  const lines = hints
    .map(h => `- [${h.company}] overlap=${h.keywordOverlap}${h.toolBuilding ? " TOOL-BUILDING" : ""} :: "${h.text}"`)
    .join("\n");
  return `DETERMINISTIC RELEVANCE HINTS (rough keyword-overlap count per bullet against this JD's extracted keywords/requirements/skills — NOT a ranking, do not sort by this number alone):
${lines}

HOW TO READ THESE HINTS — a bullet marked TOOL-BUILDING describes building a tool, platform, or system whose feature names happen to reuse the JD's vocabulary (e.g. "cost modeling engine", "schedule optimization platform"). A high overlap score on a TOOL-BUILDING bullet does NOT mean it is the most relevant proof point. Unless the JD's core ask IS building AI/software tools, a bullet that shows DIRECTLY DELIVERING the JD's core work (leading the actual capital program, making the actual recommendation, owning the actual deal) should outrank a TOOL-BUILDING bullet even when the tool-building bullet's overlap score is higher. Use the hints as a starting point, then apply judgment about direct delivery vs. tool-building before assigning "priority".`;
}
