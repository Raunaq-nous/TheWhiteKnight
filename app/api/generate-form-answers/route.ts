import { NextRequest, NextResponse } from "next/server";
import { chatJSON, ProviderSettings } from "../../../lib/ai-client";

export const runtime = "nodejs";
export const maxDuration = 120;

export type FormQA = {
  question: string;
  answer: string;
};

export async function POST(req: NextRequest) {
  try {
    const { questionsText, jdContext, companyName, roleTitle, profile, providerSettings } = await req.json() as {
      questionsText: string;
      jdContext?: string;
      companyName?: string;
      roleTitle?: string;
      profile: any;
      providerSettings?: ProviderSettings;
    };

    if (!questionsText?.trim()) {
      return NextResponse.json({ error: "Missing questionsText" }, { status: 400 });
    }

    const headline = profile?.headline ?? "";
    const yoe = profile?.yearsOfExperience ?? "";
    const location = profile?.location ?? "";
    const skills = Object.values(profile?.skills ?? {}).join(", ");
    const experience = (profile?.experience ?? []).slice(0, 4).map((e: any) =>
      `${e.role} at ${e.company} (${e.duration ?? ""}): ${e.description ?? ""}`
    ).join("\n");
    const education = (profile?.education ?? []).map((e: any) =>
      `${e.degree} from ${e.institution} (${e.year ?? ""})`
    ).join(", ");
    const summary = profile?.summary ?? "";
    const achievements = (profile?.achievements ?? []).slice(0, 6).join("\n");

    const jdSnippet = jdContext ? jdContext.slice(0, 2000) : "";

    const prompt = `You are a career coach helping a candidate write compelling application form answers. Read the questions below and write a tailored response to each one, drawing on the candidate's actual background.

CANDIDATE PROFILE:
- Headline: ${headline}
- Years of experience: ${yoe}
- Location: ${location}
- Summary: ${summary}
- Skills: ${skills}

EXPERIENCE:
${experience}

EDUCATION: ${education}

KEY ACHIEVEMENTS:
${achievements}

JOB CONTEXT:
- Company: ${companyName ?? "the company"}
- Role: ${roleTitle ?? "this role"}
${jdSnippet ? `- Job description excerpt:\n${jdSnippet}` : ""}

FORM INPUT (extract every distinct question from the text below, then answer each):
---
${questionsText.slice(0, 4000)}
---

RULES FOR ANSWERS:
1. Write in first person, past/present tense as appropriate.
2. Use STAR format (Situation, Task, Action, Result) for behavioural questions — but write it as flowing prose, not labelled sections.
3. Quantify wherever the candidate's background supports it. Do not invent metrics.
4. For "Why this company / role?" questions, use the JD context above to be specific.
5. Keep each answer to 3-5 sentences unless the question clearly warrants more (e.g. "describe a project in detail").
6. Never use em dashes. Use commas or restructure.
7. If the text contains a question with a word-count or character limit (e.g. "max 250 words"), stay within it.
8. If you cannot find at least one clear question in the text, return an error message in the first QA pair.

Output JSON only:
{
  "qa": [
    { "question": "Exact question text", "answer": "Answer..." },
    { "question": "Second question", "answer": "Answer..." }
  ]
}`;

    const data = await chatJSON<{ qa: FormQA[] }>(
      [{ role: "user", content: prompt }],
      { temperature: 0.4, maxTokens: 4000 },
      providerSettings
    );

    return NextResponse.json({ qa: data.qa ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Answer generation failed" }, { status: 500 });
  }
}
