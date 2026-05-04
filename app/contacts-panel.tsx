"use client";

import { useState } from "react";
import { Application } from "../lib/store";
import { Profile } from "../lib/profile";
import { addContact, Contact } from "../lib/contacts-store";
import { getIntegrationSettings } from "../lib/integration-settings";
import { generateHMOutreach, generateLinkedInDM, generateReferralDM, generateCEOColdEmail, ContactProfile } from "../lib/generate";
import { queueDM, queueOutreach, queueReferralDM, queueCEOEmail } from "../lib/notifications";

type SearchType = "hiring_manager" | "referral_candidate" | "ceo" | "executive";

type ContactCard = {
  name: string;
  title?: string;
  company: string;
  linkedinUrl?: string;
  email?: string;
  location?: string;
  source: "exa" | "apollo";
  confidence: "high" | "medium" | "low";
  snippet?: string;
};

const SEARCH_LABELS: Record<SearchType, string> = {
  hiring_manager: "HIRING MANAGER",
  referral_candidate: "REFERRAL",
  ceo: "CEO",
  executive: "EXECUTIVE",
};

export function ContactsPanel({ app, profile, onClose }: { app: Application; profile: Profile; onClose: () => void }) {
  const [searchType, setSearchType] = useState<SearchType>("hiring_manager");
  const [results, setResults] = useState<ContactCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drafting, setDrafting] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const search = async () => {
    setLoading(true);
    setError("");
    setResults([]);
    const integ = getIntegrationSettings();
    if (!integ.exaApiKey && !integ.apolloApiKey) {
      setError("Add an Exa.ai or Apollo.io key in Settings → Integrations to search.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/contacts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: app.company,
          role: searchType,
          jobRole: app.role,
          location: app.location,
          exaApiKey: integ.exaApiKey,
          apolloApiKey: integ.apolloApiKey,
          numResults: 10,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.contacts ?? []);
      if (data.contacts?.length === 0) setError("No matches found. Try a different role type.");
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const saveAndDraft = async (c: ContactCard, action: "dm" | "referral" | "outreach" | "ceo-email") => {
    const target: ContactProfile = {
      name: c.name,
      title: c.title,
      company: c.company,
      linkedinUrl: c.linkedinUrl,
      location: c.location,
      role: searchType === "ceo" ? "ceo" : searchType === "executive" ? "executive" : searchType,
    };
    const cardKey = c.linkedinUrl ?? c.email ?? c.name;
    setDrafting(`${cardKey}-${action}`);

    const stored: Contact = addContact({
      name: c.name,
      title: c.title,
      company: c.company,
      role: searchType === "ceo" ? "ceo" : searchType === "executive" ? "executive" : searchType,
      linkedinUrl: c.linkedinUrl,
      email: c.email,
      location: c.location,
      source: c.source,
      applicationSlugs: [app.slug],
    });
    setSavedIds(prev => new Set(prev).add(cardKey));

    try {
      let content = "";
      if (action === "dm") {
        content = await generateLinkedInDM(profile, app, target);
        queueDM(app.slug, app.company, app.role, content, { name: c.name, linkedinUrl: c.linkedinUrl, contactId: stored.id });
      } else if (action === "referral") {
        content = await generateReferralDM(profile, app, target);
        queueReferralDM(app.slug, app.company, app.role, content, { name: c.name, linkedinUrl: c.linkedinUrl, contactId: stored.id });
      } else if (action === "outreach") {
        content = await generateHMOutreach(profile, app, target);
        queueOutreach(app.slug, app.company, app.role, content, { name: c.name, email: c.email, linkedinUrl: c.linkedinUrl, contactId: stored.id });
      } else if (action === "ceo-email") {
        content = await generateCEOColdEmail(profile, app, target);
        queueCEOEmail(app.slug, app.company, app.role, content, { name: c.name, email: c.email, linkedinUrl: c.linkedinUrl, contactId: stored.id });
      }
    } catch (e: any) {
      setError(`Draft failed: ${e.message}`);
    } finally {
      setDrafting(null);
    }
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div className="label" style={{ color: "var(--accent)" }}>FIND CONTACTS AT {app.company.toUpperCase()}</div>
        <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={onClose}>CLOSE</button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {(["hiring_manager", "referral_candidate", "ceo", "executive"] as SearchType[]).map(t => (
          <button
            key={t}
            className="btn"
            onClick={() => setSearchType(t)}
            style={{
              fontSize: "0.625rem",
              padding: "5px 10px",
              borderColor: searchType === t ? "var(--accent)" : "var(--border)",
              color: searchType === t ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            {SEARCH_LABELS[t]}
          </button>
        ))}
        <button className="btn btn-primary" onClick={search} disabled={loading} style={{ marginLeft: "auto" }}>
          {loading ? "SEARCHING..." : "SEARCH"}
        </button>
      </div>

      {error && <div style={{ color: "var(--error)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", marginBottom: 8 }}>{error}</div>}

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 500, overflowY: "auto" }}>
          {results.map((c, i) => {
            const cardKey = c.linkedinUrl ?? c.email ?? `${c.name}-${i}`;
            const isSaved = savedIds.has(cardKey);
            return (
              <div key={cardKey} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius)", padding: 12, background: "var(--bg-primary)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 500 }}>{c.name}</div>
                    {c.title && <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{c.title}</div>}
                    {c.location && <div style={{ fontSize: "0.65rem", color: "var(--text-tertiary)" }}>{c.location}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: c.confidence === "high" ? "var(--success)" : c.confidence === "medium" ? "var(--accent)" : "var(--text-tertiary)", border: "1px solid currentColor", padding: "2px 5px", borderRadius: 3 }}>{c.confidence.toUpperCase()}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: "var(--text-tertiary)", border: "1px solid var(--border)", padding: "2px 5px", borderRadius: 3 }}>{c.source.toUpperCase()}</span>
                  </div>
                </div>
                {c.snippet && <div style={{ fontSize: "0.65rem", color: "var(--text-tertiary)", lineHeight: 1.4, marginBottom: 8 }}>{c.snippet}</div>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {c.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" style={smallLink}>LINKEDIN ↗</a>}
                  {c.email && <a href={`mailto:${c.email}`} style={smallLink}>{c.email}</a>}
                  {isSaved && <span style={{ fontSize: "0.5rem", color: "var(--success)", fontFamily: "var(--font-mono)" }}>✓ SAVED</span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {searchType === "hiring_manager" && (
                    <>
                      <button className="btn" onClick={() => saveAndDraft(c, "outreach")} disabled={!!drafting} style={draftBtn}>
                        {drafting === `${cardKey}-outreach` ? "DRAFTING..." : "DRAFT EMAIL"}
                      </button>
                      <button className="btn" onClick={() => saveAndDraft(c, "dm")} disabled={!!drafting} style={draftBtn}>
                        {drafting === `${cardKey}-dm` ? "DRAFTING..." : "DRAFT DM"}
                      </button>
                    </>
                  )}
                  {searchType === "referral_candidate" && (
                    <button className="btn" onClick={() => saveAndDraft(c, "referral")} disabled={!!drafting} style={draftBtn}>
                      {drafting === `${cardKey}-referral` ? "DRAFTING..." : "DRAFT REFERRAL DM"}
                    </button>
                  )}
                  {searchType === "ceo" && (
                    <button className="btn" onClick={() => saveAndDraft(c, "ceo-email")} disabled={!!drafting} style={{ ...draftBtn, borderColor: "var(--error)", color: "var(--error)" }}>
                      {drafting === `${cardKey}-ceo-email` ? "DRAFTING..." : "DRAFT CEO COLD EMAIL"}
                    </button>
                  )}
                  {searchType === "executive" && (
                    <>
                      <button className="btn" onClick={() => saveAndDraft(c, "outreach")} disabled={!!drafting} style={draftBtn}>
                        {drafting === `${cardKey}-outreach` ? "DRAFTING..." : "DRAFT EMAIL"}
                      </button>
                      <button className="btn" onClick={() => saveAndDraft(c, "dm")} disabled={!!drafting} style={draftBtn}>DRAFT DM</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 12, fontSize: "0.625rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
          Drafted messages appear in your INBOX (top right). Review and send from there.
        </div>
      )}
    </div>
  );
}

const smallLink: React.CSSProperties = {
  fontSize: "0.5rem",
  color: "var(--accent)",
  textDecoration: "none",
  fontFamily: "var(--font-mono)",
  border: "1px solid var(--border)",
  padding: "2px 6px",
  borderRadius: 3,
};

const draftBtn: React.CSSProperties = {
  fontSize: "0.625rem",
  padding: "4px 10px",
};
