// Deterministic diff/merge engine for profile enrichment (Features 1 & 3).
// The LLM only EXTRACTS candidate entities from text; matching them against
// the existing profile and deciding add-vs-enrich-vs-nothing-to-do happens
// here, not in the model — this is what's actually testable and reliable.

import { Profile, ExperienceEntry, EducationEntry, ProjectEntry, Publication, Certification } from "./profile";

export type CandidateExperience = { company: string; role: string; tenure: string; location?: string | null; bullets: string[] };
export type CandidateEducation = { institution: string; degree: string; field?: string | null; years: string; gpa?: string | null; achievements?: string[] | null };
export type CandidateProject = { name: string; description: string; stack?: string | null; outcomes?: string | null; repoUrl?: string | null };
export type CandidatePublication = { title: string; publication: string; year: string; url?: string | null };
export type CandidateCertification = { name: string; issuer?: string | null; date?: string | null; relevance?: string | null };
export type CandidateSkillGroup = { category: string; items: string[] };

// Fields are nullable (not just optional) to match the zod schema the model
// output is validated against — models routinely emit null for an omitted
// optional field rather than dropping the key.
export type ExtractedProfileData = {
  experience?: CandidateExperience[] | null;
  education?: CandidateEducation[] | null;
  projects?: CandidateProject[] | null;
  publications?: CandidatePublication[] | null;
  certifications?: CandidateCertification[] | null;
  skills?: CandidateSkillGroup[] | null;
};

export type MergeEntityType = "experience" | "education" | "project" | "publication" | "certification" | "skill";
export type MergeAction = "add" | "enrich";

export type MergeDiffItem = {
  id: string;
  entityType: MergeEntityType;
  action: MergeAction;
  /** Existing entry this enriches (label only, e.g. company/institution name). Undefined for "add". */
  targetLabel?: string;
  /** Human-readable one-line summary for the review UI. */
  summary: string;
  /** What will actually be added — new bullets, new skill items, filled-in fields, or the whole new entry. */
  preview: string;
  /** Opaque payload consumed by applyMergeDiffItem — not meant to be read by the UI. */
  payload: unknown;
};

// ---------------------------------------------------------------------------
// Normalization + matching (mirrors app/api/contacts/search/route.ts's
// normalizeCompany/companyMatches, generalized for any entity name).
// ---------------------------------------------------------------------------

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\binc\.?\b|\bllc\.?\b|\bltd\.?\b|\bcorp\.?\b|\bco\.?\b|\bplc\.?\b|\bgroup\b/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2)
  );
}

/** Jaccard similarity on word sets — catches near-duplicate bullets with different phrasing. */
function textSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const BULLET_DUPLICATE_THRESHOLD = 0.6;

function splitBullets(s: string): string[] {
  return s.split("\n").map(b => b.trim()).filter(Boolean);
}

function isNewBullet(candidate: string, existingBullets: string[]): boolean {
  return !existingBullets.some(b => textSimilarity(b, candidate) >= BULLET_DUPLICATE_THRESHOLD);
}

let idCounter = 0;
function nextDiffId(): string {
  idCounter += 1;
  return `diff-${Date.now()}-${idCounter}`;
}

// ---------------------------------------------------------------------------
// Per-entity-type diffing
// ---------------------------------------------------------------------------

function diffExperience(candidates: CandidateExperience[], existing: ExperienceEntry[]): MergeDiffItem[] {
  const items: MergeDiffItem[] = [];
  for (const cand of candidates) {
    const match = existing.find(e => namesMatch(e.company, cand.company));
    if (!match) {
      items.push({
        id: nextDiffId(),
        entityType: "experience",
        action: "add",
        summary: `Add role: ${cand.role} at ${cand.company}`,
        preview: `${cand.role} | ${cand.company} | ${cand.tenure}\n${cand.bullets.map(b => `- ${b}`).join("\n")}`,
        payload: cand,
      });
      continue;
    }
    const existingBullets = splitBullets(match.bullets);
    const newBullets = cand.bullets.filter(b => isNewBullet(b, existingBullets));
    if (newBullets.length === 0) continue; // nothing new — silently skip
    items.push({
      id: nextDiffId(),
      entityType: "experience",
      action: "enrich",
      targetLabel: match.company,
      summary: `Add ${newBullets.length} bullet${newBullets.length === 1 ? "" : "s"} to ${match.role} at ${match.company}`,
      preview: newBullets.map(b => `+ ${b}`).join("\n"),
      payload: { experienceId: match.id, newBullets },
    });
  }
  return items;
}

