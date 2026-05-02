// Client wrapper. AI scoring runs on /api/score so the Portkey key stays server-side.
import { TargetBucket } from "./store";

export async function scoreJobWithAI(
  jdText: string,
  company: string,
  role: string,
  location: string,
  seniority: string,
  sector: string,
  buckets: TargetBucket[]
) {
  const res = await fetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jdText, company, role, location, seniority, sector, buckets }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Scoring failed: ${res.status}`);
  }
  return res.json();
}
