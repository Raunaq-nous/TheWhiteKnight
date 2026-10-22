import "server-only";
import { getDb } from "../db";
import { sanitiseFeedback, type FeedbackEvent, type FeedbackEventInput } from "../../feedback";

const KEEP_PER_USER = 2000;

export const feedbackRepo = {
  add(userEmail: string, event: FeedbackEventInput, at: string = new Date().toISOString()): FeedbackEvent | null {
    const clean = sanitiseFeedback(event);
    if (!clean) return null;
    const db = getDb();
    const r = db.prepare("INSERT INTO feedback_events (user_email, at, kind, data) VALUES (?, ?, ?, ?)").run(userEmail, at, clean.kind, JSON.stringify(clean));
    db.prepare(`DELETE FROM feedback_events WHERE user_email = ? AND id <= (SELECT MAX(id) FROM feedback_events WHERE user_email = ?) - ?`).run(userEmail, userEmail, KEEP_PER_USER);
    return { ...clean, id: Number(r.lastInsertRowid), at };
  },
  /** Most recent first. */
  recent(userEmail: string, limit = 200): FeedbackEvent[] {
    const rows = getDb().prepare("SELECT id, at, data FROM feedback_events WHERE user_email = ? ORDER BY id DESC LIMIT ?").all(userEmail, limit) as { id: number; at: string; data: string }[];
    return rows.map(r => ({ ...(JSON.parse(r.data) as FeedbackEventInput), id: r.id, at: r.at }));
  },
  counts(userEmail: string): Record<string, number> {
    const rows = getDb().prepare("SELECT kind, COUNT(*) AS n FROM feedback_events WHERE user_email = ? GROUP BY kind").all(userEmail) as { kind: string; n: number }[];
    return Object.fromEntries(rows.map(r => [r.kind, r.n]));
  },
};
