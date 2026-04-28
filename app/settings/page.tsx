"use client";

import { useState, useEffect } from "react";
import { Header, Footer } from "../components";
import { getApiKey, setApiKey } from "../../lib/store";

export default function SettingsPage() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setKey(getApiKey());
  }, []);

  const handleSave = () => {
    setApiKey(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1, maxWidth: 600 }}>
        <div className="section-header">
          <span className="section-title">APP SETTINGS</span>
          <span className="label">LOCAL STORAGE ONLY</span>
        </div>

        <div style={{ background: "var(--surface)", padding: 24, borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div style={{ marginBottom: 24 }}>
            <div className="label" style={{ color: "var(--accent)", marginBottom: 8 }}>ZERO DATABASE MODE (OPTION B)</div>
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              This app is running in 100% Serverless Mode. Your data is saved strictly to your device's local storage.
              To power the scoring and tailoring engine, paste your OpenAI API Key below. It will never be uploaded to GitHub or any backend server.
            </p>
          </div>

          <div>
            <label className="label" style={{ display: "block", marginBottom: 8 }}>OPENAI API KEY</label>
            <input 
              type="password" 
              className="input" 
              value={key} 
              onChange={e => setKey(e.target.value)} 
              placeholder="sk-..." 
              style={{ width: "100%", padding: 12, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }} 
            />
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 16, alignItems: "center" }}>
            <button className="btn btn-primary" onClick={handleSave} style={{ padding: "12px 24px" }}>
              SAVE TO DEVICE
            </button>
            {saved && <span style={{ color: "var(--success)", fontSize: "0.875rem", fontFamily: "var(--font-mono)" }}>SAVED SUCCESSFULLY</span>}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}