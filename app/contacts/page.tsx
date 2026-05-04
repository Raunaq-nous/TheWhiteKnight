"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header, Footer } from "../components";
import { Contact, ContactRole, getContacts, addContact, deleteContact, updateContact, searchContacts, markContacted } from "../../lib/contacts-store";

const ROLE_LABELS: Record<ContactRole, string> = {
  hiring_manager: "HM",
  referral_candidate: "REFERRAL",
  ceo: "CEO",
  executive: "EXEC",
  recruiter: "RECRUITER",
  other: "OTHER",
};

const ROLE_COLORS: Record<ContactRole, string> = {
  hiring_manager: "var(--accent)",
  referral_candidate: "#60a5fa",
  ceo: "var(--error)",
  executive: "#a78bfa",
  recruiter: "var(--text-secondary)",
  other: "var(--text-tertiary)",
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<Contact>>({ role: "hiring_manager", source: "manual", company: "", name: "" });

  const refresh = () => setContacts(getContacts());

  useEffect(() => {
    refresh();
    window.addEventListener("careeros-contacts-change", refresh);
    return () => window.removeEventListener("careeros-contacts-change", refresh);
  }, []);

  const filtered = query ? searchContacts(query) : contacts;

  const handleAdd = () => {
    if (!draft.name || !draft.company) return;
    addContact({
      name: draft.name,
      title: draft.title,
      company: draft.company,
      role: (draft.role ?? "hiring_manager") as ContactRole,
      linkedinUrl: draft.linkedinUrl,
      email: draft.email,
      location: draft.location,
      source: "manual",
      notes: draft.notes,
    });
    setDraft({ role: "hiring_manager", source: "manual", company: "", name: "" });
    setAdding(false);
    refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        <div className="section-header">
          <span className="section-title">CONTACTS</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => setAdding(!adding)}>
              {adding ? "CANCEL" : "+ ADD CONTACT"}
            </button>
            <Link href="/" className="btn" style={{ textDecoration: "none" }}>BACK</Link>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, company, title, email, tag..."
            style={{ width: "100%", padding: "10px 14px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", borderRadius: "var(--radius)" }}
          />
        </div>

        {adding && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 20, marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 12 }}>NEW CONTACT</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input placeholder="Full name *" value={draft.name ?? ""} onChange={e => setDraft({ ...draft, name: e.target.value })} style={inputStyle} />
              <input placeholder="Company *" value={draft.company ?? ""} onChange={e => setDraft({ ...draft, company: e.target.value })} style={inputStyle} />
              <input placeholder="Title" value={draft.title ?? ""} onChange={e => setDraft({ ...draft, title: e.target.value })} style={inputStyle} />
              <select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value as ContactRole })} style={inputStyle}>
                <option value="hiring_manager">Hiring Manager</option>
                <option value="referral_candidate">Referral Candidate</option>
                <option value="ceo">CEO</option>
                <option value="executive">Executive</option>
                <option value="recruiter">Recruiter</option>
                <option value="other">Other</option>
              </select>
              <input placeholder="LinkedIn URL" value={draft.linkedinUrl ?? ""} onChange={e => setDraft({ ...draft, linkedinUrl: e.target.value })} style={inputStyle} />
              <input placeholder="Email" value={draft.email ?? ""} onChange={e => setDraft({ ...draft, email: e.target.value })} style={inputStyle} />
              <input placeholder="Location" value={draft.location ?? ""} onChange={e => setDraft({ ...draft, location: e.target.value })} style={inputStyle} />
              <input placeholder="Notes" value={draft.notes ?? ""} onChange={e => setDraft({ ...draft, notes: e.target.value })} style={inputStyle} />
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleAdd} disabled={!draft.name || !draft.company}>SAVE CONTACT</button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            {contacts.length === 0 ? "No contacts yet. Add one manually or use FIND CONTACTS on an application page." : "No matches."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {filtered.map(c => (
              <div key={c.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-primary)", fontWeight: 500 }}>{c.name}</div>
                    {c.title && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{c.title}</div>}
                    <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: 2 }}>{c.company}{c.location ? ` · ${c.location}` : ""}</div>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: ROLE_COLORS[c.role], textTransform: "uppercase", letterSpacing: "0.08em", border: `1px solid ${ROLE_COLORS[c.role]}`, padding: "2px 6px", borderRadius: 3 }}>
                    {ROLE_LABELS[c.role]}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {c.linkedinUrl && (
                    <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" style={smallBtn}>LINKEDIN</a>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} style={smallBtn}>{c.email}</a>
                  )}
                </div>
                {c.notes && <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{c.notes}</div>}
                <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.625rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  <span>{c.source.toUpperCase()}{c.lastContactedAt ? ` · CONTACTED ${c.lastContactedAt.split("T")[0]}` : ""}</span>
                  <button onClick={() => { if (confirm(`Delete ${c.name}?`)) { deleteContact(c.id); refresh(); } }} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "0.625rem" }}>DELETE</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "var(--bg-primary)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.75rem",
  borderRadius: "var(--radius)",
};

const smallBtn: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.5rem",
  color: "var(--accent)",
  textDecoration: "none",
  border: "1px solid var(--border)",
  padding: "3px 6px",
  borderRadius: 3,
  letterSpacing: "0.05em",
};
