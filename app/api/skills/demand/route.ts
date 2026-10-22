import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { applicationRepo, profileRepo } from "../../../../lib/server/repositories";
import { refreshDemand } from "../../../../lib/server/services/track-service";
import { getUserSingleton } from "../../../../lib/server/user-singletons";
import { CAREER_TRACKS, trackById } from "../../../../lib/career-tracks";
import { aggregateDemand, jobSkillsFromApps, rateSkillCoverage, seedPathwayFor } from "../../../../lib/skill-demand";
import { effectivePathway, type PathwayStore } from "../../../../lib/skill-pathways";
import type { ProviderSettings } from "../../../../lib/ai-client";

export const runtime = "nodejs";
export const maxDuration = 120;

// Skill demand per career track (rolling 90 days, emerging skills), my
// coverage of each demanded skill, the gaps, and a pathway per gap.
// GET annotates new applications by rules (free) first; POST also re-extracts
// up to `modelLimit` jobs with the model (structured chain).
async function view(email: string) {
  const apps = applicationRepo.list(email);
  const profile = profileRepo.get(email);
  const store = getUserSingleton<PathwayStore>(email, "skill_pathways") ?? {};
  const active = getUserSingleton<{ active?: string[] }>(email, "career_tracks")?.active ?? [];
  const jobs = jobSkillsFromApps(apps);
  const now = new Date();
  const ids = active.length ? active : CAREER_TRACKS.map(t => t.id);
  return {
    active,
    unclassified: apps.filter(a => !a.track).length,
    tracks: ids.map(id => {
      const track = trackById(id)!;
      const demand = aggregateDemand(jobs, id, now);
      // With no JDs yet for this track, the seed must-have skills stand in (the prior).
      const rows = demand.rows.length ? demand.rows.slice(0, 30) : [...track.mustHaveSkills, ...track.emergingSkills].map(skill => ({ skill, count: 0, share: 0, recentShare: 0, previousShare: 0, emerging: track.emergingSkills.includes(skill) }));
      return {
        id, label: track.label, jobs: demand.jobs, recentJobs: demand.recentJobs, fromSeed: demand.rows.length === 0,
        skills: rows.map(r => {
          const coverage = profile ? rateSkillCoverage(r.skill, profile) : { skill: r.skill, rating: "none" as const };
          const gap = coverage.rating !== "strong";
          return { ...r, coverage, pathway: gap ? effectivePathway(store, id, r.skill, seedPathwayFor(track, r.skill)) : null };
        }),
      };
    }),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await refreshDemand(session.email, { modelLimit: 0 });
  return NextResponse.json(await view(session.email));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { modelLimit?: number; providerSettings?: ProviderSettings };
  const r = await refreshDemand(session.email, { modelLimit: Math.max(0, Math.min(25, Number(body.modelLimit ?? 10))), providerSettings: body.providerSettings });
  return NextResponse.json({ ...r, ...(await view(session.email)) });
}
