import { NextRequest, NextResponse } from "next/server";
import { chatJSON, ProviderSettings } from "../../../lib/ai-client";

export const runtime = "nodejs";
export const maxDuration = 120;

type QA = { question: string; answer: string };

export async function POST(req: NextRequest) {
  try {
    const { qa, instruction, jdContext, companyName, roleTitle, profile, providerSettings } = await req.json() as {
      qa: QA[];
      instruction: string;
      jdContext?: string;
      companyName?: string;
      roleTitle?: string;
      profile: any;
      providerSettings?: ProviderSettings;
    };

    if (!qa?.length || !instruction?.trim()) {
      return NextResponse.json({ error: "Missing qa or instruction" }, { status: 400 });
    }

    const qaFormatted = qa.map((item, i) =>
      `Q${i + 1}: ${item.question}\nA${i + 1}: ${item.answer}`
    ).join("\n\n");

    const profileSummary = [
      profile?.headline ? `Headline: ${profile.headline}` : "",
      profile?.yearsOfExperience ? `YOE: ${profile.yearsOfExperience}` : "",
      profile?.summary ? `Summary: ${profile.summary}` : "",
      (profile?.experience ?? []).slice(0, 3).map((e: any) =>
        `${e.role} at ${e.company}: ${e.description ?? ""}`
      ).join("\n"),
    ].filter(Boolean).join("\n");

    const prompt = `You are a career coach editing application form answers based on a candidate's instruction. Apply the instruction precisely — only change what is asked. Do not rewrite answers that are not affected by the instruction.

CANDIDATE PROFILE:
${profileSummary}

JOB CONTEXT: ${companyName ?? "the company"} — ${roleTitle ?? "this role"}
${jdContext ? `JD excerpt: ${jdContext.slice(0, 1500)}` : ""}

CURRENT ANSWERS:
${qaFormatted}

INSTRUCTION FROM CANDIDATE: "${instruction}"

RULES:
1. Apply the instruction to the relevant answers only. If the instruction says "Q2" or "answer 2", only change that answer.
2. If the instruction is global ("make all more concise", "more formal tone"), apply to every answer.
3. Never invent facts. Only use information from the candidate's profile.
4. No em dashes. Use commas or restructure.
5. Preserve question text exactly. Only the answer field changes.
6. Return ALL question-answer pairs, even unchanged ones.

Output JSON only — same structure as input:
{
  "qa": [
    { "question": "Exact question text", "answer": "Revised or unchanged answer" }
  ]
}`;

    const data = await chatJSON<{ qa: QA[] }>(
      [{ role: "user", content: prompt }],
      { temperature: 0.3, maxTokens: 4000 },
      providerSettings
    );

    return NextResponse.json({ qa: data.qa ?? qa });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Refine failed" }, { status: 500 });
  }
}
