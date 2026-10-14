// EDUCATION (spec Part 5): each degree line, plus the spec's compressed
// satellite line under its institution (config educationNotes), plus ONE
// line for the Economic Times and Dataquest publications (config
// resumePublicationVenues, read from the profile's publications). Nothing
// more: model-written achievements are discarded.

import type { Profile } from "./profile";
import type { ResumeEducationEntry } from "./resume-schema";
import { namesMatch } from "./profile-merge";
import profileRulesConfig from "../config/profile-rules.json";

const cfg = profileRulesConfig as { educationNotes?: Record<string, string>; resumePublicationVenues?: string[] };

function noteFor(institution: string): string | null {
  const key = Object.keys(cfg.educationNotes ?? {}).find(k => namesMatch(k, institution) || institution.toLowerCase().includes(k.toLowerCase()));
  return key ? cfg.educationNotes![key] : null;
}

/** "Publications: AI's impact on green manufacturing (Economic Times, 2024); Digital governance (Dataquest, 2025)" from the profile, or null. */
export function publicationsLine(profile: Pick<Profile, "publications">): string | null {
  const venues = (cfg.resumePublicationVenues ?? []).map(v => v.toLowerCase());
  const pubs = (profile.publications ?? []).filter(p => venues.some(v => (p.publication ?? "").toLowerCase().includes(v)));
  if (pubs.length === 0) return null;
  return `Publications: ${pubs.map(p => `${p.title} (${p.publication}${p.year ? `, ${p.year}` : ""})`).join("; ")}`;
}

export function finalizeEducation(education: ResumeEducationEntry[], profile: Pick<Profile, "publications">): ResumeEducationEntry[] {
  const pubs = publicationsLine(profile);
  return education.map((ed, i) => {
    const lines = [noteFor(ed.institution), i === 0 ? pubs : null].filter((x): x is string => Boolean(x));
    return { ...ed, achievements: lines.length ? lines : null };
  });
}
