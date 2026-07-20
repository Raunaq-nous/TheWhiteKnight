// Structured resume content — replaces free-form markdown so the render layer
// and the one-page fit loop can programmatically rank, trim, and lay out real
// data instead of parsing/guessing at generated text.

import { z } from "zod";
import { normalizeTextForATS } from "./ats";

export const ResumeBulletSchema = z.object({
  text: z.string(),
  // 1 = most relevant to this JD / keep at all costs. Higher = cut first when
  // the rendered page overflows. The model ranks these; the fit loop trims them.
  priority: z.number().int().min(1),
});

// NOTE ON .nullable().optional(): every optional field below is marked both
// nullable AND optional. Models routinely emit an explicit `null` for a field
// they're told is optional (rather than omitting the key), and .optional()
// alone only tolerates a missing/undefined key, not a literal null — that
// mismatch is exactly what caused the "expected string, received null" bug.
// All consuming code already uses `?.`/`&&` truthiness checks, which treat
// null and undefined identically, so no downstream changes were needed.

export const ResumeExperienceEntrySchema = z.object({
  company: z.string(),
  role: z.string(),
  tenure: z.string(),
  location: z.string().nullable().optional(),
  bullets: z.array(ResumeBulletSchema),
});

export const ResumeEducationEntrySchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string().nullable().optional(),
  years: z.string(),
  gpa: z.string().nullable().optional(),
  achievements: z.array(z.string()).nullable().optional(),
});

export const ResumeSkillGroupSchema = z.object({
  category: z.string(),
  items: z.array(z.string()),
});

export const ResumeProjectSchema = z.object({
  name: z.string(),
  description: z.string(),
  repoUrl: z.string().nullable().optional(),
});

export const ResumeCertificationSchema = z.object({
  name: z.string(),
  issuer: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});

export const ResumeLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

// Renderable sections, in no particular order — the per-archetype
// sectionSequence in lib/resume-archetype.ts decides the actual order.
// "selectedImpact" renders keyWins + projects data COMBINED under one
// heading — used instead of placing "keyWins"/"projects" separately in a
// sequence, so an archetype never ends up with two adjacent impact
// sections. Those two keys remain valid (data still lives in the keyWins/
// projects fields, and archetypes like product/ai_ml_engineering still
// place "projects" standalone without a combined band).
export const RESUME_SECTION_KEYS = [
  "summary", "keyWins", "projects", "selectedImpact", "experience", "education", "skills", "leadership", "certifications",
] as const;
export const ResumeSectionKeySchema = z.enum(RESUME_SECTION_KEYS);
export type ResumeSectionKey = z.infer<typeof ResumeSectionKeySchema>;

export const ResumeContentSchema = z.object({
  name: z.string(),
  contactLine: z.string().describe("Pre-formatted contact line: email | phone ONLY — never location or 'open to' preferences, and links go in the links array, not here"),
  links: z.array(ResumeLinkSchema).nullable().optional().describe("Header hyperlinks (LinkedIn, Portfolio, GitHub) rendered as real <a> tags"),
  summary: z.string(),
  targetPriorities: z.array(z.string()).nullable().optional().describe("The 3-5 things the target JD most values, extracted before writing — drives selection and framing"),
  subFocus: z.string().nullable().optional().describe("The specific sub-focus/practice-area of THIS role within its archetype, e.g. 'Capital Excellence — capital project delivery, cost/schedule optimization' vs 'Performance Improvement — operational turnaround, cost reduction'. Drives which wins/projects get foregrounded."),
  keyWins: z.array(z.string()).nullable().optional().describe("3-4 highest-impact quantified achievements pulled from across all experience — archetypes that include a Key Wins band"),
  sectionOrder: z.enum(["education-first", "experience-first"]),
  sectionSequence: z.array(ResumeSectionKeySchema).nullable().optional().describe("Injected deterministically from the archetype spec server-side — never model output"),
  experience: z.array(ResumeExperienceEntrySchema),
  education: z.array(ResumeEducationEntrySchema),
  skills: z.array(ResumeSkillGroupSchema),
  projects: z.array(ResumeProjectSchema).nullable().optional(),
  certifications: z.array(ResumeCertificationSchema).nullable().optional(),
  leadership: z.array(z.string()).nullable().optional().describe("Leadership & Activities bullets — kept for backward compatibility with earlier consulting resumes"),
});

export type ResumeBullet = z.infer<typeof ResumeBulletSchema>;
export type ResumeExperienceEntry = z.infer<typeof ResumeExperienceEntrySchema>;
export type ResumeEducationEntry = z.infer<typeof ResumeEducationEntrySchema>;
export type ResumeSkillGroup = z.infer<typeof ResumeSkillGroupSchema>;
export type ResumeProject = z.infer<typeof ResumeProjectSchema>;
export type ResumeCertification = z.infer<typeof ResumeCertificationSchema>;
export type ResumeContent = z.infer<typeof ResumeContentSchema>;

