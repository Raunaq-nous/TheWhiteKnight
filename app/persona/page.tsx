import { Header, Footer } from "../components";

const personaFiles = [
  { name: "master-cv.md", status: "pending", desc: "Your canonical career data, all roles and achievements" },
  { name: "voice-samples.md", status: "pending", desc: "Examples of your actual writing tone for outreach" },
  { name: "github-projects.md", status: "pending", desc: "AI builds and open-source projects" },
  { name: "certifications.md", status: "pending", desc: "Professional certifications" },
  { name: "publications.md", status: "pending", desc: "IEEE papers and research publications" },
  { name: "website-content.md", status: "pending", desc: "Portfolio site content snapshot" },
];

const resumeArchive = [
  "Resume_Bain_ProjectLeader.md",
  "Resume_OliverWyman_EngagementManager.md",
  "Resume_talabat_SeniorPM_AI.md",
  "Resume_KernelDAO_ChiefOfStaff.md",
  "Resume_GE_Aerospace.md",
];

export default function PersonaPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        <div className="section-header">
          <span className="section-title">PERSONA CORPUS</span>
          <span className="label">USER LAYER {"\u00B7"} NEVER AUTO-OVERWRITTEN</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Left: core files */}
          <div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
              <div className="label" style={{ marginBottom: 16 }}>CORE PERSONA FILES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {personaFiles.map(f => (
                  <div key={f.name} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                    <span style={{ color: f.status === "ready" ? "var(--success)" : "var(--text-tertiary)", fontSize: "0.75rem", marginTop: 2 }}>
                      {f.status === "ready" ? "\u2713" : "\u25CB"}
                    </span>
                    <div>
                      <div className="mono" style={{ fontSize: "0.8125rem", marginBottom: 2 }}>{f.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{f.desc}</div>
                    </div>
                    <span className={`pill ${f.status === "ready" ? "pill-offer" : "pill-sourced"}`} style={{ marginLeft: "auto" }}>
                      {f.status === "ready" ? "READY" : "PENDING"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: resume archive + instructions */}
          <div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 16 }}>RESUME ARCHIVE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {resumeArchive.map(r => (
                  <div key={r} className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", padding: "4px 0" }}>
                    {r}
                  </div>
                ))}
              </div>
              <div className="label" style={{ marginTop: 12, color: "var(--text-tertiary)" }}>{resumeArchive.length} VARIANTS</div>
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 24 }}>
              <div className="label" style={{ color: "var(--accent)", marginBottom: 12 }}>HOW TO POPULATE</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                <p style={{ marginBottom: 8 }}>Send your master CV to Antigravity and it will format it into <span className="mono">master-cv.md</span>.</p>
                <p style={{ marginBottom: 8 }}>Define your target role buckets and contact info for <span className="mono">config/profile.yml</span>.</p>
                <p>All persona files are User Layer: they are never overwritten by system updates.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}