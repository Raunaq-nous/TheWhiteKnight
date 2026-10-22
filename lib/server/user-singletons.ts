import "server-only";
// Small per-user JSON blobs in the singletons table (fingerprint index,
// alert-inbox state, career-track preferences...). Repositories own the
// established keys; this is for newer, feature-local state.
import { getDb } from "./db";

export function getUserSingleton<T>(userEmail: string, key: string): T | null {
  const row = getDb().prepare("SELECT data FROM singletons WHERE user_email = ? AND key = ?").get(userEmail, key) as { data: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.data) as T; } catch { return null; }
}

export function setUserSingleton(userEmail: string, key: string, value: unknown): void {
  getDb().prepare(`
    INSERT INTO singletons (user_email, key, data, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_email, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(userEmail, key, JSON.stringify(value), new Date().toISOString());
}
