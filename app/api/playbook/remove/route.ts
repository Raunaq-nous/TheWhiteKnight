import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { remove } from "../../../../lib/server/services/playbook-service";

export const runtime = "nodejs";

// Remove ONE rule from the playbook.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { ruleId } = await req.json().catch(() => ({})) as { ruleId?: string };
  if (typeof ruleId !== "string") return NextResponse.json({ error: "ruleId is required" }, { status: 400 });
  const r = remove(session.email, ruleId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
  return NextResponse.json(r);
}
