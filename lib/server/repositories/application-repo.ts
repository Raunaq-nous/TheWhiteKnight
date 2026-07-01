import "server-only";
import { getDb } from "../db";
import type { Application } from "../../store";
import type { ApplicationRepository } from "./types";

export const applicationRepo: ApplicationRepository = {
  list(userEmail) {
    const db = getDb();
    const rows = db.prepare(
      "SELECT data FROM applications WHERE user_email = ? ORDER BY updated_at DESC"
    ).all(userEmail) as { data: string }[];
    return rows.map(r => JSON.parse(r.data) as Application).map(addDays);
  },

  get(userEmail, slug) {
    const db = getDb();
    const row = db.prepare(
      "SELECT data FROM applications WHERE user_email = ? AND slug = ?"
    ).get(userEmail, slug) as { data: string } | undefined;
    return row ? addDays(JSON.parse(row.data)) : undefined;
  },

  getById(userEmail, id) {
    const db = getDb();
    const row = db.prepare(
      "SELECT data FROM applications WHERE user_email = ? AND id = ?"
    ).get(userEmail, id) as { data: string } | undefined;
    return row ? addDays(JSON.parse(row.data)) : undefined;
  },

  save(userEmail, app) {
    const db = getDb();
    const now = new Date().toISOString();
    const record = { ...app, updatedAt: now };
    db.prepare(`
      INSERT INTO applications (user_email, id, slug, status, score, bucket, updated_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_email, id) DO UPDATE SET
        slug = excluded.slug, status = excluded.status, score = excluded.score,
        bucket = excluded.bucket, updated_at = excluded.updated_at, data = excluded.data
    `).run(userEmail, app.id, app.slug, app.status, app.score, app.bucket, now, JSON.stringify(record));
  },

  update(userEmail, id, changes) {
    const existing = applicationRepo.getById(userEmail, id);
    if (!existing) return;
    applicationRepo.save(userEmail, { ...existing, ...changes });
  },

  delete(userEmail, id) {
    getDb().prepare("DELETE FROM applications WHERE user_email = ? AND id = ?").run(userEmail, id);
  },
};

function addDays(app: Application): Application {
  return {
    ...app,
    days: Math.floor((Date.now() - new Date(app.capturedAt).getTime()) / (1000 * 60 * 60 * 24)),
  };
}
