import "server-only";
import fs from "fs";
import path from "path";
import { getDb } from "../db";
import type { Profile } from "../../profile";
import type { ProfileRepository } from "./types";

const KEY = "profile";

export const profileRepo: ProfileRepository = {
  get(userEmail) {
    const db = getDb();
    const row = db.prepare(
      "SELECT data FROM singletons WHERE user_email = ? AND key = ?"
    ).get(userEmail, KEY) as { data: string } | undefined;
    if (!row) return null;
    try { return JSON.parse(row.data) as Profile; } catch { return null; }
  },

  has(userEmail) {
    const db = getDb();
    const row = db.prepare(
      "SELECT 1 FROM singletons WHERE user_email = ? AND key = ?"
    ).get(userEmail, KEY);
    return !!row;
  },

  save(userEmail, profile) {
    const db = getDb();
    const now = new Date().toISOString();
    const record = { ...profile, updatedAt: now };
    db.prepare(`
      INSERT INTO singletons (user_email, key, data, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_email, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run(userEmail, KEY, JSON.stringify(record), now);
  },

  // Seed from private/admin-profile.json only if:
  //   1. The requesting user is the ADMIN_EMAIL account
  //   2. No profile exists yet for that user
  seedIfEmpty(userEmail, adminEmail) {
    if (userEmail !== adminEmail) return;
    if (profileRepo.has(userEmail)) return;
    const seedPath = path.join(process.cwd(), "private", "admin-profile.json");
    if (!fs.existsSync(seedPath)) return;
    try {
      const seed = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as Profile;
      profileRepo.save(userEmail, seed);
    } catch {
      // Malformed seed file — skip silently.
    }
  },
};
