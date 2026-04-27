import { Header, Footer } from "../components";

const buckets = [
  { name: "MBB Strategy", titles: "Project Leader, Engagement Manager, Associate Partner", seniority: "Senior+", geo: "India, Middle East", sectors: "Consulting", count: 3 },
  { name: "AI Product", titles: "Sr PM AI, Head of Product AI, Director Product", seniority: "Senior+", geo: "Global Remote, India, Middle East", sectors: "Tech, AI", count: 3 },
  { name: "Chief of Staff", titles: "Chief of Staff, Strategy Lead", seniority: "Director+", geo: "Global Remote, Middle East", sectors: "Tech, Consulting", count: 1 },
  { name: "Strategy Ops", titles: "VP Strategy, Director Strategy & Ops, Strategy Lead", seniority: "Senior+", geo: "India, Singapore, Middle East", sectors: "Tech, E-commerce", count: 3 },
];

const profile = {
  name: "Raunaq Rakesh",
  email: "raunaq1509@gmail.com",
  phone: "+91-7982271861",
  location: "Gurgaon, India",
  linkedin: "linkedin.com/in/raunaqrakesh",
  portfolio: "raunaqrakesh.com",
  github: "github.com/Raunaq-nous",
};

const portals = [
  { name: "LinkedIn Jobs", url: "linkedin.com/jobs", status: "active", lastScan: "2026-04-27" },
  { name: "Greenhouse", url: "greenhouse.io", status: "active", lastScan: "2026-04-27" },
  { name: "Lever", url: "lever.co", status: "active", lastScan: "2026-04-26" },
  { name: "Ashby", url: "ashbyhq.com", status: "configured", lastScan: "never" },
];

export default function ConfigPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        <div className="section-header">
          <span className="section-title">CONFIGURATION</span>
          <span className="label">USER LAYER</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          {/* Profile */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
            <div className="label" style={{ marginBottom: 16 }}>PROFILE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Object.entries(profile).map(([key, val]) => (
                <div key={key}>
                  <div className="label" style={{ fontSize: "0.625rem", marginBottom: 2 }}>{key.toUpperCase()}</div>
                  <div className="mono" style={{ fontSize: "0.8125rem" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Portals */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
            <div className="label" style={{ marginBottom: 16 }}>JOB PORTALS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {portals.map(p => (
                <div key={p.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                  <div>
                    <div className="mono" style={{ fontSize: "0.8125rem" }}>{p.name}</div>
                    <div className="label" style={{ fontSize: "0.625rem" }}>{p.url}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="label" style={{ fontSize: "0.625rem" }}>SCAN: {p.lastScan}</span>
                    <span className={`pill ${p.status === "active" ? "pill-offer" : "pill-sourced"}`}>
                      {p.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Target role buckets */}
        <div className="section-header">
          <span className="section-title">TARGET ROLE BUCKETS</span>
          <span className="label">{buckets.length} CONFIGURED</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {buckets.map(b => (
            <div key={b.name} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span className="mono" style={{ fontWeight: 500, textTransform: "uppercase" }}>{b.name}</span>
                <span className="column-count">{b.count} APPS</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  ["TITLES", b.titles],
                  ["SENIORITY", b.seniority],
                  ["GEO", b.geo],
                  ["SECTORS", b.sectors],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <span className="label" style={{ fontSize: "0.625rem" }}>{label}: </span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}