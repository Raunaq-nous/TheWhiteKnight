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

export const ResumeContentSchema = z.object({
  name: z.string(),
  contactLine: z.string().describe("Pre-formatted contact line: email | phone | location | LinkedIn | GitHub | Portfolio, omitting any not provided"),
  summary: z.string(),
  sectionOrder: z.enum(["education-first", "experience-first"]),
  experience: z.array(ResumeExperienceEntrySchema),
  education: z.array(ResumeEducationEntrySchema),
  skills: z.array(ResumeSkillGroupSchema),
  projects: z.array(ResumeProjectSchema).nullable().optional(),
  certifications: z.array(ResumeCertificationSchema).nullable().optional(),
  leadership: z.array(z.string()).nullable().optional().describe("Leadership & Activities bullets — consulting archetype only"),
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
  };
}

// Flatten a ResumeContent back to plain text — used for the .md/.txt download
// and as a fallback for resumes generated before this schema existed.
export function resumeContentToMarkdown(r: ResumeContent): string {
  const lines: string[] = [];
  lines.push(`# ${r.name}`);
  lines.push(r.contactLine);
  lines.push("");
  lines.push("## Summary");
  lines.push(r.summary);
  lines.push("");

  const experienceBlock = () => {
    lines.push("## Experience");
    for (const e of r.experience) {
      lines.push(`### ${e.role} | ${e.company} | ${e.tenure}${e.location ? ` | ${e.location}` : ""}`);
      for (const b of [...e.bullets].sort((a, b) => a.priority - b.priority)) {
        lines.push(`- ${b.text}`);
      }
    }
    lines.push("");
  };

  const educationBlock = () => {
    lines.push("## Education");
    for (const ed of r.education) {
      let line = `${ed.degree}${ed.field ? ` in ${ed.field}` : ""} | ${ed.institution} | ${ed.years}`;
      if (ed.gpa) line += ` | GPA: ${ed.gpa}`;
      lines.push(line);
      for (const a of ed.achievements ?? []) lines.push(`  - ${a}`);
    }
    lines.push("");
  };

  if (r.sectionOrder === "education-first") { educationBlock(); experienceBlock(); }
  else { experienceBlock(); educationBlock(); }

  if (r.projects?.length) {
    lines.push("## Projects");
    for (const p of r.projects) lines.push(`- ${p.name}: ${p.description}${p.repoUrl ? ` (${p.repoUrl})` : ""}`);
    lines.push("");
  }

  lines.push("## Skills");
  for (const g of r.skills) lines.push(`**${g.category}:** ${g.items.join(", ")}`);

  if (r.leadership?.length) {
    lines.push("");
    lines.push("## Leadership & Activities");
    for (const l of r.leadership) lines.push(`- ${l}`);
  }

  if (r.certifications?.length) {
    lines.push("");
    lines.push("## Certifications");
    for (const c of r.certifications) lines.push(`- ${c.name}${c.issuer ? ` — ${c.issuer}` : ""}${c.date ? ` (${c.date})` : ""}`);
  }

  return lines.join("\n").trim();
}
