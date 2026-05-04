import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUser, createUser, getInviteCode, markInviteUsed } from "../../../../lib/kv";
import { signSession, COOKIE_NAME } from "../../../../lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email, password, inviteCode } = await req.json() as { email: string; password: string; inviteCode: string };

    if (!email || !password || !inviteCode) {
      return NextResponse.json({ error: "Email, password, and invite code are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Validate invite code
    const invite = await getInviteCode(inviteCode.trim());
    if (!invite) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 400 });
    }
    if (invite.used) {
      return NextResponse.json({ error: "This invite code has already been used" }, { status: 400 });
    }

    // Check if user already exists
    if (await getUser(email)) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await createUser(email, passwordHash, false);
    await markInviteUsed(inviteCode.trim(), email);

    const token = await signSession({ email: email.toLowerCase(), isAdmin: false });
    const res = NextResponse.json({ ok: true, email: email.toLowerCase() });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Registration failed" }, { status: 500 });
  }
}
