import "server-only";
import { getDb } from "../db";
import type { Contact } from "../../contacts-store";
import type { ContactRepository } from "./types";

export const contactRepo: ContactRepository = {
  list(userEmail) {
    const rows = getDb().prepare(
      "SELECT data FROM contacts WHERE user_email = ? ORDER BY updated_at DESC"
    ).all(userEmail) as { data: string }[];
    return rows.map(r => JSON.parse(r.data) as Contact);
  },

  search(userEmail, query) {
    if (!query) return contactRepo.list(userEmail);
    const q = query.toLowerCase();
    return contactRepo.list(userEmail).filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      (c.title?.toLowerCase().includes(q) ?? false) ||
      (c.email?.toLowerCase().includes(q) ?? false) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    );
  },

  getByCompany(userEmail, company) {
    const lower = company.toLowerCase();
    return contactRepo.list(userEmail).filter(c =>
      c.company.toLowerCase().includes(lower) || lower.includes(c.company.toLowerCase())
    );
  },

  getByApplication(userEmail, slug) {
    return contactRepo.list(userEmail).filter(c => c.applicationSlugs.includes(slug));
  },

  add(userEmail, c) {
    const db = getDb();
    const all = contactRepo.list(userEmail);
    const newContact: Contact = {
      ...c,
      id: Math.random().toString(36).slice(2, 12),
      createdAt: new Date().toISOString(),
      tags: c.tags ?? [],
      applicationSlugs: c.applicationSlugs ?? [],
    };
    // Dedupe by linkedinUrl, email, or name+company
    const existing = all.find(x =>
      (newContact.linkedinUrl && x.linkedinUrl === newContact.linkedinUrl) ||
      (newContact.email && x.email === newContact.email) ||
      (x.name === newContact.name && x.company === newContact.company)
    );
    if (existing) {
      const merged = {
        ...existing,
        ...newContact,
        id: existing.id,
        createdAt: existing.createdAt,
        applicationSlugs: Array.from(new Set([...existing.applicationSlugs, ...newContact.applicationSlugs])),
      };
      upsertContact(db, userEmail, merged);
      return merged;
    }
    upsertContact(db, userEmail, newContact);
    return newContact;
  },

  update(userEmail, id, changes) {
    const db = getDb();
    const all = contactRepo.list(userEmail);
    const idx = all.findIndex(c => c.id === id);
    if (idx < 0) return;
    const updated = { ...all[idx], ...changes };
    upsertContact(db, userEmail, updated);
  },

  delete(userEmail, id) {
    getDb().prepare("DELETE FROM contacts WHERE user_email = ? AND id = ?").run(userEmail, id);
  },

  attachToApplication(userEmail, contactId, slug) {
    const db = getDb();
    const all = contactRepo.list(userEmail);
    const c = all.find(x => x.id === contactId);
    if (!c || c.applicationSlugs.includes(slug)) return;
    upsertContact(db, userEmail, { ...c, applicationSlugs: [...c.applicationSlugs, slug] });
  },
};

function upsertContact(db: ReturnType<typeof getDb>, userEmail: string, c: Contact) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO contacts (user_email, id, email, linkedin, updated_at, data)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_email, id) DO UPDATE SET
      email = excluded.email, linkedin = excluded.linkedin,
      updated_at = excluded.updated_at, data = excluded.data
  `).run(userEmail, c.id, c.email ?? null, c.linkedinUrl ?? null, now, JSON.stringify(c));
}
