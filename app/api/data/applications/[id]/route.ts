import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../../lib/session";
import { applicationRepo } from "../../../../../lib/server/repositories";
import type { Application } from "../../../../../lib/store";

export const runtime = "nodejs";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const changes = await req.json() as Partial<Application>;
  applicationRepo.update(session.email, id, changes);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  applicationRepo.delete(session.email, id);
  return NextResponse.json({ ok: true });
}
