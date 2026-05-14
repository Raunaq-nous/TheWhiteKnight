import { NextRequest, NextResponse } from "next/server";
import { chatJSON, ProviderSettings } from "../../../lib/ai-client";

export const runtime = "nodejs";
export const maxDuration = 30;

export type ProfileSuggestion = {
  type: "skill" | "certification" | "achievement" | "voice_note";
  description: string;
  value: string;
};

export async function POST(req: NextRequest) {
  try {
    const { text, profile, providerSettings } = await req.json() as {
      text: string;
      profile: any;
      providerSettings?: ProviderSettings;
    };

    if (!text?.trim() || text.trim().length < 40) {
      return NextResponse.json({ suggestions: [] });
    }

    // Compact profile summary to send as context
    const skillsList = Object.values(profile?.skills ?? {}).join(", ");
    const certNames = (profile?.certifications ?? []).map((c: any) => c.name).join(", ");
    const expSummary = (profile?.experience ?? []).map((e: any) => `${e.role} at ${e.company}`).join("; ");
    const voiceNotes = (profile?.voiceNotes ?? "").slice(0, 600);

    const prompt = `You scan text written by a job candidate for any new personal information not yet in their profile. Be conservative — only flag things that are clearly about the candidate (not the company or job), and only if genuinely new.

CURRENT PROFILE SNAPSHOT:
- Skills on file: ${skillsList || "(none)"}
- Certifications on file: ${certNames || "(none)"}
- Experience: ${expSummary || "(none)"}
- Voice/preferences notes: ${voiceNotes || "(none)"}

TEXT TO SCAN:
---
${text.slice(0, 2000)}
---

Look for ONLY these categories:
1. SKILL — a specific tool, technology, language, or method the candidate mentions using or being proficient in, NOT already in the skills list
2. CERTIFICATION — a course, credential, or certification they completed, NOT already in the certifications list
3. ACHIEVEMENT — a quantified outcome or notable accomplishment from their own work (revenue, users, time saved, award), NOT already captured
4. VOICE_NOTE — a stated preference about communication style, work style, or job search constraint (e.g. "I prefer not to work in fintech", "I always open with data")

Rules:
- Return empty array if nothing new is found. Do not invent or stretch.
- Each suggestion must be genuinely new vs the profile above.
- Maximum 3 suggestions per scan.
- "value" should be the exact text to add, short and clean.
- "description" should be a 1-sentence explanation of what was detected and why it's worth adding.

Output JSON only:
{
  "suggestions": [
    { "type": "skill", "description": "Candidate mentioned using Pinecone, not in skills list.", "value": "Pinecone" },
    { "type": "voice_note", "description": "Candidate stated a preference for async-first teams.", "value": "Prefers async-first work environments." }
  ]
}`;

    const data = await chatJSON<{ suggestions: ProfileSuggestion[] }>(
      [{ role: "user", content: prompt }],
      { temperature: 0, maxTokens: 600 },
      providerSettings
    );

    const suggestions = (data.suggestions ?? []).filter(
      s => s.type && s.description && s.value && s.value.trim().length > 0
    ).slice(0, 3);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
