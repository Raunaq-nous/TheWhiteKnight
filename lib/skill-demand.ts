// CAREER TRACKS AND SKILL DEMAND (v1). Pure and client-safe.
//   - normaliseSkill / extractSkillsByRules: skills in a JD, normalised to
//     config/skill-vocabulary.json so synonyms merge.
//   - classifyTrackByRules: a JD's career track (title first, then keywords).
//   - aggregateDemand: per-track demand over a rolling 90 days, with
//     "emerging" when a skill's share in the last 30 days rises against the
//     previous 60.
//   - rateSkillCoverage: strong / weak / none from bullet-level evidence,
//     the requirement map's definitions applied deterministically.
//   - seedPathwayFor: the seeded pathway (docs/CAREER-TRACKS.md) for a gap.
// JD text is data only: it is matched against a fixed vocabulary, never
// interpreted.

import vocabulary from "../config/skill-vocabulary.json";
import { CAREER_TRACKS, type CareerTrack, type SeedPathway, type TrackId } from "./career-tracks";
import { listProfileBullets } from "./profile-bullets";
import { impactDensity } from "./resume-bullet-relevance";
import type { Profile } from "./profile";
import type { Application } from "./store";
import profileRulesConfig from "../config/profile-rules.json";

export const DEMAND_WINDOW_DAYS = 90;
export const RECENT_WINDOW_DAYS = 30;
// Emerging: last-30-day share at least this multiple of the previous-60-day
// share, and seen in at least MIN_RECENT_JOBS recent jobs.
export const EMERGING_RATIO = 1.5;
export const MIN_RECENT_JOBS = 2;

const SKILLS: Record<string, string[]> = (vocabulary as { skills: Record<string, string[]> }).skills;

const clean = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/^[^a-z0-9]+|[^a-z0-9+#.]+$/g, "").replace(/\s+/g, " ").trim();

const ALIAS_TO_CANONICAL: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(SKILLS)) {
    m.set(clean(canonical), canonical);
    for (const a of aliases) m.set(clean(a), canonical);
  }
  return m;
})();

/** The canonical name for a skill phrase; unknown skills keep their own normalised name. */
export function normaliseSkill(raw: string): string {
  const c = clean(raw);
  if (!c) return "";
  return ALIAS_TO_CANONICAL.get(c) ?? ALIAS_TO_CANONICAL.get(c.replace(/s$/, "")) ?? c;
}

