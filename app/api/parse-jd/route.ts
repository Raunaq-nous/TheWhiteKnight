import { NextRequest, NextResponse } from "next/server";
import { chatJSON, ProviderSettings } from "../../../lib/ai-client";

export const runtime = "nodejs";
export const maxDuration = 60;

export type ParsedJDFields = {
  company: string;
  role: string;
  location: string;
  sector: string;
  seniority: "junior" | "mid" | "senior" | "leadership";
  remote: boolean;
  sourceUrl: string;
};

export async function POST(req: NextRequest) {
  try {
    const { text, providerSettings } = await req.json() as {
      text: string;
      providerSettings?: ProviderSettings;
    };

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const prompt = `Extract structured fields from the following job description. Return JSON only.

JOB DESCRIPTION:
${text.slice(0, 6000)}

Return this exact JSON structure (all fields required, use empty string if unknown):
{
  "company": "company name or empty string",
  "role": "job title or empty string",
  "location": "city/country or empty string",
  "sector": "one of: consulting, big-tech, ai-emerging, design-studio, advertising, edtech, fintech, biotech, healthtech, media, creative-agency, vc-pe, saas, ecommerce, gaming, non-profit, research-lab, engineering, manufacturing, retail, logistics, real-estate, legal, other",
  "seniority": "junior (0-2yr / intern), mid (2-6yr), senior (7-12yr), or leadership (13+yr / director+)",
  "remote": true or false,
  "sourceUrl": "application URL if mentioned in the JD, otherwise empty string"
}`;

    const fields = await chatJSON<ParsedJDFields>(
      [{ role: "user", content: prompt }],
      { temperature: 0.1, maxTokens: 800 },
      providerSettings
    );

    return NextResponse.json(fields);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Field parsing failed" }, { status: 500 });
  }
}
