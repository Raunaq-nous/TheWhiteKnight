import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";

export const runtime = "nodejs";

// Session status check — always returns 200 JSON, even when logged out,
// so the client never has to distinguish "unauthenticated" from "network/parse error".
export async function GET() {
  const session = await getSession();
  return NextResponse.json({ authenticated: !!session, user: session });
}