function diffEducation(candidates: CandidateEducation[], existing: EducationEntry[]): MergeDiffItem[] {
  const items: MergeDiffItem[] = [];
  for (const cand of candidates) {
    const match = existing.find(e => namesMatch(e.institution, cand.institution));
    if (!match) {
      items.push({
        id: nextDiffId(),
        entityType: "education",
        action: "add",
        summary: `Add education: ${cand.degree} at ${cand.institution}`,
        preview: `${cand.degree}${cand.field ? ` in ${cand.field}` : ""} | ${cand.institution} | ${cand.years}`,
        payload: cand,
      });
      continue;
    }
    const fills: Partial<EducationEntry> = {};
    if (!match.gpa && cand.gpa) fills.gpa = cand.gpa;
    const existingAch = match.achievements ? splitBullets(match.achievements) : [];
    const newAch = (cand.achievements ?? []).filter(a => isNewBullet(a, existingAch));
    if (Object.keys(fills).length === 0 && newAch.length === 0) continue;
    const previewParts: string[] = [];
    if (fills.gpa) previewParts.push(`GPA: ${fills.gpa}`);
    if (newAch.length) previewParts.push(...newAch.map(a => `+ ${a}`));
    items.push({
      id: nextDiffId(),
      entityType: "education",
      action: "enrich",
      targetLabel: match.institution,
      summary: `Enrich education: ${match.institution}`,
      preview: previewParts.join("\n"),
      payload: { educationId: match.id, fills, newAchievements: newAch },
    });
  }
  return items;
}

function diffProjects(candidates: CandidateProject[], existing: ProjectEntry[]): MergeDiffItem[] {
  const items: MergeDiffItem[] = [];
  for (const cand of candidates) {
    const match = existing.find(p => namesMatch(p.name, cand.name));
    if (!match) {
      items.push({
        id: nextDiffId(),
        entityType: "project",
        action: "add",
        summary: `Add project: ${cand.name}`,
        preview: `${cand.name}: ${cand.description}`,
        payload: cand,
      });
      continue;
    }
    const fills: Partial<ProjectEntry> = {};
    if (!match.outcomes && cand.outcomes) fills.outcomes = cand.outcomes;
    if (!match.repoUrl && cand.repoUrl) fills.repoUrl = cand.repoUrl;
    if (textSimilarity(match.description, cand.description) < BULLET_DUPLICATE_THRESHOLD && cand.description.length > match.description.length) {
      fills.description = cand.description;
    }
    if (Object.keys(fills).length === 0) continue;
    items.push({
      id: nextDiffId(),
      entityType: "project",
      action: "enrich",
      targetLabel: match.name,
      summary: `Enrich project: ${match.name}`,
      preview: Object.entries(fills).map(([k, v]) => `${k}: ${v}`).join("\n"),
      payload: { projectId: match.id, fills },
    });
  }
  return items;
}

function diffPublications(candidates: CandidatePublication[], existing: Publication[]): MergeDiffItem[] {
  const items: MergeDiffItem[] = [];
  for (const cand of candidates) {
    const match = existing.find(p => namesMatch(p.title, cand.title));
    if (match) continue; // publications are immutable facts — nothing to enrich, just skip duplicates
    items.push({
      id: nextDiffId(),
      entityType: "publication",
      action: "add",
      summary: `Add publication: ${cand.title}`,
      preview: `${cand.title} — ${cand.publication} (${cand.year})`,
      payload: cand,
    });
  }
  return items;
}

function diffCertifications(candidates: CandidateCertification[], existing: Certification[]): MergeDiffItem[] {
  const items: MergeDiffItem[] = [];
  for (const cand of candidates) {
    const match = existing.find(c => namesMatch(c.name, cand.name));
    if (!match) {
      items.push({
        id: nextDiffId(),
        entityType: "certification",
        action: "add",
        summary: `Add certification: ${cand.name}`,
        preview: `${cand.name}${cand.issuer ? ` — ${cand.issuer}` : ""}${cand.date ? ` (${cand.date})` : ""}`,
        payload: cand,
      });
      continue;
    }
    const fills: Partial<Certification> = {};
    if (!match.issuer && cand.issuer) fills.issuer = cand.issuer;
    if (!match.relevance && cand.relevance) fills.relevance = cand.relevance;
    if (Object.keys(fills).length === 0) continue;
    items.push({
      id: nextDiffId(),
      entityType: "certification",
      action: "enrich",
      targetLabel: match.name,
      summary: `Enrich certification: ${match.name}`,
      preview: Object.entries(fills).map(([k, v]) => `${k}: ${v}`).join("\n"),
      payload: { certificationId: match.id, fills },
    });
  }
  return items;
}

function diffSkills(candidates: CandidateSkillGroup[], existing: Record<string, string>): MergeDiffItem[] {
  const items: MergeDiffItem[] = [];
  const existingCategoryKeys = Object.keys(existing);
  for (const cand of candidates) {
    const matchKey = existingCategoryKeys.find(k => namesMatch(k, cand.category));
    const existingItems = matchKey
      ? existing[matchKey].split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];
    const newItems = cand.items.filter(item => !existingItems.includes(item.trim().toLowerCase()));
    if (newItems.length === 0) continue;
    items.push({
      id: nextDiffId(),
      entityType: "skill",
      action: matchKey ? "enrich" : "add",
      targetLabel: matchKey ?? cand.category,
      summary: matchKey
        ? `Add ${newItems.length} skill${newItems.length === 1 ? "" : "s"} to "${matchKey}"`
        : `Add new skill category "${cand.category}"`,
      preview: newItems.join(", "),
      payload: { category: matchKey ?? cand.category, newItems, isNewCategory: !matchKey },
    });
  }
  return items;
}