/** Normalised, de-duplicated skills (empty and over-long phrases dropped). */
export function normaliseSkills(raw: string[]): string[] {
  return [...new Set(raw.map(normaliseSkill).filter(s => s && s.length <= 60))];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERNS: [string, RegExp][] = Object.entries(SKILLS).map(([canonical, aliases]) => {
  const terms = [canonical, ...aliases].map(t => escape(t.toLowerCase())).sort((a, b) => b.length - a.length);
  return [canonical, new RegExp(`(?<![a-z0-9])(?:${terms.join("|")})(?![a-z0-9])`, "i")];
});

/** Vocabulary skills a JD mentions (deterministic; the model extraction adds skills outside the vocabulary). */
export function extractSkillsByRules(jdText: string): string[] {
  const text = jdText.replace(/<[^>]+>/g, " ");
  return PATTERNS.filter(([, re]) => re.test(text)).map(([c]) => c);
}

// ─── Track classification ────────────────────────────────────────────────

export type TrackScore = { id: TrackId; score: number };
export type TrackClassification = { id: TrackId; confidence: number; scores: TrackScore[]; ambiguous: boolean } | null;

const lc = (s: string | undefined | null) => (s ?? "").toLowerCase();

/** Rules: a title match counts 5 (the longest matching title wins ties), each keyword in the JD counts 1 (capped at 8). */
export function classifyTrackByRules(app: Pick<Application, "role" | "jdRaw"> & { jdParsed?: { keywords?: string[] } | null }): TrackClassification {
  const role = lc(app.role);
  const body = `${role} ${lc(app.jdRaw)} ${(app.jdParsed?.keywords ?? []).join(" ").toLowerCase()}`;
  const scores: TrackScore[] = CAREER_TRACKS.map(t => {
    const titleHit = t.titles.filter(ti => role.includes(ti.toLowerCase())).sort((a, b) => b.length - a.length)[0];
    const kw = t.keywords.filter(k => new RegExp(`(?<![a-z0-9])${escape(k.toLowerCase())}(?![a-z0-9])`).test(body)).length;
    return { id: t.id, score: (titleHit ? 5 + titleHit.length / 100 : 0) + Math.min(8, kw) };
  }).sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (!best || best.score <= 0) return null;
  const total = scores.reduce((n, s) => n + s.score, 0);
  return { id: best.id, confidence: Math.round((best.score / total) * 100) / 100, scores, ambiguous: !!second && second.score >= best.score * 0.8 };
}

// ─── Demand aggregation ─────────────────────────────────────────────────

export type DemandRow = {
  skill: string;
  count: number;          // jobs in the 90-day window mentioning it
  share: number;          // count / jobs in the window
  recentShare: number;    // share in the last 30 days
  previousShare: number;  // share in the 60 days before that
  emerging: boolean;
};

export type JobSkills = { trackId: string | null | undefined; skills: string[]; at: string };

export function jobSkillsFromApps(apps: Application[]): JobSkills[] {
  return apps
    .filter(a => a.skillDemand?.skills?.length)
    .map(a => ({ trackId: a.track?.id, skills: a.skillDemand!.skills, at: a.capturedAt || a.createdAt }));
}

/** Demand for one track over the rolling window, most demanded first. */
export function aggregateDemand(jobs: JobSkills[], trackId: string, now: Date): { jobs: number; recentJobs: number; rows: DemandRow[] } {
  const day = 86_400_000;
  const age = (at: string) => (now.getTime() - Date.parse(at)) / day;
  const inWindow = jobs.filter(j => j.trackId === trackId && Number.isFinite(Date.parse(j.at)) && age(j.at) >= 0 && age(j.at) <= DEMAND_WINDOW_DAYS);
  const recent = inWindow.filter(j => age(j.at) <= RECENT_WINDOW_DAYS);
  const previous = inWindow.filter(j => age(j.at) > RECENT_WINDOW_DAYS);
  const count = (list: JobSkills[], skill: string) => list.filter(j => j.skills.includes(skill)).length;
  const skills = [...new Set(inWindow.flatMap(j => j.skills))];
  const rows = skills.map(skill => {
    const c = count(inWindow, skill);
    const rc = count(recent, skill);
    const recentShare = recent.length ? rc / recent.length : 0;
    const previousShare = previous.length ? count(previous, skill) / previous.length : 0;
    const emerging = rc >= MIN_RECENT_JOBS && (previousShare === 0 ? previous.length > 0 : recentShare >= previousShare * EMERGING_RATIO);
    return { skill, count: c, share: inWindow.length ? c / inWindow.length : 0, recentShare, previousShare, emerging };
  }).sort((a, b) => b.count - a.count || Number(b.emerging) - Number(a.emerging) || a.skill.localeCompare(b.skill));
  return { jobs: inWindow.length, recentJobs: recent.length, rows };
}

// ─── Coverage ───────────────────────────────────────────────────────────

export type CoverageRating = "strong" | "weak" | "none";
export type SkillCoverage = { skill: string; rating: CoverageRating; evidence?: { company: string; bulletText: string; sourceBulletId: string } };

const EVIDENCE: Map<string, RegExp> = new Map(Object.entries((profileRulesConfig as { skillEvidencePatterns?: Record<string, string> }).skillEvidencePatterns ?? {}).map(([k, v]) => [normaliseSkill(k), new RegExp(v, "i")]));

function skillPattern(skill: string): RegExp {
  const canonical = normaliseSkill(skill);
  const fromVocab = PATTERNS.find(([c]) => c === canonical)?.[1];
  const fromEvidence = EVIDENCE.get(canonical);
  if (fromVocab && fromEvidence) return new RegExp(`${fromVocab.source}|${fromEvidence.source}`, "i");
  return fromEvidence ?? fromVocab ?? new RegExp(`(?<![a-z0-9])${escape(canonical)}(?![a-z0-9])`, "i");
}

/**
 * The requirement map's definitions, applied to bullets: "strong" when a
 * bullet directly evidences the skill with a real number or scope marker;
 * "weak" when the only evidence is unquantified; "none" when nothing in the
 * profile's experience addresses it. Evidence is the verbatim bullet.
 */
export function rateSkillCoverage(skill: string, profile: Profile): SkillCoverage {
  const re = skillPattern(skill);
  const hits = listProfileBullets(profile).filter(b => b.sourceType === "experience" && re.test(b.text));
  if (!hits.length) return { skill, rating: "none" };
  const quantified = hits.find(b => impactDensity(b.text) > 0);
  const best = quantified ?? hits[0];
  return { skill, rating: quantified ? "strong" : "weak", evidence: { company: best.sourceId, bulletText: best.text, sourceBulletId: best.id } };
}

// ─── Pathways ───────────────────────────────────────────────────────────

/** The seeded pathway for a skill on a track: listed in its `covers`, or a close name match. */
export function seedPathwayFor(track: CareerTrack, skill: string): SeedPathway | null {
  const canonical = normaliseSkill(skill);
  const byCover = track.pathways.find(p => (p.covers ?? []).map(normaliseSkill).includes(canonical));
  if (byCover) return byCover;
  const words = new Set(canonical.split(" ").filter(w => w.length > 2));
  return track.pathways.find(p => {
    const pw = normaliseSkill(p.skill).split(" ").filter(w => w.length > 2);
    const overlap = pw.filter(w => words.has(w)).length;
    return overlap > 0 && overlap / Math.max(pw.length, words.size) >= 0.5;
  }) ?? null;
}

/** Rules-only track and skills for an application being saved (no model call; autopilot adds the model). */
export function rulesAnnotation(app: Pick<Application, "role" | "jdRaw" | "jdParsed">): Pick<Application, "track" | "skillDemand"> {
  const c = classifyTrackByRules(app);
  const track = c ? CAREER_TRACKS.find(t => t.id === c.id)! : null;
  return {
    track: c && track ? { id: c.id, archetype: track.resumeArchetype, confidence: c.confidence, method: "rules" } : null,
    skillDemand: { skills: extractSkillsByRules(app.jdRaw ?? ""), method: "rules", extractedAt: new Date().toISOString() },
  };
}
