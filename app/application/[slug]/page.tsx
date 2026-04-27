import { applications } from "../../data";
import { ScoreBar, StatusPill, Header, Footer } from "../../components";

export function generateStaticParams() {
  return applications.map(app => ({ slug: app.slug }));
}

export default async function ApplicationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const app = applications.find(a => a.slug === slug);
  if (!app) return <div>Application not found</div>;

  const filled = Math.round(app.score);
  const empty = 10 - filled;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 64, flex: 1 }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: 24 }}>
          <a href="/TheWhiteKnight/" className="label" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
            {"\u2190"} PIPELINE
          </a>
        </div>

        {/* Title block */}
        <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 24, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-mono)", fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.01em", textTransform: "uppercase", marginBottom: 4 }}>
                {app.company}
              </h1>
              <p style={{ fontSize: "1.125rem", color: "var(--text-secondary)", marginBottom: 12 }}>
                {app.role}
              </p>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span className="label">{app.location}{app.remote ? " \u00B7 REMOTE" : ""}</span>
                <StatusPill status={app.status} days={app.days} />
                <span className="label">{app.bucket}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
          {/* Left column */}
          <div>
            {/* Score card */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 12 }}>MATCH SCORE</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "3rem", fontWeight: 300, color: "var(--accent)", lineHeight: 1 }}>
                  {app.score.toFixed(1)}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.25rem", letterSpacing: 2 }}>
                    <span style={{ color: "var(--accent)" }}>{"\u2588".repeat(filled)}</span>
                    <span style={{ color: "var(--border)" }}>{"\u2591".repeat(empty)}</span>
                  </div>
                  <div className="label" style={{ marginTop: 4 }}>{app.bucket} BUCKET</div>
                </div>
              </div>
            </div>

            {/* Next action */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 8 }}>NEXT ACTION</div>
              <p className="mono" style={{ color: "var(--text-primary)" }}>{app.nextAction}</p>
            </div>

            {/* Actions */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 16 }}>ACTIONS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button className="btn btn-primary">TAILOR RESUME</button>
                <button className="btn">COVER LETTER</button>
                <button className="btn">OUTREACH: HM</button>
                <button className="btn">OUTREACH: REFERRAL</button>
                <button className="btn">LINKEDIN DM</button>
                <button className="btn btn-danger">ARCHIVE</button>
              </div>
            </div>

            {/* Timeline */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
              <div className="label" style={{ marginBottom: 16 }}>TIMELINE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <span className="mono" style={{ color: "var(--text-tertiary)", minWidth: 80 }}>{app.capturedAt}</span>
                  <span className="mono" style={{ color: "var(--status-sourced)" }}>SOURCED</span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>JD ingested from {app.source}</span>
                </div>
                {app.status !== "sourced" && (
                  <div style={{ display: "flex", gap: 12 }}>
                    <span className="mono" style={{ color: "var(--text-tertiary)", minWidth: 80 }}>{app.capturedAt}</span>
                    <span className="mono" style={{ color: `var(--status-${app.status})` }}>{app.status.toUpperCase()}</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>Status updated</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div>
            {/* Metadata */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 16 }}>METADATA</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  ["SOURCE", app.source],
                  ["CAPTURED", app.capturedAt],
                  ["STATUS", app.status.toUpperCase()],
                  ["BUCKET", app.bucket],
                  ["REMOTE", app.remote ? "YES" : "NO"],
                  ["DAYS", `${app.days}`],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <div className="label" style={{ fontSize: "0.625rem", marginBottom: 2 }}>{label}</div>
                    <div className="mono" style={{ fontSize: "0.8125rem" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contacts */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 12 }}>CONTACTS</div>
              {app.contacts.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {app.contacts.map((c, i) => (
                    <div key={i} className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{c}</div>
                  ))}
                </div>
              ) : (
                <p className="label" style={{ color: "var(--text-tertiary)" }}>NO CONTACTS YET</p>
              )}
            </div>

            {/* Files */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
              <div className="label" style={{ marginBottom: 12 }}>FILES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {["jd.md", "score.md", "metadata.yml"].map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--success)", fontSize: "0.75rem" }}>{"\u2713"}</span>
                    <span className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{f}</span>
                  </div>
                ))}
                {["resume.md", "cover-letter.md", "outreach/"].map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--text-tertiary)", fontSize: "0.75rem" }}>{"\u25CB"}</span>
                    <span className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}