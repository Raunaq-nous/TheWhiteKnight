import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { notificationRepo } from "../../../../lib/server/repositories";
import type { Notification } from "../../../../lib/notifications";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(notificationRepo.list(session.email));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const n = await req.json() as Omit<Notification, "id" | "createdAt" | "dismissed">;
  const id = notificationRepo.add(session.email, n);
  return NextResponse.json({ id });
}
