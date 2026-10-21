// GHOST-JOB FILTER. Flags postings that are probably not real openings:
//   - stale:  posted more than 30 days ago;
//   - repost: the same JD fingerprint reappearing under a new id or URL;
//   - gone:   no longer present in its company's ATS feed.
// Flagged jobs stay visible with the reason, but autopilot never stages
// them. Client-safe, pure; the fingerprint index is stored per user.

import { hostOf } from "./job-dedupe";

export const GHOST_MAX_AGE_DAYS = 30;

export type GhostFlag = { kind: "stale" | "repost" | "gone"; detail: string };
export type GhostCheck = { flags: GhostFlag[]; checkedAt: string };

/** FNV-1a 64-bit over normalised JD text: identical JDs (whitespace, case and markup aside) share a fingerprint. */
export function jdFingerprint(text: string): string | null {
  const norm = text.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (norm.split(" ").length < 25) return null; // too short to fingerprint reliably
  let h = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = (BigInt(1) << BigInt(64)) - BigInt(1);
  for (let i = 0; i < norm.length; i++) {
    h ^= BigInt(norm.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}

export type FingerprintIndex = Record<string, { firstSeen: string; urls: string[] }>;

export function ageInDays(publishedDate: string | undefined, now: Date): number | null {
  if (!publishedDate) return null;
  const t = Date.parse(publishedDate);
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / 86_400_000) : null;
}

/** The ghost flags for one job. `feedUrls`, when given, is the set of URLs its company's ATS feed still lists. */
export function ghostFlags(job: { url: string; publishedDate?: string; jdText?: string }, ctx: { now: Date; index?: FingerprintIndex; feedUrls?: Set<string> | null }): GhostFlag[] {
  const flags: GhostFlag[] = [];
  const age = ageInDays(job.publishedDate, ctx.now);
  if (age !== null && age > GHOST_MAX_AGE_DAYS) flags.push({ kind: "stale", detail: `posted ${age} days ago (over ${GHOST_MAX_AGE_DAYS})` });
  const fp = job.jdText ? jdFingerprint(job.jdText) : null;
  const seen = fp ? ctx.index?.[fp] : undefined;
  // A repost is the same JD under a NEW id on the SAME host; the same JD on a
  // different source (an ATS and Google Jobs) is the same listing, not a repost.
  const earlier = seen?.urls.find(u => u !== job.url && hostOf(u) === hostOf(job.url));
  if (seen && earlier) flags.push({ kind: "repost", detail: `same job description first seen ${seen.firstSeen.slice(0, 10)} at ${earlier}` });
  if (ctx.feedUrls && !ctx.feedUrls.has(job.url)) flags.push({ kind: "gone", detail: "no longer listed in the company's ATS feed" });
  return flags;
}

/** Records a job's fingerprint (newest 5000 kept). Returns the updated index. */
export function rememberFingerprint(index: FingerprintIndex, jdText: string | undefined, url: string, now: Date): FingerprintIndex {
  const fp = jdText ? jdFingerprint(jdText) : null;
  if (!fp) return index;
  const next = { ...index };
  const cur = next[fp];
  next[fp] = cur ? { ...cur, urls: [...new Set([...cur.urls, url])].slice(-10) } : { firstSeen: now.toISOString(), urls: [url] };
  const keys = Object.keys(next);
  if (keys.length > 5000) {
    for (const k of keys.sort((a, b) => next[a].firstSeen.localeCompare(next[b].firstSeen)).slice(0, keys.length - 5000)) delete next[k];
  }
  return next;
}

export function isGhost(check: GhostCheck | null | undefined): boolean {
  return !!check && check.flags.length > 0;
}