// Recursively strip em/en dashes, smart quotes, and fancy bullets from every
// string field — the prompt asks the model not to use them, but this is the
// deterministic backstop, same role normalizeTextForATS plays for plain text.
export function normalizeResumeContent(content: ResumeContent): ResumeContent {
  const clean = (s: string) => normalizeTextForATS(s);
  return {
    ...content,
    name: clean(content.name),
    contactLine: clean(content.contactLine),
    summary: clean(content.summary),
    experience: content.experience.map(e => ({
      ...e,
      company: clean(e.company),
      role: clean(e.role),
      tenure: clean(e.tenure),
      location: e.location ? clean(e.location) : e.location,
      bullets: e.bullets.map(b => ({ ...b, text: clean(b.text) })),
    })),
    education: content.education.map(ed => ({
      ...ed,
      institution: clean(ed.institution),
      degree: clean(ed.degree),
      field: ed.field ? clean(ed.field) : ed.field,
      years: clean(ed.years),
      achievements: ed.achievements?.map(clean),
    })),
    skills: content.skills.map(g => ({ ...g, category: clean(g.category), items: g.items.map(clean) })),
    projects: content.projects?.map(p => ({ ...p, name: clean(p.name), description: clean(p.description) })),
    certifications: content.certifications?.map(c => ({ ...c, name: clean(c.name) })),
    leadership: content.leadership?.map(clean),
    links: content.links?.map(l => ({ ...l, label: clean(l.label), url: l.url.trim() })),
    keyWins: content.keyWins?.map(clean),
    targetPriorities: content.targetPriorities?.map(clean),
    subFocus: content.subFocus ? clean(content.subFocus) : content.subFocus,
  };
}

// Legacy fallbacks for content saved before sectionSequence existed —
// mirrors the pre-sequence renderer's hardcoded order.
const LEGACY_EDU_FIRST: ResumeSectionKey[] = ["summary", "education", "experience", "projects", "skills", "leadership", "certifications"];
const LEGACY_EXP_FIRST: ResumeSectionKey[] = ["summary", "experience", "education", "projects", "skills", "leadership", "certifications"];

/**
 * The definitive render order for a resume: the archetype-injected
 * sectionSequence when present, else a legacy order from sectionOrder.
 * Any content-bearing section a sequence omits is appended at the end so
 * saved data is never silently dropped from the render.
 */
export function resolveSectionSequence(r: ResumeContent): ResumeSectionKey[] {
  const base = r.sectionSequence?.length
    ? [...r.sectionSequence]
    : [...(r.sectionOrder === "education-first" ? LEGACY_EDU_FIRST : LEGACY_EXP_FIRST)];

  // "selectedImpact" already renders keyWins + projects data combined —
  // never auto-append them standalone too, or the same data would render
  // twice (once combined, once as separate "## Key Wins"/"## Relevant
  // Projects" sections).
  const skip = base.includes("selectedImpact") ? new Set<ResumeSectionKey>(["keyWins", "projects"]) : new Set<ResumeSectionKey>();

  for (const key of RESUME_SECTION_KEYS) {
    if (!base.includes(key) && !skip.has(key)) base.push(key);
  }
  return base;
}

// Flatten a ResumeContent back to plain text — used for the .md/.txt download
// and as a fallback for resumes generated before this schema existed.
// Sections render in the same resolved order the visual document uses.
export function resumeContentToMarkdown(r: ResumeContent): string {
  const lines: string[] = [];
  lines.push(`# ${r.name}`);
  lines.push(r.contactLine);
  if (r.links?.length) {
    lines.push(r.links.map(l => `[${l.label}](${l.url})`).join(" | "));
  }
  lines.push("");

  const blocks: Record<ResumeSectionKey, () => void> = {
    summary: () => {
      if (!r.summary?.trim()) return;
      lines.push("## Summary", r.summary, "");
    },
    keyWins: () => {
      if (!r.keyWins?.length) return;
      lines.push("## Key Wins");
      for (const w of r.keyWins) lines.push(`- ${w}`);
      lines.push("");
    },
    projects: () => {
      if (!r.projects?.length) return;
      lines.push("## Relevant Projects");
      for (const p of r.projects) lines.push(`- ${p.name}: ${p.description}${p.repoUrl ? ` (${p.repoUrl})` : ""}`);
      lines.push("");
    },
    // Combined band — never render keyWins/projects as separate sections
    // when this key is in the sequence.
    selectedImpact: () => {
      if (!r.keyWins?.length && !r.projects?.length) return;
      lines.push("## Key Wins & Projects");
      for (const w of r.keyWins ?? []) lines.push(`- ${w}`);
      for (const p of r.projects ?? []) lines.push(`- ${p.name}: ${p.description}${p.repoUrl ? ` (${p.repoUrl})` : ""}`);
      lines.push("");
    },
    experience: () => {
      lines.push("## Experience");
      for (const e of r.experience) {
        lines.push(`### ${e.company} | ${e.role} | ${e.tenure}${e.location ? ` | ${e.location}` : ""}`);
        for (const b of [...e.bullets].sort((a, b) => a.priority - b.priority)) {
          lines.push(`- ${b.text}`);
        }
      }
      lines.push("");
    },
    education: () => {
      if (r.education.length === 0) return;
      lines.push("## Education");
      for (const ed of r.education) {
        let line = `${ed.degree}${ed.field ? ` in ${ed.field}` : ""} | ${ed.institution} | ${ed.years}`;
        if (ed.gpa) line += ` | GPA: ${ed.gpa}`;
        lines.push(line);
        for (const a of ed.achievements ?? []) lines.push(`  - ${a}`);
      }
      lines.push("");
    },
    skills: () => {
      if (r.skills.length === 0) return;
      lines.push("## Skills");
      for (const g of r.skills) lines.push(`**${g.category}:** ${g.items.join(", ")}`);
      lines.push("");
    },
    leadership: () => {
      if (!r.leadership?.length) return;
      lines.push("## Leadership & Activities");
      for (const l of r.leadership) lines.push(`- ${l}`);
      lines.push("");
    },
    certifications: () => {
      if (!r.certifications?.length) return;
      lines.push("## Certifications");
      for (const c of r.certifications) lines.push(`- ${c.name}${c.issuer ? ` — ${c.issuer}` : ""}${c.date ? ` (${c.date})` : ""}`);
      lines.push("");
    },
  };

  for (const key of resolveSectionSequence(r)) blocks[key]();

  return lines.join("\n").trim();
}
