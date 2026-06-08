import "server-only";
import { chat, chatJSON, ProviderSettings } from "../../ai-client";
import { normalizeTextForATS } from "../../ats";
import { SkillGapResultSchema } from "../../schemas";
import {
  GenerationAction,
  ContactProfile,
  resumePrompt,
  coverLetterPrompt,
  executiveSummaryPrompt,
  problemSolverPrompt,
  skillGapPrompt,
  hmOutreachPrompt,
  hmOutreachPromptWithProfile,
  linkedInDMPrompt,
  linkedInDMPromptWithProfile,
  referralDMPromptWithProfile,
  ceoColdEmailPrompt,
  refinePrompt,
} from "../../prompts";

export type DraftInput = {
  action: GenerationAction;
  profile: any;
  app: any;
  target?: ContactProfile;
  providerSettings?: ProviderSettings;
  currentContent?: string;
  instruction?: string;
  researchContext?: string;
};

export async function generateDraft(input: DraftInput): Promise<unknown> {
  const { action, profile, app, target, providerSettings, currentContent, instruction, researchContext } = input;

  if (action === "skill-gap") {
    return chatJSON(
      [{ role: "user", content: skillGapPrompt(profile, app) }],
      { temperature: 0.2 },
      providerSettings,
      SkillGapResultSchema,
    );
  }

  const promptMap: Record<string, string | null> = {
    resume: resumePrompt(profile, app),
    "cover-letter": coverLetterPrompt(profile, app),
    "executive-summary": executiveSummaryPrompt(profile, app),
    "problem-solver": problemSolverPrompt(profile, app),
    "outreach-hm": target ? hmOutreachPromptWithProfile(profile, app, target, researchContext) : hmOutreachPrompt(profile, app),
    "linkedin-dm": target ? linkedInDMPromptWithProfile(profile, app, target, researchContext) : linkedInDMPrompt(profile, app),
    "referral-dm": target ? referralDMPromptWithProfile(profile, app, target) : null,
    "ceo-cold-email": ceoColdEmailPrompt(profile, app, target),
    refine: currentContent && instruction ? refinePrompt(currentContent, instruction, profile, app) : null,
  };

  const promptText = promptMap[action] ?? null;
  if (!promptText) throw new Error(`Cannot generate draft: unsupported action or missing required fields for "${action}"`);

  const text = await chat(
    [{ role: "user", content: promptText }],
    { temperature: 0.7, maxTokens: 4000 },
    providerSettings,
  );

  if (action === "resume") return { text: normalizeTextForATS(text) };
  return { text };
}
