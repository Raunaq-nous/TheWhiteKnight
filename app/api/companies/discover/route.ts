import { NextRequest, NextResponse } from "next/server";
import { chatJSON, ProviderSettings } from "../../../../lib/ai-client";

export const runtime = "nodejs";
export const maxDuration = 120;

export type DiscoveredCompany = {
  name: string;
  region: ("global" | "middle-east" | "apac" | "india" | "north-america" | "europe")[];
  sector: string;       // e.g. "consulting", "design-studio", "edtech", "biotech"
  careersUrl: string;   // best-effort, AI inferred
  rationale: string;    // 1 sentence why this fits the user
  seniorityFit: "junior" | "mid" | "senior" | "leadership" | "any";
};

export async function POST(req: NextRequest) {
  try {
    const { profile, providerSettings, count = 25, region } = await req.json() as {
      profile: any;
      providerSettings?: ProviderSettings;
      count?: number;
      region?: string;
    };

    if (!profile) {
      return NextResponse.json({ error: "Missing profile" }, { status: 400 });
    }

    const roleType = profile.roleType || "professional";
    const headline = profile.headline || "";
    const yoe = profile.yearsOfExperience || "";
    const location = profile.location || "";
    const openTo = profile.locationsOpenTo || "";
    const skills = Object.values(profile.skills || {}).join(", ");
    const latestRole = profile.experience?.[0]?.role || "";
    const latestCompany = profile.experience?.[0]?.company || "";

    const regionHint = region
      ? `Prioritise companies hiring in: ${region}. `
      : openTo
        ? `Prioritise companies hiring in: ${openTo}, then ${location}. `
        : `Prioritise companies hiring in: ${location} and globally remote. `;

    const prompt = `You are a career advisor recommending target companies for a specific candidate. Based on their profile, list ${count} companies they should target.

CANDIDATE PROFILE:
- Role type: ${roleType}
- Headline: ${headline}
- Years of experience: ${yoe}
- Latest role: ${latestRole}${latestCompany ? ` at ${latestCompany}` : ""}
- Location: ${location}
- Open to: ${openTo}
- Skills: ${skills}

CRITICAL RULES:
1. Tailor companies to this specific candidate. A brand designer should get design studios and creative agencies, not consulting firms. A CS student should get internships, not director roles. A consultant should get strategy firms and big tech.
2. ${regionHint}
3. Include a mix: 40% well-known tier-1 employers, 40% strong tier-2 (less competitive, equally good fit), 20% niche/emerging companies the candidate might not know.
4. For each company, infer the most likely careers URL (e.g. company.com/careers, careers.company.com).
5. Use realistic sector labels — examples: "consulting", "big-tech", "ai-emerging", "design-studio", "advertising", "edtech", "fintech", "biotech", "healthtech", "media", "creative-agency", "vc-pe", "saas", "ecommerce", "gaming", "non-profit", "research-lab".
6. Match seniorityFit to the candidate's profile: "junior" if <2yr experience or student, "mid" if 2-6yr, "senior" if 7-12yr, "leadership" if 13+yr or director-level headline.

Output JSON only, no explanation:
{
  "companies": [
    {
      "name": "Company Name",
      "region": ["india"],
      "sector": "design-studio",
      "careersUrl": "company.com/careers",
      "rationale": "Top brand design studio in Mumbai with consumer focus that matches the candidate's portfolio.",
      "seniorityFit": "mid"
    }
  ]
}`;

    const data = await chatJSON<{ companies: DiscoveredCompany[] }>(
      [{ role: "user", content: prompt }],
      { temperature: 0.5, maxTokens: 4000 },
      providerSettings
    );

    return NextResponse.json({ companies: data.companies ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Discovery failed" }, { status: 500 });
  }
}
