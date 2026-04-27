"use client";

export function ScoreBar({ score }: { score: number }) {
  const filled = Math.round(score);
  const empty = 10 - filled;
  return (
    <span className="score">
      <span className="score-bar">{"\u2588".repeat(filled)}</span>
      <span className="score-bar-empty">{"\u2591".repeat(empty)}</span>
      <span className="score-value">{score.toFixed(1)}</span>
    </span>
  );
}

export function StatusPill({ status, days }: { status: string; days: number }) {
  const timeLabel = days < 1 ? "NEW" : days < 7 ? `${days}D` : days < 30 ? `${Math.floor(days / 7)}W` : `${Math.floor(days / 30)}M`;
  return (
    <span className={`pill pill-${status}`}>
      {status} {"\u00B7"} {timeLabel}
    </span>
  );
}

export function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <div className="logo"><a href="/TheWhiteKnight/" style={{color:"inherit",textDecoration:"none"}}>CAREER<span>OS</span></a></div>
        <nav>
          <ul className="nav">
            <li><a href="/TheWhiteKnight/">PIPELINE</a></li>
            <li><a href="/TheWhiteKnight/applications/">APPLICATIONS</a></li>
            <li><a href="/TheWhiteKnight/persona/">PERSONA</a></li>
            <li><a href="/TheWhiteKnight/config/">CONFIG</a></li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", padding: "16px 0", textAlign: "center", marginTop: "auto" }}>
      <span className="label">CAREEROS v0.1.0 {"\u00B7"} SPEC-DRIVEN DEVELOPMENT {"\u00B7"} TEENAGE ENGINEERING DESIGN</span>
    </footer>
  );
}