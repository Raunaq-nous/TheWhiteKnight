// Client-side wrapper. All AI calls go through /api/generate so the API key stays server-side.
import { Profile } from "./profile";
import { Application } from "./store";
import { getModelSettings } from "./model-settings";

export type { GenerationAction, SkillGapResult, SkillBuilderResult, ContactProfile } from "./prompts";
import type { GenerationAction, SkillGapResult, ContactProfile } from "./prompts";

async function callGenerate<T = any>(action: GenerationAction, profile: Profile, app: Application, target?: ContactProfile): Promise<T> {
  const settings = getModelSettings();
  const providerSettings = settings.provider !== "together"
    ? { provider: settings.provider, model: settings.model, apiKey: settings.apiKey }
    : undefined;
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, profile, app, target, providerSettings }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function generateTailoredResume(profile: Profile, app: Application): Promise<string> {
  return (await callGenerate<{ content: string }>("resume", profile, app)).content;
}

export async function generateCoverLetter(profile: Profile, app: Application): Promise<string> {
  return (await callGenerate<{ content: string }>("cover-letter", profile, app)).content;
}

export async function generateExecutiveSummary(profile: Profile, app: Application): Promise<string> {
  return (await callGenerate<{ content: string }>("executive-summary", profile, app)).content;
}

export async function generateProblemSolverPitch(profile: Profile, app: Application): Promise<string> {
  return (await callGenerate<{ content: string }>("problem-solver", profile, app)).content;
}

export async function generateHMOutreach(profile: Profile, app: Application, target?: ContactProfile): Promise<string> {
  return (await callGenerate<{ content: string }>("outreach-hm", profile, app, target)).content;
}

export async function generateLinkedInDM(profile: Profile, app: Application, target?: ContactProfile): Promise<string> {
  return (await callGenerate<{ content: string }>("linkedin-dm", profile, app, target)).content;
}

export async function generateReferralDM(profile: Profile, app: Application, target: ContactProfile): Promise<string> {
  return (await callGenerate<{ content: string }>("referral-dm", profile, app, target)).content;
}

export async function generateCEOColdEmail(profile: Profile, app: Application, target?: ContactProfile): Promise<string> {
  return (await callGenerate<{ content: string }>("ceo-cold-email", profile, app, target)).content;
}

export async function generateSkillGap(profile: Profile, app: Application): Promise<SkillGapResult> {
  return (await callGenerate<{ data: SkillGapResult }>("skill-gap", profile, app)).data;
}
