// Maps the portfolio repo's own data shape (builds.ts/battles.ts, read via
// lib/portfolio-parser.ts) onto the CandidateExperience/CandidateProject/
// CandidateEducation shapes the existing non-destructive merge engine
// (lib/profile-merge.ts) already knows how to diff and review — this file
// is ONLY the adapter; diffing, review, and apply all reuse Feature 1/3's
// engine and UI verbatim, per the mapping rules given in the request.
//
// Field names for battles.ts/its education object are inferred from the
// request's description ("work history + education"), not read from the
// real repo (this app never executes fetched source — see
// lib/portfolio-parser.ts's header comment — and no live token/repo was
// available while building this). Each field is looked up under several
// plausible aliases and simply omitted if none match, which is always a
// SAFE degradation here: the merge engine treats every candidate field as
// optional, so an unrecognized key just means "nothing new proposed for
// that field," never a wrong value.

import { CandidateExperience, CandidateProject, CandidateEducation, textSimilarity, namesMatch } from "./profile-merge";
import { isQuantified } from "./profile-bullet-quality";
import { Profile, ProjectEntry } from "./profile";
import type { ParsedLiteral } from "./portfolio-parser";
import type { PortfolioBuildDraft } from "./schemas";

type PortfolioRecord = Record<string, ParsedLiteral>;

function str(v: ParsedLiteral | undefined): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function strArray(v: ParsedLiteral | undefined): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function pick(rec: PortfolioRecord, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = str(rec[k]);
    if (v) return v;
  }
  return undefined;
}

function pickArray(rec: PortfolioRecord, keys: string[]): string[] {
  for (const k of keys) {
    const v = strArray(rec[k]);
    if (v.length) return v;
  }
  return [];
}

// ---------------------------------------------------------------------------
// PULL: portfolio -> CareerOS candidates
// ---------------------------------------------------------------------------

export type PortfolioBuildReference = { name: string; calm?: string };

/**
 * Maps one Build record to a CandidateProject, per the mapping table:
 * name -> name, tags[] -> stack (comma-joined), punchline -> outcomes
 * (already outcome-shaped), github -> repoUrl, nerd (preferred) / process
 * (fallback) -> description. `calm` is deliberately NEVER read into any of
 * these fields — it's marketing copy the resume engine must never select
 * from; callers that want it for reference/logging use mapBuildReference.
 */
export function mapBuildToProject(build: PortfolioRecord): CandidateProject | null {
  const name = pick(build, ["name", "title"]);
  if (!name) return null;
  const tags = pickArray(build, ["tags"]);
  const description = pick(build, ["nerd", "process"]) ?? "";
  return {
    name,
    description,
    stack: tags.length ? tags.join(", ") : undefined,
    outcomes: pick(build, ["punchline"]),
    repoUrl: pick(build, ["github", "repo", "repoUrl"]),
  };
}

export function mapBuildReference(build: PortfolioRecord): PortfolioBuildReference | null {
  const name = pick(build, ["name", "title"]);
  if (!name) return null;
  return { name, calm: pick(build, ["calm"]) };
}

export function mapBuildsToProjects(builds: PortfolioRecord[]): CandidateProject[] {
  return builds.map(mapBuildToProject).filter((p): p is CandidateProject => p !== null);
}

/** Maps one battles.ts work-history record to a CandidateExperience. */
export function mapBattleToExperience(battle: PortfolioRecord): CandidateExperience | null {
  const company = pick(battle, ["company", "employer", "organization", "org"]);
  const role = pick(battle, ["role", "title", "position"]);
  if (!company || !role) return null;
  return {
    company,
    role,
    tenure: pick(battle, ["tenure", "period", "dates", "duration", "years"]) ?? "",
    location: pick(battle, ["location", "city"]),
    bullets: pickArray(battle, ["bullets", "highlights", "achievements", "points"]),
  };
}

export function mapBattlesToExperience(battles: PortfolioRecord[]): CandidateExperience[] {
  return battles.map(mapBattleToExperience).filter((e): e is CandidateExperience => e !== null);
}

