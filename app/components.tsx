"use client";
import Link from "next/link";

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
  return (
    <header className="header">
      <div className="container header-inner">
        <div className="logo"><Link href="/" style={{color:"inherit",textDecoration:"none"}}>CAREER<span>OS</span></Link></div>
        <nav>
          <ul className="nav">
            <li><Link href="/">PIPELINE</Link></li>
            <li><Link href="/applications/">APPLICATIONS</Link></li>
            <li><Link href="/persona/">PERSONA</Link></li>
            <li><Link href="/config/">CONFIG</Link></li>
            <li><Link href="/settings/" style={{color: "var(--accent)"}}>SETTINGS</Link></li>
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
