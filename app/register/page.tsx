"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import CodeBrain from "../code-brain";
import { Logo, ThemeToggle } from "../components";
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
    <div className="landing" style={{ minHeight: "100vh" }}>
      <div className="landing-canvas" aria-hidden="true">
        <CodeBrain phase={1.25} focusX={0.7} focusY={0.5} scale={0.34} reach={0.9} />
      </div>
      <div className="landing-veil" />
      <header className="container" style={{ position: "relative", zIndex: 3, maxWidth: "none", display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 22, paddingBottom: 22 }}>
        <Link href="/login" style={{ color: "inherit", textDecoration: "none" }}><Logo /></Link>
        <ThemeToggle />
      </header>
      <main className="landing-content">
        <section className="landing-section" style={{ minHeight: "calc(100vh - 80px)", paddingTop: 40 }}>
          <div className="container" style={{ maxWidth: "none" }}>
            <div className="eyebrow">Create account / invite only</div>
            <h1 className="display-md" style={{ marginTop: 24, maxWidth: "8ch" }}>
              Join the <span className="em">system.</span>
            </h1>
            <p className="lede" style={{ marginTop: 24 }}>
              CareerOS is invite-only. You need an invite code from Raunaq to create an account.
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 360, marginTop: 40 }} aria-label="Create account">
              {error && (
                <div role="alert" style={{ borderLeft: "1px solid var(--error)", padding: "4px 0 4px 12px", fontSize: "0.8125rem", color: "var(--error)", fontFamily: "var(--font-mono)" }}>
                  {error}
                </div>
              )}
              <label style={{ display: "block" }}>
                <span className="label" style={{ display: "block" }}>Invite code</span>
                <input className="field" type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} required placeholder="XXXXXXXX" style={{ letterSpacing: "0.15em" }} />
              </label>
              <label style={{ display: "block" }}>
                <span className="label" style={{ display: "block" }}>Email</span>
                <input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </label>
              <label style={{ display: "block" }}>
                <span className="label" style={{ display: "block" }}>Password <span style={{ opacity: 0.7 }}>(min 8 chars)</span></span>
                <input className="field" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
              </label>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
                <button type="submit" disabled={loading} className="btn btn-primary btn-arrow">
                  {loading ? "Creating account" : "Create account"}
                </button>
                <Link href="/login" className="label" style={{ textDecoration: "none", color: "var(--text-secondary)" }}>
                  Have an account? <span style={{ color: "var(--text-primary)" }}>Sign in</span>
                </Link>
              </div>
            </form>
          </div>
        </section>
      </main>
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
