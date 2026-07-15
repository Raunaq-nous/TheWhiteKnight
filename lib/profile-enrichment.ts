// Client-side wrappers for the profile enrichment API surface (Features 1-3).
// All AI calls go through server routes so API keys stay server-side.

import { Profile } from "./profile";
import { getModelSettings } from "./model-settings";
import { ExtractedProfileData, namesMatch } from "./profile-merge";
import { ProfileQuestion } from "./schemas";

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
