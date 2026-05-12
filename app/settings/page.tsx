"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header, Footer } from "../components";
import { MODEL_OPTIONS, getModelSettings, saveModelSettings, ModelProvider } from "../../lib/model-settings";
import { INTEGRATION_OPTIONS, getIntegrationSettings, saveIntegrationSettings, IntegrationSettings } from "../../lib/integration-settings";

type InviteCode = { code: string; used: boolean; usedBy: string | null; createdAt: string };

export default function SettingsPage() {
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>("together");
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({ anthropic: "", openai: "" });
  const [saved, setSaved] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationSettings>({});
  const [intSaved, setIntSaved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    const s = getModelSettings();
    setSelectedProvider(s.provider);
    if (s.apiKey) {
      setApiKeys(prev => ({ ...prev, [s.provider]: s.apiKey! }));
    }
    setIntegrations(getIntegrationSettings());
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.user?.isAdmin) {
        setIsAdmin(true);
        fetch("/api/admin/invite").then(r => r.json()).then(d2 => {
          if (d2.codes) setInviteCodes(d2.codes);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const handleGenerateInvite = async () => {
    setInviteLoading(true);
    setNewCode(null);
    try {
      const res = await fetch("/api/admin/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.code) {
        setNewCode(data.code);
        setInviteCodes(prev => [{ code: data.code, used: false, usedBy: null, createdAt: new Date().toISOString() }, ...prev]);
      }
    } catch {
      /* ignore */
    } finally {
      setInviteLoading(false);
    }
  };

  const copyInviteLink = (code: string) => {
    const url = `${window.location.origin}/register?invite=${code}`;
    navigator.clipboard.writeText(url).then(() => { setCopiedCode(code); setTimeout(() => setCopiedCode(null), 2000); }).catch(() => {});
  };

  const handleIntSave = () => {
    saveIntegrationSettings(integrations);
    setIntSaved(true);
    setTimeout(() => setIntSaved(false), 2000);
  };

  const selectedOption = MODEL_OPTIONS.find(o => o.provider === selectedProvider)!;

  const handleSave = () => {
    const apiKey = selectedOption.requiresKey ? apiKeys[selectedProvider] : undefined;
    saveModelSettings({ provider: selectedProvider, model: selectedOption.model, apiKey });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1, maxWidth: 700 }}>
        <div className="section-header">
          <span className="section-title">SETTINGS</span>
          <Link href="/" className="btn" style={{ textDecoration: "none" }}>BACK</Link>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 24 }}>
          <div className="label" style={{ marginBottom: 16 }}>AI MODEL</div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
            All AI calls run on the server — your API key is sent with each request but never stored server-side. DeepSeek is included by default; bring your own key for Claude or OpenAI.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {MODEL_OPTIONS.map(opt => {
              const isSelected = selectedProvider === opt.provider;
              return (
                <div
                  key={opt.provider}
                  onClick={() => setSelectedProvider(opt.provider)}
                  style={{
                    border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: "var(--radius)",
                    padding: 16,
                    cursor: "pointer",
                    background: isSelected ? "rgba(255,165,0,0.04)" : "var(--bg-primary)",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: "50%",
                        border: `2px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                        background: isSelected ? "var(--accent)" : "transparent",
                        flexShrink: 0,
                      }} />
                      <div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-primary)" }}>{opt.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-tertiary)", marginLeft: 8 }}>{opt.sublabel}</span>
                      </div>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: opt.requiresKey ? "var(--text-tertiary)" : "var(--success)" }}>
                      {opt.pricing}
                    </span>
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: 24, lineHeight: 1.5 }}>
                    {opt.description}
                  </p>

                  {isSelected && opt.requiresKey && (
                    <div style={{ marginTop: 12, marginLeft: 24 }} onClick={e => e.stopPropagation()}>
                      <label className="label" style={{ display: "block", marginBottom: 6, fontSize: "0.625rem" }}>
                        API KEY
                        {" "}
                        <a href={opt.keyLink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                          Get key →
                        </a>
                      </label>
                      <input
                        type="password"
                        value={apiKeys[opt.provider] || ""}
                        onChange={e => setApiKeys(prev => ({ ...prev, [opt.provider]: e.target.value }))}
                        placeholder={opt.keyPlaceholder}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          background: "var(--bg-primary)",
                          border: "1px solid var(--border)",
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.75rem",
                          borderRadius: "var(--radius)",
                        }}
                      />
                      <p style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", marginTop: 6, lineHeight: 1.4 }}>
                        Stored in your browser only. Sent with each AI request. Never persisted on our servers.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 16, alignItems: "center" }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={selectedOption.requiresKey && !apiKeys[selectedProvider]}
              style={{ padding: "12px 24px" }}
            >
              SAVE SETTINGS
            </button>
            {saved && (
              <span style={{ color: "var(--success)", fontSize: "0.875rem", fontFamily: "var(--font-mono)" }}>
                SAVED
              </span>
            )}
            {selectedOption.requiresKey && !apiKeys[selectedProvider] && (
              <span style={{ color: "var(--text-tertiary)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
                Enter API key to save
              </span>
            )}
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 24 }}>
          <div className="label" style={{ marginBottom: 16 }}>INTEGRATIONS</div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
            Optional API keys for contact discovery (Exa, Apollo), email sending (Resend), and email verification (Hunter). All keys are stored only in your browser. Free tiers are sufficient for most users.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {INTEGRATION_OPTIONS.map(opt => (
              <div key={opt.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 12 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-primary)" }}>{opt.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--success)", whiteSpace: "nowrap" }}>{opt.pricing}</span>
                </div>
                <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>{opt.description}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(opt as any).secondaryKeyField && (
                    <input
                      type="text"
                      value={(integrations[(opt as any).secondaryKeyField as keyof typeof integrations] as string) || ""}
                      onChange={e => setIntegrations(prev => ({ ...prev, [(opt as any).secondaryKeyField]: e.target.value }))}
                      placeholder={(opt as any).secondaryKeyPlaceholder}
                      style={{ width: "100%", padding: "6px 10px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", borderRadius: "var(--radius)" }}
                    />
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="password"
                      value={(integrations[opt.keyField] as string) || ""}
                      onChange={e => setIntegrations(prev => ({ ...prev, [opt.keyField]: e.target.value }))}
                      placeholder={opt.keyPlaceholder}
                      style={{ flex: 1, padding: "6px 10px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", borderRadius: "var(--radius)" }}
                    />
                    <a href={opt.keyLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.625rem", color: "var(--accent)", textDecoration: "none", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>GET KEY →</a>
                  </div>
                </div>
              </div>
            ))}
            <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 14 }}>
              <div className="label" style={{ marginBottom: 8 }}>SENDER IDENTITY (FOR EMAIL SEND)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input
                  type="text"
                  value={integrations.senderName || ""}
                  onChange={e => setIntegrations(prev => ({ ...prev, senderName: e.target.value }))}
                  placeholder="Your Name"
                  style={{ padding: "6px 10px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", borderRadius: "var(--radius)" }}
                />
                <input
                  type="email"
                  value={integrations.senderEmail || ""}
                  onChange={e => setIntegrations(prev => ({ ...prev, senderEmail: e.target.value }))}
                  placeholder="you@yourdomain.com (verified in Resend)"
                  style={{ padding: "6px 10px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", borderRadius: "var(--radius)" }}
                />
              </div>
              <p style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", marginTop: 6, lineHeight: 1.4 }}>
                Sender domain must be verified in Resend. Verify at resend.com/domains before sending.
              </p>
            </div>
          </div>
          <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
            <button className="btn btn-primary" onClick={handleIntSave} style={{ padding: "10px 20px" }}>SAVE INTEGRATIONS</button>
            {intSaved && <span style={{ color: "var(--success)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>SAVED</span>}
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: isAdmin ? 24 : 0 }}>
          <div className="label" style={{ marginBottom: 12 }}>DATA</div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            All your data (profile, applications, skill plans) is stored in your browser's local storage. Nothing is sent to a server except the content of each AI request.
          </p>
        </div>

        {isAdmin && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div className="label">INVITE CODES</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 2 }}>ADMIN ONLY</div>
              </div>
              <button className="btn btn-primary" onClick={handleGenerateInvite} disabled={inviteLoading} style={{ padding: "8px 16px" }}>
                {inviteLoading ? "GENERATING..." : "GENERATE INVITE"}
              </button>
            </div>

            {newCode && (
              <div style={{ background: "rgba(0,200,100,0.08)", border: "1px solid var(--success)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 16 }}>
                <div className="label" style={{ fontSize: "0.625rem", color: "var(--success)", marginBottom: 4 }}>NEW INVITE CODE GENERATED</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.25rem", color: "var(--success)", letterSpacing: "0.15em", marginBottom: 8 }}>{newCode}</div>
                <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px", borderColor: "var(--success)", color: "var(--success)" }} onClick={() => copyInviteLink(newCode)}>
                  {copiedCode === newCode ? "COPIED!" : "COPY INVITE LINK"}
                </button>
                <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
                  Link: {typeof window !== "undefined" ? window.location.origin : ""}/register?invite={newCode}
                </div>
              </div>
            )}

            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5 }}>
              Share the invite link with the person you want to invite. They use it to register at <code style={{ background: "var(--bg-primary)", padding: "1px 4px", fontSize: "0.7rem" }}>/register</code>. Each code can only be used once.
            </div>

            {inviteCodes.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {inviteCodes.map(ic => (
                  <div key={ic.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--bg-primary)", borderRadius: "var(--radius)", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", letterSpacing: "0.1em", color: ic.used ? "var(--text-tertiary)" : "var(--text-primary)", flex: 1 }}>{ic.code}</span>
                    {ic.used ? (
                      <span style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>USED by {ic.usedBy}</span>
                    ) : (
                      <button className="btn" style={{ fontSize: "0.5rem", padding: "3px 8px" }} onClick={() => copyInviteLink(ic.code)}>
                        {copiedCode === ic.code ? "COPIED!" : "COPY LINK"}
                      </button>
                    )}
                    <span style={{ fontSize: "0.5rem", color: ic.used ? "var(--error)" : "var(--success)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>{ic.used ? "USED" : "OPEN"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>NO INVITE CODES YET. GENERATE ONE TO INVITE A USER.</p>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
