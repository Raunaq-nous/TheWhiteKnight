"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
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
    >
      {theme === "light" ? "◑ DARK" : "◐ LIGHT"}
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

const NAV_LINKS = [
  { href: "/", label: "Pipeline" },
  { href: "/profile/", label: "Profile" },
  { href: "/applications/", label: "Applications" },
  { href: "/skills/", label: "Skill Builder" },
  { href: "/contacts/", label: "Contacts" },
  { href: "/companies/", label: "Companies" },
  { href: "/batch/", label: "Batch" },
  { href: "/persona/", label: "Persona" },
  { href: "/config/", label: "Config" },
  { href: "/settings/", label: "Settings" },
];

export function Header() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.user?.email) setUserEmail(d.user.email);
    }).catch(() => {});
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className="header">
      <div className="container header-inner" ref={menuRef}>
        {/* Logo */}
        <div className="logo">
          <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
            CAREER<span>OS</span>
          </Link>
        </div>

        {/* Desktop nav */}
        <nav className="desktop-nav">
          <ul className="nav">
            {NAV_LINKS.map(l => (
              <li key={l.href}>
                <Link href={l.href} style={l.href === "/settings/" ? { color: "var(--accent)" } : {}}>
                  {l.label.toUpperCase()}
                </Link>
              </li>
            ))}
            <li><ThemeToggle /></li>
            <li><NotificationBell /></li>
            {userEmail && (
              <li style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8, paddingLeft: 8, borderLeft: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {userEmail.split("@")[0].toUpperCase()}
                </span>
                <button onClick={handleLogout} className="btn" style={{ fontSize: "0.625rem", padding: "3px 8px" }}>
                  OUT
                </button>
              </li>
            )}
          </ul>
        </nav>

        {/* Mobile right side: theme + bell + hamburger */}
        <div className="mobile-nav-controls">
          <ThemeToggle />
          <NotificationBell />
          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="mobile-menu">
            {NAV_LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="mobile-menu-item"
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            {userEmail && (
              <div className="mobile-menu-footer">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                  {userEmail.split("@")[0].toUpperCase()}
                </span>
                <button onClick={handleLogout} className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }}>
                  SIGN OUT
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", padding: "16px 0", textAlign: "center", marginTop: "auto" }}>
      <span className="label">CAREEROS v0.1.0 {"·"} SERVERLESS EDITION</span>
    </footer>
  );
}
