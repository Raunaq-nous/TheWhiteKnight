// Local contact store. Saved profiles discovered via Exa/Apollo or added manually.
// Per-user (lives in browser localStorage).

export type ContactRole = "hiring_manager" | "referral_candidate" | "ceo" | "executive" | "recruiter" | "other";

export type Contact = {
  id: string;
  name: string;
  title?: string;
  company: string;
  companyId?: string;       // matches CompanyTarget.id when known
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
  applicationSlugs: string[]; // which applications this contact is associated with
};

const KEY = "careeros_contacts";

function load(): Contact[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

function save(contacts: Contact[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(contacts));
  window.dispatchEvent(new Event("careeros-contacts-change"));
}

export function getContacts(): Contact[] {
  return load().sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

export function getContactsByCompany(company: string): Contact[] {
  const lower = company.toLowerCase();
  return load().filter(c => c.company.toLowerCase().includes(lower) || lower.includes(c.company.toLowerCase()));
}

export function getContactsByApplication(slug: string): Contact[] {
  return load().filter(c => c.applicationSlugs.includes(slug));
}

export function searchContacts(query: string): Contact[] {
  if (!query) return load();
  const q = query.toLowerCase();
  return load().filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.company.toLowerCase().includes(q) ||
    (c.title?.toLowerCase().includes(q) ?? false) ||
    (c.email?.toLowerCase().includes(q) ?? false) ||
    c.tags.some(t => t.toLowerCase().includes(q))
  );
}

export function addContact(c: Omit<Contact, "id" | "createdAt" | "tags" | "applicationSlugs"> & { tags?: string[]; applicationSlugs?: string[] }): Contact {
  const all = load();
  const newContact: Contact = {
    ...c,
    id: Math.random().toString(36).slice(2, 12),
    createdAt: new Date().toISOString(),
    tags: c.tags ?? [],
    applicationSlugs: c.applicationSlugs ?? [],
  };
  // Dedupe by linkedinUrl or email + name
  const exists = all.find(x =>
    (newContact.linkedinUrl && x.linkedinUrl === newContact.linkedinUrl) ||
    (newContact.email && x.email === newContact.email) ||
    (x.name === newContact.name && x.company === newContact.company)
  );
  if (exists) {
    Object.assign(exists, { ...newContact, id: exists.id, createdAt: exists.createdAt, applicationSlugs: Array.from(new Set([...exists.applicationSlugs, ...newContact.applicationSlugs])) });
    save(all);
    return exists;
  }
  all.push(newContact);
  save(all);
  return newContact;
}

export function updateContact(id: string, changes: Partial<Contact>) {
  const all = load();
  const idx = all.findIndex(c => c.id === id);
  if (idx >= 0) { all[idx] = { ...all[idx], ...changes }; save(all); }
}

export function deleteContact(id: string) {
  save(load().filter(c => c.id !== id));
}

export function markContacted(id: string) {
  updateContact(id, { lastContactedAt: new Date().toISOString() });
}

export function attachContactToApplication(contactId: string, slug: string) {
  const all = load();
  const c = all.find(x => x.id === contactId);
  if (c && !c.applicationSlugs.includes(slug)) {
    c.applicationSlugs.push(slug);
    save(all);
  }
}
