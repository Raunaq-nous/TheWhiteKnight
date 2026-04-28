"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header, Footer } from "../components";
import { saveApplication, generateSlug, generateId, TargetBucket, getApiKey } from "../../lib/store";
import { scoreJobWithAI } from "../../lib/scoring";

const MOCK_BUCKETS: TargetBucket[] = [
  {
    id: "ai-product",
    name: "AI Product",
    description: "Senior AI/ML product roles",
    titlesMatch: ["ai product manager", "agentic", "ml product", "ai product"],
    titlesExclude: ["junior", "intern"],
    sectorsPreferred: ["saas", "fintech", "ai-frontier-tech"],
    geographies: ["India", "UAE", "Remote"],
    keywordsRequired: ["ai", "ml", "llm", "agentic", "product"],
    keywordsBoost: ["agentic workflow", "rag", "multi-agent"],
    targetCompanies: ["Anthropic", "talabat", "OpenAI"],
    seniority: ["senior", "lead", "principal"],
    weight: 0.3
  },
  {
    id: "mbb-strategy",
    name: "MBB Strategy",
    description: "Top-tier consulting",
    titlesMatch: ["engagement manager", "project leader"],
    titlesExclude: ["associate"],
    sectorsPreferred: ["energy", "financial services"],
    geographies: ["India", "UAE", "Saudi Arabia", "UK"],
    keywordsRequired: ["strategy", "consulting"],
    keywordsBoost: ["due diligence", "financial modeling"],
    targetCompanies: ["Bain", "BCG", "McKinsey"],
    seniority: ["senior", "principal"],
    weight: 0.3
  }
];

export default function IngestPage() {
  const router = useRouter();
  const [jdText, setJdText] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [seniority, setSeniority] = useState("senior");
  const [sector, setSector] = useState("");
  const [remote, setRemote] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  
  const [scoreResult, setScoreResult] = useState<any>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleScore = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setErrorMsg("OpenAI API Key is missing. Please add it in Settings.");
      return;
    }

    setIsScoring(true);
    setErrorMsg("");
    try {
      const result = await scoreJobWithAI(jdText, company, role, location, seniority, sector, MOCK_BUCKETS, apiKey);
      setScoreResult(result);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to score job.");
    } finally {
      setIsScoring(false);
    }
  };

  const handleSave = () => {
    if (!scoreResult) return;
    
    const newApp = {
      id: generateId(),
      slug: generateSlug(company, role),
      company,
      role,
      location,
      remote,
      status: "sourced" as const,
      score: scoreResult.totalScore,
      bucket: scoreResult.bucket,
      sector,
      seniority,
      sourceUrl,
      capturedAt: new Date().toISOString().split("T")[0],
      jdRaw: jdText,
      jdParsed: scoreResult.parsed,
      nextAction: "Review and Tailor",
      contacts: [],
      interviews: [],
      reminders: [],
      resumeVersions: [],
      notes: "",
      emailEvents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    saveApplication(newApp);
    router.push(`/TheWhiteKnight/`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1, maxWidth: 800 }}>
        <div className="section-header">
          <span className="section-title">INGEST NEW JOB</span>
          <Link href="/TheWhiteKnight/" className="btn" style={{ textDecoration: "none" }}>CANCEL</Link>
        </div>

        {errorMsg && (
          <div style={{ background: "rgba(255,50,50,0.1)", border: "1px solid var(--error)", padding: 16, borderRadius: "var(--radius)", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>{errorMsg}</span>
            {errorMsg.includes("API Key") && (
              <Link href="/TheWhiteKnight/settings/" className="btn" style={{ borderColor: "var(--error)", color: "var(--error)", textDecoration: "none" }}>GO TO SETTINGS</Link>
            )}
          </div>
        )}

        <div style={{ background: "var(--surface)", padding: 24, borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="label" style={{ display: "block", marginBottom: 8 }}>COMPANY</label>
              <input type="text" className="input" value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Anthropic" style={{ width: "100%", padding: 8, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit" }} />
            </div>
            
            <div>
              <label className="label" style={{ display: "block", marginBottom: 8 }}>ROLE TITLE</label>
              <input type="text" className="input" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. AI Product Manager" style={{ width: "100%", padding: 8, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label className="label" style={{ display: "block", marginBottom: 8 }}>LOCATION</label>
                <input type="text" className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. San Francisco" style={{ width: "100%", padding: 8, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit" }} />
              </div>
              <div>
                <label className="label" style={{ display: "block", marginBottom: 8 }}>SECTOR</label>
                <input type="text" className="input" value={sector} onChange={e => setSector(e.target.value)} placeholder="e.g. fintech" style={{ width: "100%", padding: 8, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <input type="checkbox" checked={remote} onChange={e => setRemote(e.target.checked)} />
                Remote Role
              </label>
            </div>

            <div>
              <label className="label" style={{ display: "block", marginBottom: 8 }}>JOB DESCRIPTION (PASTE FULL TEXT)</label>
              <textarea value={jdText} onChange={e => setJdText(e.target.value)} rows={10} style={{ width: "100%", padding: 8, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit", resize: "vertical" }} />
            </div>

            <button className="btn btn-primary" onClick={handleScore} disabled={!company || !role || !jdText || isScoring} style={{ width: "100%", padding: 12, justifyContent: "center" }}>
              {isScoring ? "AI IS ANALYZING & SCORING..." : "SCORE JOB AGAINST PERSONA WITH AI"}
            </button>
          </div>

          {scoreResult && (
            <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
              <div className="section-title" style={{ marginBottom: 16 }}>AI SCORE RESULT</div>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-primary)", padding: 16, border: "1px solid var(--border)", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: "2rem", fontWeight: 700, color: scoreResult.totalScore >= 8.5 ? "var(--success)" : scoreResult.totalScore >= 7.0 ? "var(--accent)" : "var(--text-secondary)" }}>
                    {scoreResult.totalScore.toFixed(1)} / 10
                  </div>
                  <div className="label">{scoreResult.recommendation}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="label">TARGET BUCKET</div>
                  <div style={{ color: "var(--text-primary)" }}>{scoreResult.bucketName}</div>
                </div>
              </div>
              
              {scoreResult.parsed && (
                <div style={{ background: "var(--bg-primary)", padding: 16, border: "1px solid var(--border-light)", marginBottom: 16 }}>
                  <div className="label" style={{ marginBottom: 8 }}>AI EXTRACTED REQUIREMENTS</div>
                  <ul style={{ fontSize: "0.875rem", margin: 0, paddingLeft: 20, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {scoreResult.parsed.keyRequirements?.slice(0,3).map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                  {scoreResult.parsed.redFlags?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <span className="label" style={{ color: "var(--error)" }}>RED FLAGS FOUND:</span>
                      <span style={{ fontSize: "0.875rem", marginLeft: 8, color: "var(--error)" }}>{scoreResult.parsed.redFlags.join(", ")}</span>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                {Object.entries(scoreResult.breakdown).map(([key, data]: [string, any]) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", padding: "4px 0", borderBottom: "1px solid var(--border-light)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>{key.replace(/([A-Z])/g, ' $1').toUpperCase()}</span>
                    <span>{data.score > 0 ? "✅" : "❌"} {(data.weighted).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <button className="btn" onClick={handleSave} style={{ width: "100%", padding: 12, justifyContent: "center", marginTop: 24, borderColor: "var(--accent)", color: "var(--accent)" }}>
                ADD TO PIPELINE
              </button>
            </div>
          )}

        </div>
      </main>
      <Footer />
    </div>
  );
}