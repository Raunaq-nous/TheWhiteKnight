import { NextRequest, NextResponse } from "next/server";
import { chat, chatJSON } from "../../../lib/ai-client";
import {
  GenerationAction,
  resumePrompt,
  coverLetterPrompt,
  executiveSummaryPrompt,
  problemSolverPrompt,
  skillGapPrompt,
  hmOutreachPrompt,
  linkedInDMPrompt,
} from "../../../lib/prompts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { action, profile, app } = await req.json() as {
      action: GenerationAction;
      profile: any;
      app: any;
    };

    if (!action || !profile || !app) {
      return NextResponse.json({ error: "Missing action, profile, or app" }, { status: 400 });
    }

    if (action === "skill-gap") {
      const data = await chatJSON(
        [{ role: "user", content: skillGapPrompt(profile, app) }],
        { temperature: 0.2 }
      );
      return NextResponse.json({ data });
    }

    let prompt = "";
    let temperature = 0.7;
    if (action === "resume") { prompt = resumePrompt(profile, app); temperature = 0.6; }
    else if (action === "cover-letter") { prompt = coverLetterPrompt(profile, app); temperature = 0.7; }
    else if (action === "executive-summary") { prompt = executiveSummaryPrompt(profile, app); temperature = 0.6; }
    else if (action === "problem-solver") { prompt = problemSolverPrompt(profile, app); temperature = 0.75; }
    else if (action === "outreach-hm") { prompt = hmOutreachPrompt(profile, app); temperature = 0.7; }
    else if (action === "linkedin-dm") { prompt = linkedInDMPrompt(profile, app); temperature = 0.75; }
    else return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

    const content = await chat(
      [{ role: "user", content: prompt }],
      { temperature, maxTokens: 2000 }
    );
    return NextResponse.json({ content });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Generation failed" }, { status: 500 });
  }
}
