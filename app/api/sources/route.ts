import { NextResponse } from "next/server";
import { getSession } from "../../../lib/session";
import { SOURCE_META, type JobSource } from "../../../lib/job-sources";
import { dbSourceBudget } from "../../../lib/server/source-budget";

export const runtime = "nodejs";

// Keyed job sources: whether each server key is set (never its value) and
// this month's calls against its free-tier budget.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const budget = dbSourceBudget();
  const keyed = (Object.keys(SOURCE_META) as JobSource[]).filter(s => SOURCE_META[s].monthlyBudget !== undefined);
  return NextResponse.json({
    sources: keyed.map(s => ({
      source: s,
      label: SOURCE_META[s].label,
      envKey: SOURCE_META[s].envKey,
      keySet: SOURCE_META[s].envKey ? !!process.env[SOURCE_META[s].envKey!] : true,
      used: budget.used(s),
      cap: budget.cap(s),
    })),
  });
}
