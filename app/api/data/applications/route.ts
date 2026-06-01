import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { applicationRepo } from "../../../../lib/server/repositories";
import type { Application } from "../../../../lib/store";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(applicationRepo.list(session.email));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const app = await req.json() as Application;
  applicationRepo.save(session.email, app);
  return NextResponse.json({ ok: true });
}
