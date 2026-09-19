// Response analytics — a stats view over EXISTING pipeline data, no new
// tracking infrastructure. Pure functions, client-safe (no fs/server-only),
// so the /analytics page can compute directly from getApplications().
//
// IMPORTANT LIMITATION, stated plainly rather than silently approximated:
// this codebase has no dedicated inbound-reply/status-change-history log
// (lib/server/services/send-service.ts only records OUTBOUND sends). Two
// proxies stand in for what a real reply-tracking system would give
// directly:
//   - "responded" is inferred from Application.status: interview/offer/
//     rejected all mean the employer actually responded in some way;
//     applied/reviewed/sourced mean no response has been recorded yet.
//   - "time to response" uses updatedAt - createdAt, which is really "when
//     the record last changed" — a note edit after the fact would inflate
//     it slightly. Good enough for a directional stat, not a precise SLA.
import type { Application } from "./store";

export type StatusCounts = Record<Application["status"], number>;

const ALL_STATUSES: Application["status"][] = ["sourced", "reviewed", "applied", "interview", "offer", "rejected"];

export function countByStatus(apps: Application[]): StatusCounts {
  const counts = Object.fromEntries(ALL_STATUSES.map(s => [s, 0])) as StatusCounts;
  for (const a of apps) counts[a.status] = (counts[a.status] ?? 0) + 1;
  return counts;
}

// Any status beyond plain "applied" means the employer responded — moved
// the candidate forward (interview/offer) or gave a definitive no
// (rejected). A rejection is still a response; silence is not.
const RESPONSE_STATUSES = new Set<Application["status"]>(["interview", "offer", "rejected"]);

export function hasResponded(app: Application): boolean {
  return RESPONSE_STATUSES.has(app.status);
}

// The universe for reply-rate purposes: applications that actually reached
// "applied" or later. "sourced"/"reviewed" haven't been sent anywhere, so
// there's nothing to have gotten a response TO yet — including them would
// understate the real reply rate by diluting it with not-yet-sent jobs.
function reachedApplied(app: Application): boolean {
  return app.status !== "sourced" && app.status !== "reviewed";
}

export type ReplyRateResult = {
  responded: number;
  sentTotal: number;
  // null (not 0) when there's nothing to divide — no applications have
  // been sent yet, so "0% reply rate" would be misleadingly precise.
  rate: number | null;
};

export function computeReplyRate(apps: Application[]): ReplyRateResult {
  const sent = apps.filter(reachedApplied);
  const responded = sent.filter(hasResponded).length;
  return { responded, sentTotal: sent.length, rate: sent.length > 0 ? responded / sent.length : null };
}

// Pearson correlation between resume/fit score (Application.score, 0-10)
// and whether the application got a response (1/0) — a "point-biserial"
// correlation in the strict statistical sense (one variable is binary),
// computed with the standard Pearson formula, which is mathematically
// equivalent. Returns null when there's too little data (fewer than 3
// scored, sent applications) or no variance in either variable (a
// correlation is undefined, not zero, when everything scored the same or
// every outcome was identical) to mean anything.
export function scoreResponseCorrelation(apps: Application[]): number | null {
  const sent = apps.filter(reachedApplied).filter(a => typeof a.score === "number" && !Number.isNaN(a.score));
  if (sent.length < 3) return null;

  const xs: number[] = sent.map(a => a.score);
  const ys: number[] = sent.map(a => (hasResponded(a) ? 1 : 0));
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

/** Average days between createdAt and updatedAt for applications that got a response — see the module-level limitation note on why this is a proxy, not a precise measurement. */
export function averageTimeToResponseDays(apps: Application[]): number | null {
  const days = apps
    .filter(hasResponded)
    .map(a => (new Date(a.updatedAt).getTime() - new Date(a.createdAt).getTime()) / 86_400_000)
    .filter(d => Number.isFinite(d) && d >= 0);
  if (days.length === 0) return null;
  return days.reduce((s, d) => s + d, 0) / days.length;
}

export type ResponseAnalytics = {
  total: number;
  statusCounts: StatusCounts;
  replyRate: ReplyRateResult;
  scoreCorrelation: number | null;
  avgTimeToResponseDays: number | null;
};

export function computeResponseAnalytics(apps: Application[]): ResponseAnalytics {
  return {
    total: apps.length,
    statusCounts: countByStatus(apps),
    replyRate: computeReplyRate(apps),
    scoreCorrelation: scoreResponseCorrelation(apps),
    avgTimeToResponseDays: averageTimeToResponseDays(apps),
  };
}
