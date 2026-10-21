import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session";
import { gatewayStore } from "../../../lib/server/gateway-store";
import { DEFAULT_CHAINS, PAID_PROVIDERS, resolveAllChains } from "../../../lib/ai-gateway";

export const runtime = "nodejs";

// Model gateway settings: chains per task family, monthly spend caps, this
// month's spend and the recent calls per task (which provider and model
// served each). Read: any logged-in user. Edit: the admin only, because the
// chains and caps govern the server's own provider keys.
function view(isAdmin: boolean) {
  const settings = gatewayStore.getSettings();
  return {
    isAdmin,
    keys: { openrouter: !!process.env.OPENROUTER_API_KEY, together: !!process.env.TOGETHER_API_KEY },
    defaults: DEFAULT_CHAINS,
    edited: settings.chains,
    resolved: resolveAllChains(),
    caps: settings.caps,
    spend: Object.fromEntries(PAID_PROVIDERS.map(p => [p, gatewayStore.monthlySpend(p)])),
    recentCalls: gatewayStore.recentCalls(10),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(view(!!session.isAdmin));
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "Only the admin can edit the model gateway." }, { status: 403 });
  gatewayStore.saveSettings(await req.json().catch(() => ({})));
  return NextResponse.json(view(true));
}
