// SKILLS (spec Parts 6 and 8): at most two rows of at most six items each,
// only skills that match the JD's requirements, drawn only from the spec
// taxonomy (config skillsTaxonomy). The Technical row appears only for a
// technical role; the AI row only for an AI-related or technical JD.
// Generic filler ("Strategic Initiatives", "Business Development",
// "Data Analysis") never appears. Every listed skill must be EVIDENCED by
// at least one selected bullet (config skillEvidencePatterns, else most of
// its words in the bullet); an unevidenced skill is dropped.

import type { ResumeSkillGroup } from "./resume-schema";
import { tokens } from "./resume-jd";
import profileRulesConfig from "../config/profile-rules.json";

export const SKILLS_MAX_ROWS = 2;
export const SKILLS_MAX_ITEMS = 6;

const cfg = profileRulesConfig as { skillsTaxonomy?: Record<string, string[]>; skillsFiller?: string[]; skillEvidencePatterns?: Record<string, string> };
const EVIDENCE: Map<string, RegExp> = new Map(Object.entries(cfg.skillEvidencePatterns ?? {}).map(([k, v]) => [k.toLowerCase(), new RegExp(v, "i")]));
export const SKILLS_TAXONOMY: Record<string, string[]> = cfg.skillsTaxonomy ?? {};
const FILLER = new Set((cfg.skillsFiller ?? []).map(s => s.toLowerCase()));
const TECHNICAL_ROW = "Technical";
const AI_ROW = "AI and technology";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();

/** A taxonomy item matches the JD when most of its meaningful words appear in the JD's requirement terms. */
function matchesJd(item: string, jdTerms: Set<string>): number {
  const t = [...tokens(item)];
  if (t.length === 0) return 0;
  const hit = t.filter(x => jdTerms.has(x) || jdTerms.has(x.replace(/s$/, ""))).length;
  return hit / t.length >= 0.5 ? hit : 0;
}

export type EvidenceBullet = { sourceBulletId: string; text: string };
export type SkillEvidence = { skill: string; sourceBulletId: string };

/** The first selected bullet that evidences `skill`, or null. */
export function evidenceFor(skill: string, bullets: EvidenceBullet[]): string | null {
  const pattern = EVIDENCE.get(skill.toLowerCase());
  const words = [...tokens(skill)];
  for (const b of bullets) {
    if (pattern ? pattern.test(b.text) : words.length > 0 && words.filter(w => tokens(b.text).has(w)).length / words.length >= 0.5) {
      return b.sourceBulletId;
    }
  }
  return null;
}

/** Each listed skill with the bullet id that evidences it (null when none does). */
export function skillEvidence(groups: ResumeSkillGroup[], bullets: EvidenceBullet[]): { skill: string; sourceBulletId: string | null }[] {
  return groups.flatMap(g => g.items.map(skill => ({ skill, sourceBulletId: evidenceFor(skill, bullets) })));
}

/** Drops every skill no selected bullet evidences, and any row left empty. */
export function keepEvidencedSkills(groups: ResumeSkillGroup[], bullets: EvidenceBullet[]): ResumeSkillGroup[] {
  return groups
    .map(g => ({ ...g, items: g.items.filter(item => evidenceFor(item, bullets) !== null) }))
    .filter(g => g.items.length > 0);
}

export type SkillsContext = { jdTerms: Set<string>; aiJd: boolean; technicalJd: boolean; bullets?: EvidenceBullet[] };

/**
 * The resume's skills rows. The model's picks count only when they are
 * taxonomy items; JD-matching taxonomy items fill the rest of a row. Rows
 * with the most matched items win, up to two.
 */
export function selectResumeSkills(modelSkills: ResumeSkillGroup[], ctx: SkillsContext): ResumeSkillGroup[] {
  const picked = new Set(modelSkills.flatMap(g => g.items).map(norm));
  const rows: { category: string; items: string[]; order: number }[] = [];
  Object.entries(SKILLS_TAXONOMY).forEach(([category, items], order) => {
    if (category === TECHNICAL_ROW && !ctx.technicalJd) return;
    if (category === AI_ROW && !ctx.aiJd && !ctx.technicalJd) return;
    const scored = items
      .filter(item => !FILLER.has(item.toLowerCase()))
      .map((item, i) => ({ item, i, model: picked.has(norm(item)), jd: matchesJd(item, ctx.jdTerms) }))
      .filter(x => x.model || x.jd > 0)
      // Evidenced by a selected bullet, when the bullets are known.
      .filter(x => !ctx.bullets || evidenceFor(x.item, ctx.bullets) !== null)
      .sort((a, b) => Number(b.model) - Number(a.model) || b.jd - a.jd || a.i - b.i)
      .slice(0, SKILLS_MAX_ITEMS)
      .map(x => x.item);
    if (scored.length) rows.push({ category, items: scored, order });
  });
  return rows
    .sort((a, b) => b.items.length - a.items.length || a.order - b.order)
    .slice(0, SKILLS_MAX_ROWS)
    .sort((a, b) => a.order - b.order)
    .map(({ category, items }) => ({ category, items }));
}
