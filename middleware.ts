import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "./lib/session";

const PUBLIC_PATHS = ["/login", "/register", "/onboard", "/admin/setup", "/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/admin/setup"];

// "Am I logged in?" checks — always run through to their route handler, even with
// no session, so the client gets a real JSON response instead of a redirect.
const AUTH_STATUS_PATHS = ["/api/auth/me"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and auth-status checks straight through to their route handlers.
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || AUTH_STATUS_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname === "/api/health") {
    return NextResponse.next();
  }

  // API routes must never redirect: a redirect gets silently followed by fetch()
  // and lands on the (HTML) /login page, which the client then tries to JSON.parse.
  const isApi = pathname.startsWith("/api");

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const session = await verifySession(token);
  if (!session) {
    if (isApi) {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
      return res;
    }
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
