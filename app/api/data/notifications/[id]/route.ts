import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../../lib/session";
import { notificationRepo } from "../../../../../lib/server/repositories";
import type { Notification } from "../../../../../lib/notifications";

export const runtime = "nodejs";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const changes = await req.json() as Partial<Notification>;
  notificationRepo.update(session.email, id, changes);
  return NextResponse.json({ ok: true });
}
