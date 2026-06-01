import "server-only";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// DB lives in private/ (gitignored). Override with CAREEROS_DB_PATH env var.
function dbPath(): string {
  if (process.env.CAREEROS_DB_PATH) return process.env.CAREEROS_DB_PATH;
  const dir = path.join(process.cwd(), "private");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "careeros.db");
}

// Global cache survives Next.js dev hot-reload without re-opening the file.
declare global {
  // eslint-disable-next-line no-var
  var __careeros_db: Database.Database | undefined;
}

function openDb(): Database.Database {
  const db = new Database(dbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  return db;
}

function applySchema(db: Database.Database) {
  db.exec(`
    -- Collection tables: one row per entity, JSON blob + promoted index cols.
    CREATE TABLE IF NOT EXISTS applications (
      user_email  TEXT NOT NULL,
      id          TEXT NOT NULL,
      slug        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'sourced',
      score       REAL NOT NULL DEFAULT 0,
      bucket      TEXT NOT NULL DEFAULT '',
      updated_at  TEXT NOT NULL,
      data        TEXT NOT NULL,
      PRIMARY KEY (user_email, id)
    );

    CREATE INDEX IF NOT EXISTS idx_applications_user
      ON applications (user_email, updated_at DESC);

    CREATE TABLE IF NOT EXISTS contacts (
      user_email  TEXT NOT NULL,
      id          TEXT NOT NULL,
      email       TEXT,
      linkedin    TEXT,
      updated_at  TEXT NOT NULL,
      data        TEXT NOT NULL,
      PRIMARY KEY (user_email, id)
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_user
      ON contacts (user_email, updated_at DESC);

    CREATE TABLE IF NOT EXISTS notifications (
      user_email  TEXT NOT NULL,
      id          TEXT NOT NULL,
      dismissed   INTEGER NOT NULL DEFAULT 0,
      due_at      TEXT,
      updated_at  TEXT NOT NULL,
      data        TEXT NOT NULL,
      PRIMARY KEY (user_email, id)
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user
      ON notifications (user_email, dismissed, due_at);

    -- Singleton table: profile, skill plan/status, settings, batch state, etc.
    CREATE TABLE IF NOT EXISTS singletons (
      user_email  TEXT NOT NULL,
      key         TEXT NOT NULL,
      data        TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      PRIMARY KEY (user_email, key)
    );
  `);
}

export function getDb(): Database.Database {
  if (!global.__careeros_db) {
    global.__careeros_db = openDb();
  }
  return global.__careeros_db;
}
