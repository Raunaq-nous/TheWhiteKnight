import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { getUserSingleton, setUserSingleton } from "../../../../lib/server/user-singletons";
import { draftPathway } from "../../../../lib/server/services/track-service";
import { trackById } from "../../../../lib/career-tracks";
import { seedPathwayFor } from "../../../../lib/skill-demand";
import { applyPathwayUpdate, effectivePathway, pathwayKey, type PathwayStore, type PathwayUpdate } from "../../../../lib/skill-pathways";
import type { ProviderSettings } from "../../../../lib/ai-client";

export const runtime = "nodejs";

// Pathway actions: draft (model, for a skill with no seed), accept, edit,
// mark steps or the proof done, record that its bullet was added.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { trackId?: string; skill?: string; update?: PathwayUpdate | { kind: "generate" }; providerSettings?: ProviderSettings };
  const track = trackById(body.trackId);
  const skill = (body.skill ?? "").trim().slice(0, 80);
  if (!track || !skill || !body.update) return NextResponse.json({ error: "trackId, skill and update are required" }, { status: 400 });
  const store = getUserSingleton<PathwayStore>(session.email, "skill_pathways") ?? {};
  const current = effectivePathway(store, track.id, skill, seedPathwayFor(track, skill));
  let update = body.update as PathwayUpdate;
  if ((body.update as { kind: string }).kind === "generate") {
    if (current?.origin === "seed") return NextResponse.json({ error: "This skill already has a seeded pathway." }, { status: 400 });
    try {
      update = { kind: "draft", ...(await draftPathway(session.email, track.id, skill, body.providerSettings)) };
    } catch (e: any) {
      return NextResponse.json({ error: `Could not draft a pathway: ${e.message}` }, { status: 502 });
    }
  }
  const next = applyPathwayUpdate(current, track.id, skill, update, new Date().toISOString());
  setUserSingleton(session.email, "skill_pathways", { ...store, [pathwayKey(track.id, skill)]: next });
  return NextResponse.json({ pathway: next });
}
