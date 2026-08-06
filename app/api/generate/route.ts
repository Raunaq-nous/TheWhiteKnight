import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../lib/rate-limit";
import { chat, chatJSON, ProviderSettings } from "../../../lib/ai-client";
import { SkillGapResultSchema } from "../../../lib/schemas";
import { ResumeContentSchema, ResumeContent, normalizeResumeContent } from "../../../lib/resume-schema";
import { detectResumeArchetype, withArchetypeSequence, ResumeArchetype } from "../../../lib/resume-archetype";
import { clampToOnePageBudget } from "../../../lib/resume-budget";
import { resolveResumeSelections } from "../../../lib/resume-selection";
import {
  GenerationAction,
  ContactProfile,
  resumePrompt,
  resumeRefinePrompt,
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
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`generate:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) }
    });
  }
  try {
    const { action, profile, app, target, providerSettings, currentContent, instruction, researchContext, resumeArchetype } = await req.json() as {
      action: GenerationAction;
      profile: any;
      app: any;
      target?: ContactProfile;
      providerSettings?: ProviderSettings;
      currentContent?: string;
      instruction?: string;
      researchContext?: string;
      resumeArchetype?: ResumeArchetype;
    };

    if (!action || !profile || !app) {
      return NextResponse.json({ error: "Missing action, profile, or app" }, { status: 400 });
    }

    if (action === "skill-gap") {
      const data = await chatJSON(
        [{ role: "user", content: skillGapPrompt(profile, app) }],
        { temperature: 0.2 },
        providerSettings,
        SkillGapResultSchema
      );
      return NextResponse.json({ data });
    }

    // Resume generation/refine produce structured JSON (ResumeContent), not
    // plain text — the render layer needs real data to rank/trim/lay out,
    // not a markdown string to re-parse.
    if (action === "resume") {
      const archetype = detectResumeArchetype(profile, app, resumeArchetype);
      const data = await chatJSON<ResumeContent>(
        [{ role: "user", content: resumePrompt(profile, app, archetype) }],
        { temperature: 0.6, maxTokens: 4000 },
        providerSettings,
        ResumeContentSchema,
      );
      // The model only ever SELECTS bullet ids (see lib/resume-selection.ts)
      // — resolveResumeSelections turns those ids into real profile text
      // (or a compressed, outcome-preserving variant) before anything else
      // touches this content, so nothing downstream ever sees model-authored
      // experience/project/key-win prose. Section order is then stamped
      // deterministically from the archetype spec, and the one-page content
      // budget is clamped deterministically — neither is trusted to the model.
      const resolved = resolveResumeSelections(data, profile);
      return NextResponse.json({ data: withArchetypeSequence(clampToOnePageBudget(normalizeResumeContent(resolved), archetype), archetype), archetype });
    }
    if (action === "refine" && req.headers.get("x-refine-for") === "resume") {
      if (!currentContent || !instruction) {
        return NextResponse.json({ error: "refine requires currentContent and instruction" }, { status: 400 });
      }
      const archetype = detectResumeArchetype(profile, app, resumeArchetype);
      let parsedCurrent: ResumeContent;
      try {
        parsedCurrent = ResumeContentSchema.parse(JSON.parse(currentContent));
      } catch {
        return NextResponse.json({ error: "currentContent is not valid resume JSON" }, { status: 400 });
      }
      const data = await chatJSON<ResumeContent>(
        [{ role: "user", content: resumeRefinePrompt(profile, app, archetype, parsedCurrent, instruction) }],
        { temperature: 0.5, maxTokens: 4000 },
        providerSettings,
        ResumeContentSchema,
      );
      const resolved = resolveResumeSelections(data, profile);
      return NextResponse.json({ data: withArchetypeSequence(clampToOnePageBudget(normalizeResumeContent(resolved), archetype), archetype), archetype });
    }

    let prompt = "";
    let temperature = 0.7;
    let maxTokens = 2500;
    if (action === "cover-letter") { prompt = coverLetterPrompt(profile, app); temperature = 0.7; maxTokens = 2000; }
    else if (action === "executive-summary") { prompt = executiveSummaryPrompt(profile, app); temperature = 0.6; maxTokens = 3000; }
    else if (action === "problem-solver") { prompt = problemSolverPrompt(profile, app, researchContext); temperature = 0.75; maxTokens = 4000; }
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
        "cover-letter": 2000, "executive-summary": 3000, "problem-solver": 2500,
        "outreach-hm": 1500, "linkedin-dm": 600, "referral-dm": 600, "ceo-cold-email": 1500,
      };
      maxTokens = tokenBudget[refineFor] ?? 3000;
      temperature = 0.5; // lower temp for targeted edits
    }
    else return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

    const content = await chat(
      [{ role: "user", content: prompt }],
      { temperature, maxTokens },
      providerSettings
    );
    return NextResponse.json({ content });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Generation failed" }, { status: 500 });
  }
}
