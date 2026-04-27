import { applications, STATUSES, BUCKETS } from "../data";
import { ScoreBar, StatusPill, Header, Footer } from "../components";

export default function ApplicationsPage() {
  const sorted = [...applications].sort((a, b) => b.score - a.score);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        <div className="section-header">
          <span className="section-title">ALL APPLICATIONS</span>
          <span className="label">{applications.length} TOTAL</span>
        </div>

        {/* Table */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 120px 100px", gap: 0, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <span className="label">COMPANY</span>
            <span className="label">ROLE</span>
            <span className="label">LOCATION</span>
            <span className="label">BUCKET</span>
            <span className="label">SCORE</span>
            <span className="label">STATUS</span>
          </div>

          {/* Rows */}
          {sorted.map((app, i) => (
            <a key={i} href={`/TheWhiteKnight/application/${app.slug}/`}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 2fr 1fr 1fr 120px 100px",
                gap: 0,
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-light)",
                textDecoration: "none",
                color: "inherit",
                transition: "background 150ms ease-out",
              }}
              className="card"
            >
              <span className="mono" style={{ fontWeight: 500, textTransform: "uppercase", fontSize: "0.8125rem" }}>{app.company}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{app.role}</span>
              <span className="label" style={{ alignSelf: "center" }}>{app.location}</span>
              <span className="label" style={{ alignSelf: "center" }}>{app.bucket}</span>
              <ScoreBar score={app.score} />
              <StatusPill status={app.status} days={app.days} />
            </a>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}