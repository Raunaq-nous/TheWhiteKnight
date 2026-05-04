// Client wrapper. AI scoring runs on /api/score so the API key stays server-side.
import { Profile } from "./profile";
import { getModelSettings } from "./model-settings";

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
  const settings = getModelSettings();
  const providerSettings = settings.provider !== "together"
    ? { provider: settings.provider, model: settings.model, apiKey: settings.apiKey }
    : undefined;
  const res = await fetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jdText, company, role, location, seniority, sector, remote, buckets, profile, providerSettings }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Scoring failed: ${res.status}`);
  }
  return res.json();
}
