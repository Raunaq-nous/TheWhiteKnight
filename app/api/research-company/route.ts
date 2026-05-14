import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { company, role, sector, exaApiKey } = await req.json() as {
      company: string;
      role: string;
      sector?: string;
      exaApiKey?: string;
    };

    if (!company) {
      return NextResponse.json({ error: "Missing company" }, { status: 400 });
    }

    if (!exaApiKey) {
      return NextResponse.json({ research: "" });
    }

    const queries = [
      `${company} business strategy challenges 2024 2025`,
      `${company} ${sector ?? ""} problems growth competition`,
      `${company} news recent developments`,
    ].filter(Boolean);

    const snippets: string[] = [];

    for (const query of queries.slice(0, 2)) {
      try {
        const searchRes = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": exaApiKey,
          },
          body: JSON.stringify({
            query,
            numResults: 3,
            contents: { text: { maxCharacters: 800 } },
            type: "neural",
          }),
        });

        if (!searchRes.ok) continue;

        const data = await searchRes.json();
        const results: Array<{ title?: string; url?: string; text?: string }> = data?.results ?? [];

        for (const r of results) {
          if (r.text?.trim()) {
            snippets.push(`SOURCE: ${r.title ?? r.url ?? "unknown"}\n${r.text.trim().slice(0, 600)}`);
          }
        }
      } catch {
        // individual query failure — continue
      }
    }

    if (snippets.length === 0) {
      return NextResponse.json({ research: "" });
    }

    const research = snippets.slice(0, 4).join("\n\n---\n\n");
    return NextResponse.json({ research });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Research failed" }, { status: 500 });
  }
}
