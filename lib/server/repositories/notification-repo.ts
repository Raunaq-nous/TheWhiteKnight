import "server-only";
import { getDb } from "../db";
import type { Notification } from "../../notifications";
import type { NotificationRepository } from "./types";

export const notificationRepo: NotificationRepository = {
  list(userEmail) {
    const rows = getDb().prepare(
      "SELECT data FROM notifications WHERE user_email = ? AND dismissed = 0 ORDER BY COALESCE(due_at, updated_at) ASC"
    ).all(userEmail) as { data: string }[];
    return rows.map(r => JSON.parse(r.data) as Notification);
  },

  add(userEmail, n) {
    const db = getDb();
    const id = Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    const record: Notification = { ...n, id, createdAt: now, dismissed: false };
    db.prepare(`
      INSERT INTO notifications (user_email, id, dismissed, due_at, updated_at, data)
      VALUES (?, ?, 0, ?, ?, ?)
    `).run(userEmail, id, n.dueAt ?? null, now, JSON.stringify(record));
    return id;
  },

  update(userEmail, id, changes) {
    const db = getDb();
    const row = db.prepare(
      "SELECT data FROM notifications WHERE user_email = ? AND id = ?"
    ).get(userEmail, id) as { data: string } | undefined;
    if (!row) return;
    const updated = { ...JSON.parse(row.data) as Notification, ...changes };
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE notifications SET dismissed = ?, updated_at = ?, data = ? WHERE user_email = ? AND id = ?
    `).run(updated.dismissed ? 1 : 0, now, JSON.stringify(updated), userEmail, id);
  },

  dismiss(userEmail, id) {
    notificationRepo.update(userEmail, id, { dismissed: true });
  },
};
