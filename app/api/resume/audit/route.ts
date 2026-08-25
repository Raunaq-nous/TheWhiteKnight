import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { chatJSON, ProviderSettings } from "../../../../lib/ai-client";
import { ResumeAuditResultSchema, ResumeAuditResult } from "../../../../lib/schemas";
import { resumeAuditPrompt } from "../../../../lib/prompts";
import { resumeContentToMarkdown, ResumeContent } from "../../../../lib/resume-schema";
import { ResumeArchetype } from "../../../../lib/resume-archetype";
import { checkAtsReadability } from "../../../../lib/resume-ats-check";
import { mergeAtsIssuesIntoDeductions } from "../../../../lib/resume-audit";
import type { Application } from "../../../../lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

// Adversarial, hiring-side scoring of a GENERATED resume against the target
// JD — step 1 (see lib/resume-ats-check.ts) is a deterministic, free parse-
// back check standing in for "run it through a real ATS parser and see what
// survives" (there's no headless-render pipeline here to literally screenshot
// the printed PDF through /api/extract-resume's OCR step). Step 2 is the
// model call, deliberately on the "audit" task's non-reasoning model (see
// lib/ai-client.ts's per-task model registry) since this is high-volume
// structured scoring, not open-ended writing.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`resume-audit:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) },
    });
  }

  try {
    const { resumeContent, archetype, app, providerSettings } = await req.json() as {
      resumeContent: ResumeContent;
      archetype?: ResumeArchetype | null;
      app: Application;
      providerSettings?: ProviderSettings;
    };

    if (!resumeContent || !app) {
      return NextResponse.json({ error: "Missing resumeContent or app" }, { status: 400 });
    }

    const markdown = resumeContentToMarkdown(resumeContent, archetype ?? undefined);
    const atsResult = checkAtsReadability(markdown);

    const data = await chatJSON<ResumeAuditResult>(
      [{ role: "user", content: resumeAuditPrompt(markdown, app, atsResult.issues.map(i => i.detail)) }],
      { temperature: 0.3, maxTokens: 2000, task: "audit" },
      providerSettings,
      ResumeAuditResultSchema,
    );

    const audit = mergeAtsIssuesIntoDeductions(data, atsResult.issues);
    return NextResponse.json({ audit, atsReadable: atsResult.readable });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Resume audit failed" }, { status: 500 });
  }
}
