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
  refineFor?: string;
};

export async function generateDraft(input: DraftInput): Promise<unknown> {
  const { action, profile, app, target, providerSettings, currentContent, instruction, researchContext, refineFor } = input;

  if (action === "skill-gap") {
    return chatJSON(
      [{ role: "user", content: skillGapPrompt(profile, app) }],
      { temperature: 0.2 },
      providerSettings,
      SkillGapResultSchema,
    );
  }

  let prompt = "";
  let temperature = 0.7;
  let maxTokens = 2500;

  if (action === "resume") {
    prompt = resumePrompt(profile, app); temperature = 0.6; maxTokens = 4000;
  } else if (action === "cover-letter") {
    prompt = coverLetterPrompt(profile, app); temperature = 0.7; maxTokens = 2000;
  } else if (action === "executive-summary") {
    prompt = executiveSummaryPrompt(profile, app); temperature = 0.6; maxTokens = 3000;
  } else if (action === "problem-solver") {
    prompt = problemSolverPrompt(profile, app, researchContext); temperature = 0.75; maxTokens = 4000;
  } else if (action === "outreach-hm") {
    prompt = target ? hmOutreachPromptWithProfile(profile, app, target) : hmOutreachPrompt(profile, app);
    temperature = 0.7; maxTokens = 1500;
  } else if (action === "linkedin-dm") {
    prompt = target ? linkedInDMPromptWithProfile(profile, app, target) : linkedInDMPrompt(profile, app);
    temperature = 0.75; maxTokens = 600;
  } else if (action === "referral-dm") {
    if (!target) throw new Error("referral-dm requires a target contact");
    prompt = referralDMPromptWithProfile(profile, app, target);
    temperature = 0.75; maxTokens = 600;
  } else if (action === "ceo-cold-email") {
    prompt = ceoColdEmailPrompt(profile, app, target);
    temperature = 0.7; maxTokens = 1500;
  } else if (action === "refine") {
    if (!currentContent || !instruction) throw new Error("refine requires currentContent and instruction");
    prompt = refinePrompt(profile, app, refineFor ?? "document", currentContent, instruction);
    temperature = 0.5; maxTokens = 3000;
  } else {
    throw new Error(`Unsupported action: ${action}`);
  }

  const text = await chat(
    [{ role: "user", content: prompt }],
    { temperature, maxTokens },
    providerSettings,
  );

  if (action === "resume") return { text: normalizeTextForATS(text) };
  return { text };
}
