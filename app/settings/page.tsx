"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header, Footer } from "../components";
import { MODEL_OPTIONS, getModelSettings, saveModelSettings, ModelProvider } from "../../lib/model-settings";

export default function SettingsPage() {
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>("together");
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({ anthropic: "", openai: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const s = getModelSettings();
    setSelectedProvider(s.provider);
    if (s.apiKey) {
      setApiKeys(prev => ({ ...prev, [s.provider]: s.apiKey! }));
    }
  }, []);

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

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
          <div className="label" style={{ marginBottom: 12 }}>DATA</div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            All your data (profile, applications, skill plans) is stored in your browser's local storage. Nothing is sent to a server except the content of each AI request.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
