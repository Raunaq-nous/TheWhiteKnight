import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { createInviteCode, listInviteCodes } from "../../../../lib/kv";

export const runtime = "nodejs";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// GET — list all invite codes (admin only)
export async function GET() {
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const codes = await listInviteCodes();
  return NextResponse.json({ codes });
}

// POST — generate a new invite code (admin only)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const code = (body.code as string | undefined)?.toUpperCase() || generateCode();
  await createInviteCode(code);
  return NextResponse.json({ code });
}
