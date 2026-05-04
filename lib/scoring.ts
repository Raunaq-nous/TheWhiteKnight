// Client wrapper. AI scoring runs on /api/score so the API key stays server-side.
import { Profile } from "./profile";

export type ScoringBucket = { id: string; name: string; description: string };

export async function scoreJobWithAI(
  jdText: string,
  company: string,
  role: string,
  location: string,
  seniority: string,
  sector: string,
  remote: boolean,
  buckets: ScoringBucket[],
  profile: Profile
) {
  const res = await fetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jdText, company, role, location, seniority, sector, remote, buckets, profile }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Scoring failed: ${res.status}`);
  }
  return res.json();
}
