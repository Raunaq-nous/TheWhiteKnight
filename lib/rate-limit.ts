// In-memory sliding window rate limiter. Resets on process restart.
// Not suitable for multi-instance deploys — use Redis-backed limiter for that.
type Window = { timestamps: number[] };
const store = new Map<string, Window>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSecs: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  const entry = store.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    const retryAfterSecs = Math.ceil((oldest + windowMs - now) / 1000);
    store.set(key, entry);
    return { allowed: false, retryAfterSecs };
  }
  entry.timestamps.push(now);
  store.set(key, entry);
  return { allowed: true, retryAfterSecs: 0 };
}
