import { applications, STATUSES } from "./data";
import { ScoreBar, StatusPill, Header, Footer } from "./components";

function AppCard({ app }: { app: typeof applications[0] }) {
  return (
    <a href={`/TheWhiteKnight/application/${app.slug}/`} className="card" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      <div className="card-company">{app.company}</div>
      <div className="card-role">{app.role}</div>
      <div className="card-meta">
        <span className="card-location">{app.location}{app.remote ? " \u00B7 REMOTE" : ""}</span>
        <StatusPill status={app.status} days={app.days} />
      </div>
      <div style={{ marginTop: 8 }}>
        <ScoreBar score={app.score} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span className="label">{app.bucket}</span>
        <span className="label" style={{ color: "var(--text-tertiary)", fontSize: "0.625rem" }}>{app.capturedAt}</span>
      </div>
    </a>
  );
}

export default function Dashboard() {
  const counts: Record<string, number> = {};
  STATUSES.forEach(s => { counts[s] = applications.filter(a => a.status === s).length; });
  const totalActive = applications.filter(a => a.status !== "rejected").length;
  const avgScore = (applications.reduce((sum, a) => sum + a.score, 0) / applications.length).toFixed(1);
  const interviewRate = Math.round((applications.filter(a => ["interview", "offer"].includes(a.status)).length / applications.length) * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        {/* Hero metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: 24, overflow: "hidden" }}>
          <div className="stat">
            <div className="stat-value" style={{ color: "var(--accent)" }}>{totalActive}</div>
            <div className="stat-label">ACTIVE</div>
          </div>
          <div className="stat">
            <div className="stat-value">{avgScore}</div>
            <div className="stat-label">AVG SCORE</div>
          </div>
          <div className="stat">
            <div className="stat-value" style={{ color: "var(--success)" }}>{interviewRate}%</div>
            <div className="stat-label">INTERVIEW RATE</div>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="stats-bar">
          {STATUSES.map(s => (
            <div className="stat" key={s}>
              <div className="stat-value" style={{ color: `var(--status-${s})` }}>{counts[s]}</div>
              <div className="stat-label">{s}</div>
            </div>
          ))}
        </div>

        {/* Pipeline header */}
        <div className="section-header">
          <span className="section-title">APPLICATION PIPELINE</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn">SCAN PORTALS</button>
            <button className="btn btn-primary">+ INGEST JD</button>
          </div>
        </div>

        {/* Kanban columns */}
        <div className="pipeline">
          {STATUSES.map(status => (
            <div className="column" key={status}>
              <div className="column-header">
                <span className="column-title" style={{ color: `var(--status-${status})` }}>{status}</span>
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
      <Footer />
    </div>
  );
}