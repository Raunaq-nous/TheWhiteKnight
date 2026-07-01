import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { contactRepo } from "../../../../lib/server/repositories";
import type { Contact } from "../../../../lib/contacts-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const contacts = q
    ? contactRepo.search(session.email, q)
    : contactRepo.list(session.email);
  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await req.json() as Omit<Contact, "id" | "createdAt" | "tags" | "applicationSlugs"> & { tags?: string[]; applicationSlugs?: string[] };
  const result = contactRepo.add(session.email, c);
  return NextResponse.json(result);
}
