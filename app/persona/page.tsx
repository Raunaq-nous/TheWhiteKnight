import fs from "fs";
import path from "path";
import { Header, Footer } from "../components";
import { PersonaBrowser } from "./browser";

export default function PersonaPage() {
  // Server-side: enumerate files at request time
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
    { name: "master-cv.md", desc: "Canonical career data, all roles and achievements" },
    { name: "voice-samples.md", desc: "Examples of your actual writing tone" },
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
          <span className="label">USER LAYER · NEVER AUTO-OVERWRITTEN</span>
        </div>

        <PersonaBrowser
          coreFiles={coreFiles}
          resumes={resumes}
          expectedFiles={expectedFiles}
        />
      </main>
      <Footer />
    </div>
  );
}
