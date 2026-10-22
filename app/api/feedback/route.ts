import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session";
import { feedbackRepo } from "../../../lib/server/repositories/feedback-repo";

export const runtime = "nodejs";

// Records one feedback event (validated and bounded); GET lists recent ones.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const saved = feedbackRepo.add(session.email, await req.json().catch(() => null));
  if (!saved) return NextResponse.json({ error: "Invalid feedback event" }, { status: 400 });
  return NextResponse.json({ ok: true, id: saved.id });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ counts: feedbackRepo.counts(session.email), events: feedbackRepo.recent(session.email, 100) });
}
