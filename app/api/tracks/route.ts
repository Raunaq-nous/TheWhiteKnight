import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session";
import { getUserSingleton, setUserSingleton } from "../../../lib/server/user-singletons";
import { TRACK_IDS } from "../../../lib/career-tracks";

export const runtime = "nodejs";

// The user's active career tracks (drive track-aware scanning and the
// /skills page).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ active: getUserSingleton<{ active?: string[] }>(session.email, "career_tracks")?.active ?? [] });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { active?: unknown };
  const active = Array.isArray(body.active) ? [...new Set(body.active.map(String).filter(id => (TRACK_IDS as string[]).includes(id)))] : [];
  setUserSingleton(session.email, "career_tracks", { active });
  return NextResponse.json({ active });
}
