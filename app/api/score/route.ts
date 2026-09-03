import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../lib/rate-limit";
import { ProviderSettings } from "../../../lib/ai-client";
import { scoreJob } from "../../../lib/server/services/scoring-service";
import type { Profile } from "../../../lib/profile";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`score:${ip}`, 40, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) }
    });
  }
  try {
    const { jdText, company, role, location, seniority, sector, remote, buckets, profile, providerSettings } = await req.json() as {
      jdText: string;
      company: string;
      role: string;
      location: string;
      seniority: string;
      sector: string;
      remote: boolean;
      buckets: { id: string; name: string; description: string }[];
      profile: Profile;
      providerSettings?: ProviderSettings;
    };

    if (!profile) {
      return NextResponse.json({ error: "Missing profile" }, { status: 400 });
    }
    if (!buckets || buckets.length === 0) {
      return NextResponse.json({ error: "Missing target archetypes (buckets)" }, { status: 400 });
    }

    try {
      const result = await scoreJob({ jdText, company, role, location, seniority, sector, remote, buckets, profile, providerSettings });
      return NextResponse.json(result);
    } catch (e: any) {
      // Keep-but-mark-unscored (same pattern as the automation scan loop,
      // lib/server/services/automation-service.ts): a 200 with unscored:true
      // rather than a 500, so the caller can still let the user save this
      // job — unscored, reviewable, and re-scorable later — instead of the
      // whole ingest attempt failing outright. ai-client.ts already logs the
      // reasoning/content token split for every call, so whether this was
      // empty content, a schema error, or something else is visible in logs
      // regardless of which branch this falls into.
      return NextResponse.json({ unscored: true, error: e.message ?? "Scoring failed" });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Scoring failed" }, { status: 500 });
  }
}