/** Maps battles.ts's education object/array to CandidateEducation entries. */
export function mapPortfolioEducation(education: PortfolioRecord | PortfolioRecord[] | null): CandidateEducation[] {
  const records = Array.isArray(education) ? education : education ? [education] : [];
  const out: CandidateEducation[] = [];
  for (const rec of records) {
    const institution = pick(rec, ["institution", "school", "university"]);
    const degree = pick(rec, ["degree", "qualification"]);
    if (!institution || !degree) continue;
    out.push({
      institution,
      degree,
      field: pick(rec, ["field", "major", "specialization"]),
      years: pick(rec, ["years", "period", "dates"]) ?? "",
      gpa: pick(rec, ["gpa", "grade"]),
      achievements: pickArray(rec, ["achievements", "highlights"]),
    });
  }
  return out;
}

/**
 * Guards CandidateProject fields against overwriting an existing CareerOS
 * project's already-quantified content: if the matching existing project's
 * description/outcomes already contains real quantification (isQuantified),
 * the portfolio value for that SAME field is dropped from the candidate
 * before it ever reaches the diff engine — so diffProjects has nothing to
 * propose there, and the review UI never even shows a would-be overwrite.
 * Fields with no existing match, or where the existing field is empty/
 * unquantified, pass through untouched (still reviewed normally).
 */
export function guardAgainstOverwritingQuantified(candidates: CandidateProject[], existing: ProjectEntry[]): CandidateProject[] {
  return candidates.map(cand => {
    const match = existing.find(p => namesMatch(p.name, cand.name));
    if (!match) return cand;
    const guarded = { ...cand };
    if (match.description && isQuantified(match.description)) delete (guarded as any).description;
    if (match.outcomes && isQuantified(match.outcomes)) delete (guarded as any).outcomes;
    return guarded;
  });
}

export type PortfolioCandidates = {
  projects: CandidateProject[];
  experience: CandidateExperience[];
  education: CandidateEducation[];
  buildReferences: PortfolioBuildReference[];
};

/** Full pull-side mapping pass: raw parsed portfolio records -> guarded candidates ready for diffExtractionAgainstProfile. */
export function buildPortfolioCandidates(
  builds: PortfolioRecord[],
  battles: PortfolioRecord[],
  education: PortfolioRecord | PortfolioRecord[] | null,
  profile: Profile,
): PortfolioCandidates {
  const projects = guardAgainstOverwritingQuantified(mapBuildsToProjects(builds), profile.projects);
  return {
    projects,
    experience: mapBattlesToExperience(battles),
    education: mapPortfolioEducation(education),
    buildReferences: builds.map(mapBuildReference).filter((r): r is PortfolioBuildReference => r !== null),
  };
}

// ---------------------------------------------------------------------------
// PUSH: CareerOS -> portfolio (the actual portfolio-shaped fields; drafting
// the calm/nerd/process prose itself is an LLM step — see
// draftPortfolioBuildPrompt in lib/prompts.ts)
// ---------------------------------------------------------------------------

/**
 * Renders a drafted Build as the TS object-literal source inserted into
 * builds.ts. `github` is a fact from the CareerOS project record, not
 * something the LLM drafts (see draftPortfolioBuildPrompt in lib/prompts.ts).
 */
export function renderBuildLiteral(draft: PortfolioBuildDraft & { github: string }): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const tags = draft.tags.map(t => `"${esc(t)}"`).join(", ");
  return `  {
    name: "${esc(draft.name)}",
    tags: [${tags}],
    punchline: "${esc(draft.punchline)}",
    github: "${esc(draft.github)}",
    nerd: "${esc(draft.nerd)}",
    process: "${esc(draft.process)}",
    calm: "${esc(draft.calm)}",
  },
`;
}

/**
 * Inserts a new Build literal into the builds.ts source just before the
 * array's closing bracket — additive only, never touches existing entries.
 * Falls back to appending near the end of the file if the export can't be
 * located (defensive; should not happen against the real file).
 */
export function insertBuildIntoSource(source: string, draft: PortfolioBuildDraft & { github: string }): string {
  const literal = renderBuildLiteral(draft);
  const closingBracket = /\n(\s*)\];/g;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = closingBracket.exec(source)) !== null) lastMatch = m;
  if (!lastMatch) return `${source}\n${literal}`;
  const idx = lastMatch.index;
  return `${source.slice(0, idx)}\n${literal}${source.slice(idx)}`;
}

/** True if two project names are similar enough that pushing would be a near-duplicate of what's already on the portfolio (checked against buildReferences before offering to push). */
export function alreadyOnPortfolio(name: string, refs: PortfolioBuildReference[]): boolean {
  return refs.some(r => namesMatch(r.name, name) || textSimilarity(r.name, name) >= 0.6);
}
