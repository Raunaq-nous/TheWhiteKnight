"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { NotificationBell } from "./notifications";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-theme") as "light" | "dark") ?? "light";
    setTheme(current);
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("careeros-theme", next); } catch {}
  };

  return (
    <button
      onClick={toggle}
      className="btn"
      style={{ fontSize: "0.625rem", padding: "3px 10px" }}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      aria-label="Toggle theme"
    >
      {theme === "light" ? "DARK" : "LIGHT"}
    </button>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const filled = Math.round(score);
  const empty = 10 - filled;
  return (
    <span className="score">
      <span className="score-bar">{"█".repeat(filled)}</span>
      <span className="score-bar-empty">{"░".repeat(empty)}</span>
      <span className="score-value">{score.toFixed(1)}</span>
    </span>
  );
}

export function StatusPill({ status, days }: { status: string; days: number }) {
  const timeLabel = days < 1 ? "NEW" : days < 7 ? `${days}D` : days < 30 ? `${Math.floor(days / 7)}W` : `${Math.floor(days / 30)}M`;
  return (
    <span className={`pill pill-${status}`}>
      {status} {"·"} {timeLabel}
    </span>
  );
}

export function Header() {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.user?.email) setUserEmail(d.user.email);
    }).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className="header">
      <div className="container header-inner">
        <div className="logo"><Link href="/" style={{color:"inherit",textDecoration:"none"}}>CAREER<span>OS</span></Link></div>
        <nav>
          <ul className="nav">
            <li><Link href="/">PIPELINE</Link></li>
            <li><Link href="/profile/">PROFILE</Link></li>
            <li><Link href="/applications/">APPLICATIONS</Link></li>
            <li><Link href="/skills/">SKILL BUILDER</Link></li>
            <li><Link href="/contacts/">CONTACTS</Link></li>
            <li><Link href="/companies/">COMPANIES</Link></li>
            <li><Link href="/batch/">BATCH</Link></li>
            <li><Link href="/persona/">PERSONA</Link></li>
            <li><Link href="/config/">CONFIG</Link></li>
            <li><Link href="/settings/" style={{color: "var(--accent)"}}>SETTINGS</Link></li>
            <li><ThemeToggle /></li>
            <li><NotificationBell /></li>
            {userEmail && (
              <li style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8, paddingLeft: 8, borderLeft: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {userEmail.split("@")[0].toUpperCase()}
                </span>
                <button
                  onClick={handleLogout}
                  className="btn"
                  style={{ fontSize: "0.625rem", padding: "3px 8px", color: "var(--text-tertiary)", borderColor: "var(--border-light)" }}
                >
                  OUT
                </button>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", padding: "16px 0", textAlign: "center", marginTop: "auto" }}>
      <span className="label">CAREEROS v0.1.0 {"·"} SERVERLESS EDITION {"·"} TEENAGE ENGINEERING DESIGN</span>
    </footer>
  );
}
