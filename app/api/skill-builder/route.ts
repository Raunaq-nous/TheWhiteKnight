import { NextRequest, NextResponse } from "next/server";
import { chatJSON } from "../../../lib/ai-client";
import { skillBuilderPrompt, SkillBuilderResult } from "../../../lib/prompts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { profile, applications } = await req.json() as {
      profile: any;
      applications: any[];
    };

    if (!profile) {
      return NextResponse.json({ error: "Missing profile" }, { status: 400 });
    }

    // Aggregate technical skills and key requirements across all applications
    const skillCounts = new Map<string, number>();
    const allRequirements: string[] = [];

    for (const app of applications ?? []) {
      const tech = app.jdParsed?.technicalSkills ?? [];
      for (const s of tech) {
        const norm = s.toLowerCase().trim();
        skillCounts.set(norm, (skillCounts.get(norm) ?? 0) + 1);
      }
      const reqs = app.jdParsed?.keyRequirements ?? [];
      allRequirements.push(...reqs.slice(0, 3));
    }

    // Order skills by frequency
    const orderedSkills = Array.from(skillCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([skill, count]) => `${skill} (×${count})`);

    const data = await chatJSON<SkillBuilderResult>(
      [{ role: "user", content: skillBuilderPrompt(profile, orderedSkills, allRequirements.slice(0, 25)) }],
      { temperature: 0.3, maxTokens: 4000 }
    );

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Skill builder generation failed" }, { status: 500 });
  }
}
