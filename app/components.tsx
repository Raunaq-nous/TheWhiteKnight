"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { NotificationBell } from "./notifications";

export function LogoMark({ className = "logo-mark" }: { className?: string }) {
  // Code brackets with dendrites converging on a single node: code -> neuron.
  return (
    <svg className={className} viewBox="0 0 26 18" fill="none" aria-hidden="true">
      <path d="M6 1.5C3 3.5 1.5 6 1.5 9s1.5 5.5 4.5 7.5M20 1.5c3 2 4.5 4.5 4.5 7.5s-1.5 5.5-4.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6.5 5.5 11 9l-4.5 3.5M19.5 5.5 15 9l4.5 3.5M7 9h12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.75" />
      <circle cx="13" cy="9" r="1.9" fill="currentColor" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <LogoMark />
      <span style={{ fontFamily: "var(--font-sans)", fontStyle: "normal", fontWeight: 500, letterSpacing: "-0.04em" }}>career</span>
      <span style={{ marginLeft: -9 }}>OS</span>
    </span>
  );
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-theme") as "light" | "dark") ?? "dark";
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
      className="btn btn-ghost"
      style={{ gap: 8, fontSize: "0.625rem" }}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1" />
        <path d="M6 .75a5.25 5.25 0 0 1 0 10.5z" fill="currentColor" />
      </svg>
      {!compact && (theme === "light" ? "Dark" : "Light")}
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
  { href: "/analytics/", label: "Analytics" },
  { href: "/skills/", label: "Skill Builder" },
  { href: "/contacts/", label: "Contacts" },
  { href: "/companies/", label: "Companies" },
  { href: "/batch/", label: "Batch" },
  { href: "/persona/", label: "Persona" },
  { href: "/config/", label: "Config" },
  { href: "/settings/", label: "Settings" },
];

const PRIMARY_LINKS = NAV_LINKS.slice(0, 4);

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/$/, "") : p);
  const p = norm(pathname), h = norm(href);
  return h === "/" ? p === "/" : p === h || p.startsWith(`${h}/`);
}

function MenuGlyph() {
  return (
    <svg viewBox="0 0 18 10" fill="none" aria-hidden="true">
      <path d="M1 3c2.5 0 3.5-2 6-2s3.5 2 6 2 2.5-1 4-1M1 8c2.5 0 3.5-2 6-2s3.5 2 6 2 2.5-1 4-1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export function Header() {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.user?.email) setUserEmail(d.user.email);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [menuOpen]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" style={{ color: "inherit", textDecoration: "none" }} aria-label="CareerOS pipeline">
          <Logo />
        </Link>

        <nav className="desktop-nav" aria-label="Primary">
          <ul className="nav">
            {PRIMARY_LINKS.map(l => (
              <li key={l.href}>
                <Link href={l.href} className={isActive(pathname, l.href) ? "active" : undefined}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <NotificationBell />
          <button className="menu-trigger" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" aria-expanded={menuOpen}>
            <MenuGlyph /> Main Menu
          </button>
        </div>
      </div>

      {/* Portalled to <body>: the header's backdrop-filter would otherwise become
          the containing block for this fixed overlay and clip it to the header. */}
      {menuOpen && createPortal(
        <div className="menu-overlay" role="dialog" aria-modal="true" aria-label="Main menu">
          <div className="container menu-overlay-head">
            <Link href="/" style={{ color: "inherit", textDecoration: "none" }} onClick={() => setMenuOpen(false)}>
              <Logo />
            </Link>
            <button className="menu-trigger" onClick={() => setMenuOpen(false)} autoFocus>
              Close <span aria-hidden="true" style={{ fontSize: "1.1rem", lineHeight: 1 }}>×</span>
            </button>
          </div>

          <div className="container" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>Career operating system / index</div>
            <ul className="menu-list">
              {NAV_LINKS.map((l, i) => (
                <li key={l.href}>
                  <Link href={l.href} className={isActive(pathname, l.href) ? "active" : undefined} onClick={() => setMenuOpen(false)}>
                    <span className="menu-index">{String(i + 1).padStart(2, "0")}</span>
                    <span className="menu-word">{l.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="container">
            <div className="menu-overlay-foot">
              <span className="label">{userEmail ? `Signed in · ${userEmail}` : "CareerOS"}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <ThemeToggle />
                {userEmail && <button onClick={handleLogout} className="btn">Sign out</button>}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border-light)", marginTop: "auto" }}>
      <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "22px 48px", flexWrap: "wrap" }}>
        <span className="label">CareerOS v0.2</span>
        <span style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", letterSpacing: "-0.02em" }}>
          signal. score. <span className="em" style={{ color: "var(--text-primary)" }}>send.</span>
        </span>
        <span className="label">Local-first · nothing sent without your approval</span>
      </div>
    </footer>
  );
}
