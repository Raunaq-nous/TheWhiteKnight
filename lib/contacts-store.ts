// Contact store — reads from in-memory cache, writes through to server.

import {
  getCache,
  wt_addContact,
  wt_updateContact,
  wt_deleteContact,
} from "./data-cache";

export type ContactRole = "hiring_manager" | "referral_candidate" | "ceo" | "executive" | "recruiter" | "other";

export type Contact = {
  id: string;
  name: string;
  title?: string;
  company: string;
  companyId?: string;
  role: ContactRole;
  linkedinUrl?: string;
  email?: string;
  emailVerified?: boolean;
  phone?: string;
  location?: string;
  source: "exa" | "apollo" | "manual" | "rocketreach";
  notes?: string;
  tags: string[];
  createdAt: string;
  lastContactedAt?: string;
  applicationSlugs: string[];
};

export function getContacts(): Contact[] {
  return getCache().contacts.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

export function getContactsByCompany(company: string): Contact[] {
  const lower = company.toLowerCase();
  return getCache().contacts.filter(c =>
    c.company.toLowerCase().includes(lower) || lower.includes(c.company.toLowerCase())
  );
}

export function getContactsByApplication(slug: string): Contact[] {
  return getCache().contacts.filter(c => c.applicationSlugs.includes(slug));
}

export function searchContacts(query: string): Contact[] {
  if (!query) return getContacts();
  const q = query.toLowerCase();
  return getCache().contacts.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.company.toLowerCase().includes(q) ||
    (c.title?.toLowerCase().includes(q) ?? false) ||
    (c.email?.toLowerCase().includes(q) ?? false) ||
    c.tags.some(t => t.toLowerCase().includes(q))
  );
}

export function addContact(c: Omit<Contact, "id" | "createdAt" | "tags" | "applicationSlugs"> & { tags?: string[]; applicationSlugs?: string[] }): Promise<Contact> {
  return wt_addContact(c);
}

export function updateContact(id: string, changes: Partial<Contact>): void {
  wt_updateContact(id, changes).catch(e => console.error("[CareerOS] updateContact failed:", e));
}

export function deleteContact(id: string): void {
  wt_deleteContact(id).catch(e => console.error("[CareerOS] deleteContact failed:", e));
}

export function markContacted(id: string): void {
  updateContact(id, { lastContactedAt: new Date().toISOString() });
}

export function attachContactToApplication(contactId: string, slug: string): void {
  const c = getCache().contacts.find(x => x.id === contactId);
  if (!c || c.applicationSlugs.includes(slug)) return;
  updateContact(contactId, { applicationSlugs: [...c.applicationSlugs, slug] });
}
