"use client";

import { useState } from "react";

export default function AdminSetupPage() {
  const [password, setPassword] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: password, setupSecret }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.25rem", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.1em", marginBottom: 8, textAlign: "center" }}>
          CAREEROS
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 32, textAlign: "center" }}>
          Admin Account Setup (one-time)
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 32 }}>
          {result?.ok && (
            <div style={{ background: "rgba(0,200,100,0.1)", border: "1px solid var(--success)", padding: "12px 16px", borderRadius: "var(--radius)", marginBottom: 20, fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--success)" }}>
              Admin account created for raunaq1509@gmail.com. Go to{" "}
              <a href="/login" style={{ color: "var(--accent)" }}>/login</a> and sign in.
            </div>
          )}
          {result?.error && (
            <div style={{ background: "rgba(255,50,50,0.1)", border: "1px solid var(--error)", padding: "12px 16px", borderRadius: "var(--radius)", marginBottom: 20, fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--error)" }}>
              {result.error}
            </div>
          )}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-secondary)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                SETUP SECRET (from Vercel env var)
              </label>
              <input
                type="password"
                value={setupSecret}
                onChange={e => setSetupSecret(e.target.value)}
                required
                style={{ width: "100%", padding: "10px 12px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", borderRadius: "var(--radius)" }}
              />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-secondary)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                YOUR PASSWORD (min 8 chars)
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                style={{ width: "100%", padding: "10px 12px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", borderRadius: "var(--radius)" }}
              />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%", padding: 12, justifyContent: "center", marginTop: 8 }}>
              {loading ? "CREATING..." : "CREATE ADMIN ACCOUNT"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
