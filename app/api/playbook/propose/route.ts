import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { proposeRules } from "../../../../lib/server/services/playbook-service";
import type { ProviderSettings } from "../../../../lib/ai-client";

export const runtime = "nodejs";
export const maxDuration = 120;

// On demand: the reflector reads recent feedback and proposes rules. They are
// stored as pending; nothing is added to the playbook here.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { providerSettings?: ProviderSettings };
  try {
    return NextResponse.json(await proposeRules(session.email, { providerSettings: body.providerSettings }));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Reflector failed" }, { status: 502 });
  }
}
