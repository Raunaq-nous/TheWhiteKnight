import "server-only";
import { chat, chatJSON, ProviderSettings } from "../../ai-client";
import { SkillGapResultSchema } from "../../schemas";
import { generateEvaluatedResume } from "./resume-generation-service";
import { evaluateArtifact, draftChecks, withEvaluatorGate } from "./evaluator";
import { EVALUATED_DRAFT_KINDS, type ArtifactEvaluation, type EvaluatedKind } from "../../evaluation";
import {
  GenerationAction,
  ContactProfile,
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
  evaluatorFindingsBlock,
  playbookBlock,
} from "../../prompts";
import { playbookArtifactFor, rulesFor, type Playbook } from "../../playbook";

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
  // My accepted playbook; the rules that apply to this artifact are appended.
  playbook?: Playbook | null;
};

/** The playbook rules for a draft: by artifact (a refine takes the artifact it refines), archetype and track. */
export function draftPlaybookRules(input: Pick<DraftInput, "action" | "app" | "refineFor" | "playbook">): string[] {
  const action = input.action === "refine" ? (input.refineFor ?? "document") : input.action;
  return rulesFor(input.playbook, { artifact: playbookArtifactFor(action), archetype: input.app?.resumeArchetype ?? input.app?.track?.archetype, trackId: input.app?.track?.id });
}

/** The prompt and sampling settings for a plain-text draft action, with the applicable playbook rules appended. */
export function draftPromptFor(input: DraftInput): { prompt: string; temperature: number; maxTokens: number } {
  const base = basePromptFor(input);
  return { ...base, prompt: base.prompt + playbookBlock(draftPlaybookRules(input)) };
}

function basePromptFor(input: DraftInput): { prompt: string; temperature: number; maxTokens: number } {
  const { action, profile, app, target, currentContent, instruction, researchContext, refineFor } = input;
  if (action === "cover-letter") return { prompt: coverLetterPrompt(profile, app), temperature: 0.7, maxTokens: 2000 };
  if (action === "executive-summary") return { prompt: executiveSummaryPrompt(profile, app), temperature: 0.6, maxTokens: 3000 };
  if (action === "problem-solver") return { prompt: problemSolverPrompt(profile, app, researchContext), temperature: 0.75, maxTokens: 4000 };
  if (action === "outreach-hm") return { prompt: target ? hmOutreachPromptWithProfile(profile, app, target) : hmOutreachPrompt(profile, app), temperature: 0.7, maxTokens: 1500 };
  if (action === "linkedin-dm") return { prompt: target ? linkedInDMPromptWithProfile(profile, app, target) : linkedInDMPrompt(profile, app), temperature: 0.75, maxTokens: 600 };
  if (action === "referral-dm") {
    if (!target) throw new Error("referral-dm requires a target contact");
    return { prompt: referralDMPromptWithProfile(profile, app, target), temperature: 0.75, maxTokens: 600 };
  }
  if (action === "ceo-cold-email") return { prompt: ceoColdEmailPrompt(profile, app, target), temperature: 0.7, maxTokens: 1500 };
  if (action === "refine") {
    if (!currentContent || !instruction) throw new Error("refine requires currentContent and instruction");
    return { prompt: refinePrompt(profile, app, refineFor ?? "document", currentContent, instruction), temperature: 0.5, maxTokens: 3000 };
  }
  throw new Error(`Unsupported action: ${action}`);
}

/**
 * A cover letter or outreach draft behind the fresh-context evaluator gate:
 * on FAIL it is regenerated once with the findings, and the verdict always
 * travels with the text.
 */
export async function generateEvaluatedDraft(input: DraftInput): Promise<{ text: string; evaluation: ArtifactEvaluation }> {
  const kind = input.action as EvaluatedKind;
  const { prompt, temperature, maxTokens } = draftPromptFor(input);
  const requirements: string[] = (input.app?.jdParsed?.keyRequirements ?? []).slice(0, 5);
  const { artifact, evaluation } = await withEvaluatorGate({
    generate: async findings => chat([{ role: "user", content: prompt + evaluatorFindingsBlock(findings) }], { temperature, maxTokens }, input.providerSettings),
    evaluate: text => evaluateArtifact({ kind, artifact: text, requirements, deterministic: draftChecks(kind, text), providerSettings: input.providerSettings }),
  });
  return { text: artifact, evaluation };
}

export async function generateDraft(input: DraftInput): Promise<unknown> {
  const { action, profile, app, providerSettings } = input;

  if (action === "skill-gap") {
    return chatJSON(
      [{ role: "user", content: skillGapPrompt(profile, app) }],
      { temperature: 0.2 },
      providerSettings,
      SkillGapResultSchema,
    );
  }

  if (action === "resume") {
    const { data, archetype, formatGate, evaluation } = await generateEvaluatedResume(profile, app, providerSettings, undefined, input.playbook);
    if (formatGate.blocked) {
      console.warn(
        `[CareerOS] Auto-drafted resume for ${app?.company ?? "unknown"} failed the format gate: ` +
        formatGate.hardFailures.map(v => `${v.location}: ${v.reason}`).join("; "),
      );
    }
    return { data, archetype, evaluation };
  }

  if ((EVALUATED_DRAFT_KINDS as string[]).includes(action)) return generateEvaluatedDraft(input);

  const { prompt, temperature, maxTokens } = draftPromptFor(input);
  const text = await chat([{ role: "user", content: prompt }], { temperature, maxTokens }, providerSettings);
  return { text };
}
