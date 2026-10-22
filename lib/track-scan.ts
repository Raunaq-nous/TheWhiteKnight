// TRACK-AWARE SCANNING. Each active career track supplies its titles and
// keywords (added to the scan query and role keywords), its target
// companies (included in the scan when they are in the user's targets, even
// if disabled there) and its preferred source categories (used to order
// equally ranked sources). Pure.

import { CAREER_TRACKS, type CareerTrack, type TrackId } from "./career-tracks";
import { namesMatch } from "./profile-merge";
import type { CompanyTarget } from "./company-targets";
import type { SourceCategory } from "./job-sources";

export type TrackScanPlan = {
  query: string;
  roleKeywords: string[];
  companies: CompanyTarget[];
  preferredCategories: SourceCategory[];
  tracks: TrackId[];
};

export function activeTracks(ids: string[] | null | undefined): CareerTrack[] {
  return CAREER_TRACKS.filter(t => (ids ?? []).includes(t.id));
}

export function trackScanPlan(base: { query: string; roleKeywords: string[]; companies: CompanyTarget[] }, trackIds: string[] | null | undefined): TrackScanPlan {
  const tracks = activeTracks(trackIds);
  if (!tracks.length) return { ...base, preferredCategories: [], tracks: [] };
  const titles = [...new Set(tracks.flatMap(t => t.titles))];
  const query = [base.query, ...titles].filter(Boolean).join(" ").slice(0, 400);
  const roleKeywords = [...new Set([...base.roleKeywords, ...tracks.flatMap(t => t.keywords)])];
  const wanted = tracks.flatMap(t => t.sourcing.companies);
  const companies = base.companies.map(c => (!c.enabled && wanted.some(w => namesMatch(w, c.name)) ? { ...c, enabled: true } : c));
  const preferredCategories = [...new Set(tracks.flatMap(t => t.sourcing.preferredSources))];
  return { query, roleKeywords, companies, preferredCategories, tracks: tracks.map(t => t.id) };
}