/**
 * Diff LLM-extracted candidate entities against the current profile.
 * Returns only items with something genuinely new to review — matches with
 * nothing new are silently dropped, never shown as noise.
 */
export function diffExtractionAgainstProfile(extracted: ExtractedProfileData, profile: Profile): MergeDiffItem[] {
  return [
    ...diffExperience(extracted.experience ?? [], profile.experience),
    ...diffEducation(extracted.education ?? [], profile.education),
    ...diffProjects(extracted.projects ?? [], profile.projects),
    ...diffPublications(extracted.publications ?? [], profile.publications),
    ...diffCertifications(extracted.certifications ?? [], profile.certifications),
    ...diffSkills(extracted.skills ?? [], profile.skills),
  ];
}

// ---------------------------------------------------------------------------
// Apply — non-destructive: only adds new entries/fields, never overwrites
// or removes existing non-empty data.
// ---------------------------------------------------------------------------

function nanoid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function applyMergeDiffItem(profile: Profile, item: MergeDiffItem): Profile {
  switch (item.entityType) {
    case "experience": {
      if (item.action === "add") {
        const cand = item.payload as CandidateExperience;
        const entry: ExperienceEntry = {
          id: nanoid(), company: cand.company, role: cand.role, tenure: cand.tenure,
          location: cand.location ?? "", current: false, bullets: cand.bullets.join("\n"),
        };
        return { ...profile, experience: [...profile.experience, entry] };
      }
      const { experienceId, newBullets } = item.payload as { experienceId: string; newBullets: string[] };
      return {
        ...profile,
        experience: profile.experience.map(e =>
          e.id === experienceId
            ? { ...e, bullets: [...splitBullets(e.bullets), ...newBullets].join("\n") }
            : e
        ),
      };
    }
    case "education": {
      if (item.action === "add") {
        const cand = item.payload as CandidateEducation;
        const entry: EducationEntry = {
          id: nanoid(), institution: cand.institution, degree: cand.degree, field: cand.field ?? "",
          years: cand.years, gpa: cand.gpa ?? undefined, achievements: cand.achievements?.join("\n"),
        };
        return { ...profile, education: [...profile.education, entry] };
      }
      const { educationId, fills, newAchievements } = item.payload as { educationId: string; fills: Partial<EducationEntry>; newAchievements: string[] };
      return {
        ...profile,
        education: profile.education.map(e => {
          if (e.id !== educationId) return e;
          const merged = { ...e, ...fills };
          if (newAchievements.length > 0) {
            merged.achievements = [...(e.achievements ? splitBullets(e.achievements) : []), ...newAchievements].join("\n");
          }
          return merged;
        }),
      };
    }
    case "project": {
      if (item.action === "add") {
        const cand = item.payload as CandidateProject;
        const entry: ProjectEntry = {
          id: nanoid(), name: cand.name, description: cand.description,
          stack: cand.stack ?? "", outcomes: cand.outcomes ?? "", repoUrl: cand.repoUrl ?? undefined,
        };
        return { ...profile, projects: [...profile.projects, entry] };
      }
      const { projectId, fills } = item.payload as { projectId: string; fills: Partial<ProjectEntry> };
      return {
        ...profile,
        projects: profile.projects.map(p => (p.id === projectId ? { ...p, ...fills } : p)),
      };
    }
    case "publication": {
      const cand = item.payload as CandidatePublication;
      const entry: Publication = { id: nanoid(), title: cand.title, publication: cand.publication, year: cand.year, url: cand.url ?? undefined };
      return { ...profile, publications: [...profile.publications, entry] };
    }
    case "certification": {
      if (item.action === "add") {
        const cand = item.payload as CandidateCertification;
        const entry: Certification = {
          id: nanoid(), name: cand.name, issuer: cand.issuer ?? "", date: cand.date ?? "", relevance: cand.relevance ?? undefined,
        };
        return { ...profile, certifications: [...profile.certifications, entry] };
      }
      const { certificationId, fills } = item.payload as { certificationId: string; fills: Partial<Certification> };
      return {
        ...profile,
        certifications: profile.certifications.map(c => (c.id === certificationId ? { ...c, ...fills } : c)),
      };
    }
    case "skill": {
      const { category, newItems, isNewCategory } = item.payload as { category: string; newItems: string[]; isNewCategory: boolean };
      if (isNewCategory) {
        return { ...profile, skills: { ...profile.skills, [category]: newItems.join(", ") } };
      }
      const current = profile.skills[category] ?? "";
      const currentItems = current.split(",").map(s => s.trim()).filter(Boolean);
      return { ...profile, skills: { ...profile.skills, [category]: [...currentItems, ...newItems].join(", ") } };
    }
  }
}
