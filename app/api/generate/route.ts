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
} from "../../../lib/prompts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { action, profile, app, target, providerSettings } = await req.json() as {
      action: GenerationAction;
      profile: any;
      app: any;
      target?: ContactProfile;
      providerSettings?: ProviderSettings;
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
    if (action === "resume") { prompt = resumePrompt(profile, app); temperature = 0.6; }
    else if (action === "cover-letter") { prompt = coverLetterPrompt(profile, app); temperature = 0.7; }
    else if (action === "executive-summary") { prompt = executiveSummaryPrompt(profile, app); temperature = 0.6; }
    else if (action === "problem-solver") { prompt = problemSolverPrompt(profile, app); temperature = 0.75; }
    else if (action === "outreach-hm") {
      prompt = target ? hmOutreachPromptWithProfile(profile, app, target) : hmOutreachPrompt(profile, app);
      temperature = 0.7;
    }
    else if (action === "linkedin-dm") {
      prompt = target ? linkedInDMPromptWithProfile(profile, app, target) : linkedInDMPrompt(profile, app);
      temperature = 0.75;
    }
    else if (action === "referral-dm") {
      if (!target) return NextResponse.json({ error: "referral-dm requires a target contact" }, { status: 400 });
      prompt = referralDMPromptWithProfile(profile, app, target);
      temperature = 0.75;
    }
    else if (action === "ceo-cold-email") {
      prompt = ceoColdEmailPrompt(profile, app, target);
      temperature = 0.7;
    }
    else return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

    let content = await chat(
      [{ role: "user", content: prompt }],
      { temperature, maxTokens: 2000 },
      providerSettings
    );
    if (action === "resume") content = normalizeTextForATS(content);
    return NextResponse.json({ content });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Generation failed" }, { status: 500 });
  }
}
