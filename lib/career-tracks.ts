// CAREER TRACKS (docs/CAREER-TRACKS.md, config/career-tracks.json): the
// four tracks with their titles, keywords, skills, evaluation formats,
// sourcing and seeded pathways. Client-safe.

import tracksConfig from "../config/career-tracks.json";
import type { ResumeArchetype } from "./resume-archetype";
import type { SourceCategory } from "./job-sources";

export type TrackId = "consulting_strategy" | "ai_deployment_strategy" | "forward_deployed_engineer" | "venture_capital";

export type SeedPathway = { skill: string; steps: string[]; proof: string; estimate: string; covers?: string[] };

export type CareerTrack = {
  id: TrackId;
  label: string;
  resumeArchetype: ResumeArchetype;
  titles: string[];
  keywords: string[];
  mustHaveSkills: string[];
  emergingSkills: string[];
  evaluationFormats: string[];
  sourcing: { preferredSources: SourceCategory[]; boards: string[]; companies: string[] };
  pathways: SeedPathway[];
};

export const CAREER_TRACKS: CareerTrack[] = (tracksConfig as unknown as { tracks: CareerTrack[] }).tracks;
export const TRACK_IDS = CAREER_TRACKS.map(t => t.id);

export function trackById(id: string | null | undefined): CareerTrack | undefined {
  return CAREER_TRACKS.find(t => t.id === id);
}
