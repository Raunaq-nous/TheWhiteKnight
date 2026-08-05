// Client-side wrappers for the profile enrichment API surface (Features 1-3,
// plus the job-scoped gap-fill flow). All AI calls go through server routes
// so API keys stay server-side.

import { Profile } from "./profile";
import type { Application } from "./store";
import { getModelSettings } from "./model-settings";
import { ExtractedProfileData, namesMatch, isNewBullet, splitBullets } from "./profile-merge";
import { ProfileQuestion, ResumeGapQuestion, RequirementCoverage } from "./schemas";

function providerSettings() {
  const s = getModelSettings();
  return s.provider !== "together" ? { provider: s.provider, model: s.model, apiKey: s.apiKey } : undefined;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data as T;
}

// --- Feature 1 & 3: extract structured candidates from freeform text ---

export async function extractProfileData(
  text: string,
  profile: Profile,
  diffAgainstText?: string,
): Promise<ExtractedProfileData> {
  const { data } = await postJson<{ data: ExtractedProfileData }>("/api/profile/extract", {
    text, profile, providerSettings: providerSettings(), diffAgainstText,
  });
  return data;
}

// --- Feature 2: interview loop ---

export async function generateProfileQuestions(
  profile: Profile,
  excludeQuestionTexts: string[] = [],
): Promise<ProfileQuestion[]> {
  const { questions } = await postJson<{ questions: ProfileQuestion[] }>("/api/profile/questions", {
    profile, providerSettings: providerSettings(), excludeQuestionTexts,
  });
  return questions;
}

export async function rewriteBulletFromAnswer(
  profile: Profile,
  targetLabel: string,
  currentText: string,
  question: string,
  answer: string,
): Promise<string> {
  const { rewrittenText } = await postJson<{ rewrittenText: string }>("/api/profile/rewrite-bullet", {
    profile, providerSettings: providerSettings(), targetLabel, currentText, question, answer,
  });
  return rewrittenText;
}

/**
 * Replace a specific bullet (experience) or description (project) in the
 * profile with the AI-rewritten text. Falls back to appending rather than
 * silently dropping the answer if the original bullet text has drifted
 * (e.g. the user already hand-edited it since the question was generated).
 */
export function replaceBulletInProfile(
  profile: Profile,
  targetType: "experience" | "project",
  targetId: string,
  currentText: string,
  newText: string,
): Profile {
  if (targetType === "experience") {
    return {
      ...profile,
      experience: profile.experience.map(e => {
        if (!namesMatch(e.company, targetId)) return e;
        const lines = e.bullets.split("\n");
        const idx = lines.findIndex(l => l.trim() === currentText.trim());
        if (idx === -1) {
          return { ...e, bullets: [...lines.filter(l => l.trim()), newText].join("\n") };
        }
        const next = [...lines];
        next[idx] = newText;
        return { ...e, bullets: next.join("\n") };
      }),
    };
  }
  return {
    ...profile,
    projects: profile.projects.map(p => (namesMatch(p.name, targetId) ? { ...p, description: newText } : p)),
  };
}

// --- Interactive resume builder, step 1: the JD requirement map ---

export async function generateRequirementMap(profile: Profile, app: Application): Promise<RequirementCoverage[]> {
  const { requirements } = await postJson<{ requirements: RequirementCoverage[] }>("/api/resume/requirement-map", {
    profile, app, providerSettings: providerSettings(),
  });
  return requirements;
}

// --- Job-scoped gap analysis + write-back (resume rebuild #5) ---

export async function generateResumeGapQuestions(
  profile: Profile,
  app: Application,
  targetPriorities: string[],
  subFocus?: string | null,
): Promise<ResumeGapQuestion[]> {
  const { questions } = await postJson<{ questions: ResumeGapQuestion[] }>("/api/resume/gap-questions", {
    profile, app, providerSettings: providerSettings(), targetPriorities, subFocus,
  });
  return questions;
}

export async function answerResumeGapQuestion(
  profile: Profile,
  targetLabel: string,
  priority: string,
  question: string,
  answer: string,
): Promise<string> {
  const { newBulletText } = await postJson<{ newBulletText: string }>("/api/resume/gap-answer", {
    profile, providerSettings: providerSettings(), targetLabel, priority, question, answer,
  });
  return newBulletText;
}

export type GapWriteBackResult = { profile: Profile; applied: boolean; summary: string };

/**
 * Append a job-time gap-answer bullet back to the CANONICAL profile — reuses
 * the exact same dedupe rule (isNewBullet/textSimilarity) the extraction
 * merge engine (Features 1 & 3) uses, so an answer can never create a
 * duplicate bullet, and tags it to the exact experience/project it belongs
 * to so it's reusable for other jobs later.
 */
export function appendGapAnswerToProfile(
  profile: Profile,
  targetType: "experience" | "project",
  targetId: string,
  newBulletText: string,
): GapWriteBackResult {
  if (targetType === "experience") {
    const match = profile.experience.find(e => namesMatch(e.company, targetId));
    if (!match) return { profile, applied: false, summary: `No matching role found for "${targetId}" — not saved to profile.` };
    const existingBullets = splitBullets(match.bullets);
    if (!isNewBullet(newBulletText, existingBullets)) {
      return { profile, applied: false, summary: `Already on file for ${match.company} — skipped as a duplicate.` };
    }
    const experience = profile.experience.map(e =>
      e.id === match.id ? { ...e, bullets: [...existingBullets, newBulletText].join("\n") } : e
    );
    return { profile: { ...profile, experience }, applied: true, summary: `Added to ${match.company}: "${newBulletText}"` };
  }

  const match = profile.projects.find(p => namesMatch(p.name, targetId));
  if (!match) return { profile, applied: false, summary: `No matching project found for "${targetId}" — not saved to profile.` };
  if (match.description.includes(newBulletText)) {
    return { profile, applied: false, summary: `Already on file for ${match.name} — skipped as a duplicate.` };
  }
  const projects = profile.projects.map(p =>
    p.id === match.id ? { ...p, description: `${p.description} ${newBulletText}`.trim() } : p
  );
  return { profile: { ...profile, projects }, applied: true, summary: `Added to ${match.name}: "${newBulletText}"` };
}
