import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { detectAtsDetailed, targetFromDetection } from "../../../../lib/server/services/ats-detector";

export const runtime = "nodejs";

// ATS detector: a company domain or careers URL in, its ATS and slug out,
// as a CompanyTarget ready to add. Fetches at most three public pages of
// that company's own site; never a login flow.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = checkRateLimit(`ats-detect:${session.email}`, 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  const { input, name } = await req.json().catch(() => ({})) as { input?: string; name?: string };
  if (!input?.trim()) return NextResponse.json({ error: "Paste a company domain or careers URL." }, { status: 400 });
  const { result, reason } = await detectAtsDetailed(input.trim());
  if (!result) return NextResponse.json({ detected: false, reason: reason ?? "No public ATS found." });
  return NextResponse.json({ detected: true, detection: result, target: targetFromDetection(result, name?.trim() || undefined) });
}
