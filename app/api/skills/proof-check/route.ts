import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { runConfidentialityGate } from "../../../../lib/resume-confidentiality";

export const runtime = "nodejs";

// A proof-artifact bullet must pass the confidentiality gate before it can
// be offered for the profile (never client-confidential material).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { text } = await req.json().catch(() => ({})) as { text?: string };
  if (!text?.trim()) return NextResponse.json({ ok: false, blockedTerms: [], error: "Empty bullet" }, { status: 400 });
  const gate = runConfidentialityGate(text);
  return NextResponse.json({ ok: gate.ok, blockedTerms: gate.blockedTerms });
}
