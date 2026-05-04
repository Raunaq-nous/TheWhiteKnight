import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUser } from "../../../../lib/kv";
import { signSession, COOKIE_NAME } from "../../../../lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email: string; password: string };
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await getUser(email);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = await signSession({ email: user.email, isAdmin: user.isAdmin });
    const res = NextResponse.json({ ok: true, email: user.email, isAdmin: user.isAdmin });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Login failed" }, { status: 500 });
  }
}
