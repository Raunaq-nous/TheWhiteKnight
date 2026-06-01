import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { profileRepo } from "../../../../lib/server/repositories";
import type { Profile } from "../../../../lib/profile";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminEmail = process.env.ADMIN_EMAIL ?? "";
  profileRepo.seedIfEmpty(session.email, adminEmail);
  return NextResponse.json(profileRepo.get(session.email));
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await req.json() as Profile;
  profileRepo.save(session.email, profile);
  return NextResponse.json({ ok: true });
}
