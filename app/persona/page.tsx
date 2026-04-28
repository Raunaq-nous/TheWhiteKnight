import fs from "fs";
import path from "path";
import { Header, Footer } from "../components";

export default function PersonaPage() {
  // Read persona files at build time
  const personaDir = path.join(process.cwd(), "persona");
  let coreFiles: string[] = [];
  let resumes: string[] = [];
  
  try {
    if (fs.existsSync(personaDir)) {
      coreFiles = fs.readdirSync(personaDir).filter(f => f.endsWith(".md"));
    }
    const resumesDir = path.join(personaDir, "resumes");
    if (fs.existsSync(resumesDir)) {
      resumes = fs.readdirSync(resumesDir).filter(f => f.endsWith(".md") || f.endsWith(".docx") || f.endsWith(".pdf"));
    }
  } catch (e) {
    console.error(e);
  }

  const expectedFiles = [
    { name: "master-cv.md", desc: "Your canonical career data, all roles and achievements" },
    { name: "voice-samples.md", desc: "Examples of your actual writing tone for outreach" },
    { name: "github-projects.md", desc: "AI builds and open-source projects" },
    { name: "certifications.md", desc: "Professional certifications" },
    { name: "publications.md", desc: "IEEE papers and research publications" },
    { name: "website-content.md", desc: "Portfolio site content snapshot" },
  ];

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
                {expectedFiles.map(f => {
                  const isReady = coreFiles.includes(f.name);
                  return (
                    <div key={f.name} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                      <span style={{ color: isReady ? "var(--success)" : "var(--text-tertiary)", fontSize: "0.75rem", marginTop: 2 }}>
                        {isReady ? "\u2713" : "\u25CB"}
                      </span>
                      <div>
                        <div className="mono" style={{ fontSize: "0.8125rem", marginBottom: 2 }}>{f.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{f.desc}</div>
                      </div>
                      <span className={`pill ${isReady ? "pill-offer" : "pill-sourced"}`} style={{ marginLeft: "auto" }}>
                        {isReady ? "READY" : "PENDING"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: resume archive + instructions */}
          <div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 16 }}>RESUME ARCHIVE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "300px", overflowY: "auto" }}>
                {resumes.length === 0 ? (
                  <div className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>No resumes found</div>
                ) : (
                  resumes.map(r => (
                    <div key={r} className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", padding: "4px 0" }}>
                      {r}
                    </div>
                  ))
                )}
              </div>
              <div className="label" style={{ marginTop: 12, color: "var(--text-tertiary)" }}>{resumes.length} VARIANTS</div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}