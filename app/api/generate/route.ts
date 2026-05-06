import { NextRequest, NextResponse } from "next/server";
import { chat, chatJSON, ProviderSettings } from "../../../lib/ai-client";
import { normalizeTextForATS } from "../../../lib/ats";
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
} from "../../../lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Pro: allow up to 5 min for reasoning models

export async function POST(req: NextRequest) {
  try {
    const { action, profile, app, target, providerSettings, currentContent, instruction } = await req.json() as {
      action: GenerationAction;
      profile: any;
      app: any;
      target?: ContactProfile;
      providerSettings?: ProviderSettings;
      currentContent?: string;
      instruction?: string;
    };

    if (!action || !profile || !app) {
      return NextResponse.json({ error: "Missing action, profile, or app" }, { status: 400 });
    }

    if (action === "skill-gap") {
      const data = await chatJSON(
        [{ role: "user", content: skillGapPrompt(profile, app) }],
        { temperature: 0.2 },
        providerSettings
      );
      return NextResponse.json({ data });
    }

    let prompt = "";
    let temperature = 0.7;
    let maxTokens = 2500;
    if (action === "resume") { prompt = resumePrompt(profile, app); temperature = 0.6; maxTokens = 4000; }
    else if (action === "cover-letter") { prompt = coverLetterPrompt(profile, app); temperature = 0.7; maxTokens = 2000; }
    else if (action === "executive-summary") { prompt = executiveSummaryPrompt(profile, app); temperature = 0.6; maxTokens = 3000; }
    else if (action === "problem-solver") { prompt = problemSolverPrompt(profile, app); temperature = 0.75; maxTokens = 2500; }
    else if (action === "outreach-hm") {
      prompt = target ? hmOutreachPromptWithProfile(profile, app, target) : hmOutreachPrompt(profile, app);
      temperature = 0.7; maxTokens = 1500;
    }
    else if (action === "linkedin-dm") {
      prompt = target ? linkedInDMPromptWithProfile(profile, app, target) : linkedInDMPrompt(profile, app);
      temperature = 0.75; maxTokens = 600;
    }
    else if (action === "referral-dm") {
      if (!target) return NextResponse.json({ error: "referral-dm requires a target contact" }, { status: 400 });
      prompt = referralDMPromptWithProfile(profile, app, target);
      temperature = 0.75; maxTokens = 600;
    }
    else if (action === "ceo-cold-email") {
      prompt = ceoColdEmailPrompt(profile, app, target);
      temperature = 0.7; maxTokens = 1500;
    }
    else if (action === "refine") {
      if (!currentContent || !instruction) {
        return NextResponse.json({ error: "refine requires currentContent and instruction" }, { status: 400 });
      }
      const refineFor = (req.headers.get("x-refine-for") || "document").toString();
      prompt = refinePrompt(profile, app, refineFor, currentContent, instruction);
      // Use the same maxTokens as the source action so the refined version doesn't get truncated
      const tokenBudget: Record<string, number> = {
        resume: 4000, "cover-letter": 2000, "executive-summary": 3000, "problem-solver": 2500,
        "outreach-hm": 1500, "linkedin-dm": 600, "referral-dm": 600, "ceo-cold-email": 1500,
      };
      maxTokens = tokenBudget[refineFor] ?? 3000;
      temperature = 0.5; // lower temp for targeted edits
    }
    else return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

    let content = await chat(
      [{ role: "user", content: prompt }],
      { temperature, maxTokens },
      providerSettings
    );
    if (action === "resume" || (action === "refine" && req.headers.get("x-refine-for") === "resume")) {
      content = normalizeTextForATS(content);
    }
    return NextResponse.json({ content });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Generation failed" }, { status: 500 });
  }
}
