"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const code = searchParams.get("invite");
    if (code) setInviteCode(code.toUpperCase());
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, inviteCode }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Registration failed"); return; }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.25rem", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.1em", marginBottom: 8 }}>
            CAREEROS
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Create your account
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 32 }}>
          <div style={{ background: "rgba(255,165,0,0.06)", border: "1px solid rgba(255,165,0,0.2)", padding: "10px 14px", borderRadius: "var(--radius)", marginBottom: 20, fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
            This app is invite-only. You need an invite code from Raunaq to create an account.
          </div>

          {error && (
            <div style={{ background: "rgba(255,50,50,0.1)", border: "1px solid var(--error)", padding: "10px 14px", borderRadius: "var(--radius)", marginBottom: 20, fontSize: "0.8rem", color: "var(--error)", fontFamily: "var(--font-mono)" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="label" style={{ display: "block", marginBottom: 6 }}>INVITE CODE</label>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                required
                placeholder="XXXXXXXX"
                style={{ width: "100%", padding: "10px 12px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", borderRadius: "var(--radius)", letterSpacing: "0.15em" }}
              />
            </div>
            <div>
              <label className="label" style={{ display: "block", marginBottom: 6 }}>EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{ width: "100%", padding: "10px 12px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", borderRadius: "var(--radius)" }}
              />
            </div>
            <div>
              <label className="label" style={{ display: "block", marginBottom: 6 }}>PASSWORD <span style={{ color: "var(--text-tertiary)" }}>(min 8 chars)</span></label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                style={{ width: "100%", padding: "10px 12px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", borderRadius: "var(--radius)" }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: "100%", padding: "12px", justifyContent: "center", marginTop: 8 }}
            >
              {loading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT"}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--accent)", textDecoration: "none" }}>
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>LOADING...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
