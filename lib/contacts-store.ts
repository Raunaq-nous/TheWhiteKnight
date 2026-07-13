// Contact store — reads from in-memory cache, writes through to server.

import {
  getCache,
  wt_addContact,
  wt_updateContact,
  wt_deleteContact,
} from "./data-cache";
import { showToast } from "./toast";

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

export async function updateContact(id: string, changes: Partial<Contact>): Promise<boolean> {
  try {
    await wt_updateContact(id, changes);
    return true;
  } catch (e: any) {
    console.error("[CareerOS] updateContact failed:", e);
    showToast(e?.message ?? "Failed to update contact", "error");
    return false;
  }
}

export async function deleteContact(id: string): Promise<boolean> {
  try {
    await wt_deleteContact(id);
    return true;
  } catch (e: any) {
    console.error("[CareerOS] deleteContact failed:", e);
    showToast(e?.message ?? "Failed to delete contact", "error");
    return false;
  }
}

export function markContacted(id: string): Promise<boolean> {
  return updateContact(id, { lastContactedAt: new Date().toISOString() });
}

export function attachContactToApplication(contactId: string, slug: string): Promise<boolean> {
  const c = getCache().contacts.find(x => x.id === contactId);
  if (!c || c.applicationSlugs.includes(slug)) return Promise.resolve(true);
  return updateContact(contactId, { applicationSlugs: [...c.applicationSlugs, slug] });
}
