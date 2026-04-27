const applications = [
  { company: "Bain & Company", role: "Project Leader", location: "Gurgaon", status: "interview", score: 9.2, days: 5, bucket: "MBB Strategy" },
  { company: "Talabat", role: "Sr Product Manager, AI", location: "Dubai", status: "applied", score: 8.5, days: 12, bucket: "AI Product" },
  { company: "Careem", role: "Chief of Staff", location: "Dubai", status: "sourced", score: 7.8, days: 2, bucket: "Chief of Staff" },
  { company: "McKinsey", role: "Associate Partner, Digital", location: "Riyadh", status: "reviewed", score: 8.9, days: 3, bucket: "MBB Strategy" },
  { company: "Noon", role: "VP Strategy & Operations", location: "Dubai", status: "applied", score: 7.2, days: 18, bucket: "Strategy Ops" },
  { company: "BCG", role: "Principal, AI & Analytics", location: "Mumbai", status: "interview", score: 9.0, days: 8, bucket: "MBB Strategy" },
  { company: "Swiggy", role: "Director of Strategy", location: "Bangalore", status: "sourced", score: 6.5, days: 1, bucket: "Strategy Ops" },
  { company: "OYO", role: "Head of Product, AI", location: "Gurgaon", status: "rejected", score: 7.1, days: 30, bucket: "AI Product" },
  { company: "Stripe", role: "Strategy & Ops Lead, APAC", location: "Singapore", status: "offer", score: 8.8, days: 22, bucket: "Strategy Ops" },
  { company: "Anthropic", role: "Product Manager, API", location: "SF Remote", status: "applied", score: 9.5, days: 6, bucket: "AI Product" },
];

const statuses = ["sourced", "reviewed", "applied", "interview", "offer", "rejected"];

function ScoreBar({ score }: { score: number }) {
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

function StatusPill({ status, days }: { status: string; days: number }) {
  const timeLabel = days < 1 ? "NEW" : days < 7 ? `${days}D` : days < 30 ? `${Math.floor(days / 7)}W` : `${Math.floor(days / 30)}M`;
  return (
    <span className={`pill pill-${status}`}>
      {status} {"\u00B7"} {timeLabel}
    </span>
  );
}

function AppCard({ app }: { app: typeof applications[0] }) {
  return (
    <div className="card">
      <div className="card-company">{app.company}</div>
      <div className="card-role">{app.role}</div>
      <div className="card-meta">
        <span className="card-location">{app.location}</span>
        <StatusPill status={app.status} days={app.days} />
      </div>
      <div style={{ marginTop: 8 }}>
        <ScoreBar score={app.score} />
      </div>
      <div className="label" style={{ marginTop: 6 }}>{app.bucket}</div>
    </div>
  );
}

export default function Dashboard() {
  const counts: Record<string, number> = {};
  statuses.forEach(s => { counts[s] = applications.filter(a => a.status === s).length; });

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <div className="logo">CAREER<span>OS</span></div>
          <nav>
            <ul className="nav">
              <li><a href="#" className="active">PIPELINE</a></li>
              <li><a href="#">APPLICATIONS</a></li>
              <li><a href="#">PERSONA</a></li>
              <li><a href="#">CONFIG</a></li>
            </ul>
          </nav>
        </div>
      </header>

      <main className="container" style={{ paddingTop: 24, paddingBottom: 64 }}>
        <div className="stats-bar">
          {statuses.map(s => (
            <div className="stat" key={s}>
              <div className="stat-value" style={{ color: `var(--status-${s})` }}>{counts[s]}</div>
              <div className="stat-label">{s}</div>
            </div>
          ))}
        </div>

        <div className="section-header">
          <span className="section-title">APPLICATION PIPELINE</span>
          <button className="btn btn-primary">+ INGEST JD</button>
        </div>

        <div className="pipeline">
          {statuses.map(status => (
            <div className="column" key={status}>
              <div className="column-header">
                <span className="column-title">{status}</span>
                <span className="column-count">{counts[status]}</span>
              </div>
              <div className="column-body">
                {applications.filter(a => a.status === status).map((app, i) => (
                  <AppCard app={app} key={i} />
                ))}
                {counts[status] === 0 && (
                  <div className="empty-state"><p>NO APPLICATIONS</p></div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer style={{ borderTop: "1px solid var(--border)", padding: "16px 0", textAlign: "center" }}>
        <span className="label">CAREEROS v0.1.0</span>
      </footer>
    </>
  );
}