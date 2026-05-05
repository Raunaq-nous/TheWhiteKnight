"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header, Footer } from "../components";
import { saveApplication, generateSlug, generateId, TargetBucket } from "../../lib/store";
import { scoreJobWithAI } from "../../lib/scoring";
import { getProfile, getSeedProfile } from "../../lib/profile";

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

async function extractTextFromImage(base64: string, mimeType: string): Promise<string> {
  const response = await fetch("/api/extract-jd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mimeType }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Vision extraction failed: ${response.status}`);
  }
  const { text } = await response.json();
  return text;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string ?? "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target?.result as string ?? "";
      // Strip the data URL prefix, keep only base64 payload
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function IngestPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedFileName, setExtractedFileName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [extractedFiles, setExtractedFiles] = useState<string[]>([]);

  const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
  const TEXT_TYPES = ["text/plain", "text/markdown"];

  const appendJD = (chunk: string) => {
    setJdText(prev => {
      const base = prev.trim();
      return base ? base + "\n\n" + chunk : chunk;
    });
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setErrorMsg("");
    const valid = files.filter(f => IMAGE_TYPES.includes(f.type) || TEXT_TYPES.includes(f.type) || f.name.endsWith(".txt") || f.name.endsWith(".md"));
    if (valid.length === 0) {
      setErrorMsg(`Unsupported file types. Use .txt, .md, or images (PNG, JPG, WEBP).`);
      return;
    }

    const textFiles = valid.filter(f => TEXT_TYPES.includes(f.type) || f.name.endsWith(".txt") || f.name.endsWith(".md"));
    const imageFiles = valid.filter(f => IMAGE_TYPES.includes(f.type));

    for (const f of textFiles) {
      try {
        const t = await readFileAsText(f);
        appendJD(`--- ${f.name} ---\n\n${t}`);
        setExtractedFiles(prev => [...prev, f.name]);
      } catch (e: any) {
        setErrorMsg(`Failed to read ${f.name}: ${e.message}`);
      }
    }

    if (imageFiles.length > 0) {
      setIsExtracting(true);
      try {
        for (let i = 0; i < imageFiles.length; i++) {
          const f = imageFiles[i];
          setExtractedFileName(`Extracting ${i + 1} of ${imageFiles.length}: ${f.name}`);
          const base64 = await readFileAsBase64(f);
          const t = await extractTextFromImage(base64, f.type);
          appendJD(t);
          setExtractedFiles(prev => [...prev, f.name]);
        }
        setExtractedFileName("");
      } catch (e: any) {
        setErrorMsg(e.message || "Image extraction failed.");
      } finally {
        setIsExtracting(false);
      }
    }
  };

  const clearExtracted = () => {
    setJdText("");
    setExtractedFiles([]);
    setExtractedFileName("");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handleScore = async () => {
    setIsScoring(true);
    setErrorMsg("");
    try {
      const profile = getProfile() ?? getSeedProfile();
      const bucketsForScoring = MOCK_BUCKETS.map(b => ({ id: b.id, name: b.name, description: b.description }));
      const result = await scoreJobWithAI(jdText, company, role, location, seniority, sector, remote, bucketsForScoring, profile);
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
      bucketName: scoreResult.bucketName,
      sector,
      seniority,
      sourceUrl,
      capturedAt: new Date().toISOString().split("T")[0],
      jdRaw: jdText,
      jdParsed: scoreResult.parsed,
      afScore: {
        archetype: scoreResult.archetype,
        scores: scoreResult.scores,
        global: scoreResult.global,
        recommendation: scoreResult.recommendation,
        legitimacy: scoreResult.legitimacy,
      },
      nextAction: scoreResult.recommendation === "apply_immediately" ? "Apply now" :
                  scoreResult.recommendation === "apply" ? "Tailor and apply" :
                  scoreResult.recommendation === "review_manually" ? "Review JD, decide" : "Likely skip",
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
    router.push(`/`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1, maxWidth: 800 }}>
        <div className="section-header">
          <span className="section-title">INGEST NEW JOB</span>
          <Link href="/" className="btn" style={{ textDecoration: "none" }}>CANCEL</Link>
        </div>

        {errorMsg && (
          <div style={{ background: "rgba(255,50,50,0.1)", border: "1px solid var(--error)", padding: 16, borderRadius: "var(--radius)", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>{errorMsg}</span>
            {errorMsg.includes("Settings") && (
              <Link href="/settings/" className="btn" style={{ borderColor: "var(--error)", color: "var(--error)", textDecoration: "none" }}>GO TO SETTINGS</Link>
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

            <div className="ingest-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
              <label className="label" style={{ display: "block", marginBottom: 8 }}>SOURCE URL (OPTIONAL)</label>
              <input type="text" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://..." style={{ width: "100%", padding: 8, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit" }} />
            </div>

            {/* JD Input — upload or paste */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                <label className="label">JOB DESCRIPTION</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    className="btn"
                    style={{ fontSize: "0.625rem", padding: "4px 10px" }}
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isExtracting}
                  >
                    + PHOTO
                  </button>
                  <button
                    className="btn"
                    style={{ fontSize: "0.625rem", padding: "4px 10px" }}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExtracting}
                  >
                    + FILE(S)
                  </button>
                  {(extractedFiles.length > 0 || jdText) && (
                    <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px", borderColor: "var(--error)", color: "var(--error)" }} onClick={clearExtracted} disabled={isExtracting}>
                      CLEAR
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,image/*"
                    multiple
                    onChange={handleFileInput}
                    style={{ display: "none" }}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handleFileInput}
                    style={{ display: "none" }}
                  />
                </div>
              </div>

              {extractedFiles.length > 0 && (
                <div style={{ marginBottom: 8, padding: "6px 10px", background: "var(--bg-primary)", border: "1px solid var(--border-light)", borderRadius: "var(--radius)", fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-secondary)" }}>
                  CAPTURED ({extractedFiles.length}): {extractedFiles.join(", ")}
                  {isExtracting && extractedFileName && <span style={{ color: "var(--accent)", display: "block", marginTop: 4 }}>{extractedFileName}</span>}
                </div>
              )}
              {extractedFiles.length === 0 && isExtracting && extractedFileName && (
                <div style={{ marginBottom: 8, padding: "6px 10px", color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: "0.625rem" }}>{extractedFileName}</div>
              )}

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                style={{
                  border: `1px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "var(--radius)",
                  transition: "border-color 0.15s",
                  background: dragOver ? "rgba(var(--accent-rgb, 255,165,0), 0.05)" : "transparent"
                }}
              >
                <textarea
                  value={jdText}
                  onChange={e => setJdText(e.target.value)}
                  rows={10}
                  placeholder="Paste JD text here, or upload screenshots. Each + PHOTO / + FILE(S) appends to what is already here."
                  style={{ width: "100%", padding: 8, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit", resize: "vertical", display: "block" }}
                />
              </div>
              <div className="label" style={{ marginTop: 6, fontSize: "0.6rem", color: "var(--text-tertiary)" }}>
                Supports: .txt, .md, PNG, JPG, WEBP. Upload multiple screenshots in one go (hold to multi-select on mobile) or click + PHOTO repeatedly. Each upload APPENDS to the JD text above; CLEAR resets it.
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleScore}
              disabled={!company || !role || !jdText || isScoring || isExtracting}
              style={{ width: "100%", padding: 12, justifyContent: "center" }}
            >
              {isScoring ? "AI IS ANALYZING & SCORING..." : "SCORE JOB AGAINST PERSONA WITH AI"}
            </button>
          </div>

          {scoreResult && (
            <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
              <div className="section-title" style={{ marginBottom: 16 }}>A-F EVALUATION</div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-primary)", padding: 16, border: "1px solid var(--border)", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "2rem", fontWeight: 700, color: scoreResult.global >= 4.5 ? "var(--success)" : scoreResult.global >= 4.0 ? "var(--accent)" : scoreResult.global >= 3.5 ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {scoreResult.global?.toFixed(1)} / 5
                  </div>
                  <div className="label">{scoreResult.recommendationLabel}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="label">ARCHETYPE</div>
                  <div style={{ color: "var(--text-primary)" }}>{scoreResult.archetype?.primary}</div>
                  {scoreResult.archetype?.secondary && (
                    <div style={{ color: "var(--text-tertiary)", fontSize: "0.75rem" }}>+ {scoreResult.archetype.secondary}</div>
                  )}
                </div>
              </div>

              {/* Score breakdown */}
              <div style={{ marginBottom: 16 }}>
                {[
                  { key: "cv_match", label: "CV MATCH" },
                  { key: "north_star", label: "NORTH STAR" },
                  { key: "comp", label: "COMPENSATION" },
                  { key: "culture", label: "CULTURE" },
                  { key: "red_flags", label: "RED FLAGS (5=NONE)" },
                ].map(({ key, label }) => {
                  const block = scoreResult.scores?.[key];
                  if (!block) return null;
                  const color = block.score >= 4 ? "var(--success)" : block.score >= 3 ? "var(--accent)" : "var(--error)";
                  return (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: "0.875rem", padding: "8px 0", borderBottom: "1px solid var(--border-light)", gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div className="label" style={{ color: "var(--text-secondary)", marginBottom: 4 }}>{label}</div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", lineHeight: 1.5 }}>{block.reasoning}</div>
                      </div>
                      <div style={{ color, fontFamily: "var(--font-mono)", fontSize: "1rem", fontWeight: 600, minWidth: 40, textAlign: "right" }}>{block.score}/5</div>
                    </div>
                  );
                })}
              </div>

              {/* Legitimacy */}
              {scoreResult.legitimacy && (
                <div style={{ background: "var(--bg-primary)", padding: 16, border: "1px solid var(--border-light)", marginBottom: 16 }}>
                  <div className="label" style={{ marginBottom: 8 }}>POSTING LEGITIMACY</div>
                  <div style={{
                    color: scoreResult.legitimacy.tier === "high_confidence" ? "var(--success)" : scoreResult.legitimacy.tier === "suspicious" ? "var(--error)" : "var(--accent)",
                    fontFamily: "var(--font-mono)", fontSize: "0.875rem", marginBottom: 8, textTransform: "uppercase"
                  }}>
                    {scoreResult.legitimacy.tier?.replace(/_/g, " ")}
                  </div>
                  {scoreResult.legitimacy.signals?.length > 0 && (
                    <ul style={{ fontSize: "0.75rem", margin: 0, paddingLeft: 16, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {scoreResult.legitimacy.signals.slice(0, 5).map((s: any, i: number) => (
                        <li key={i}>
                          <strong style={{ color: s.weight === "positive" ? "var(--success)" : s.weight === "concerning" ? "var(--error)" : "var(--text-primary)" }}>
                            {s.signal}:
                          </strong> {s.finding}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* CV Match evidence + gaps */}
              {scoreResult.scores?.cv_match && (scoreResult.scores.cv_match.evidence?.length || scoreResult.scores.cv_match.gaps?.length) && (
                <div style={{ background: "var(--bg-primary)", padding: 16, border: "1px solid var(--border-light)", marginBottom: 16 }}>
                  {scoreResult.scores.cv_match.evidence?.length > 0 && (
                    <>
                      <div className="label" style={{ marginBottom: 8, color: "var(--success)" }}>EVIDENCE OF MATCH</div>
                      <ul style={{ fontSize: "0.75rem", margin: 0, paddingLeft: 16, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 8 }}>
                        {scoreResult.scores.cv_match.evidence.slice(0, 5).map((e: string, i: number) => <li key={i}>{e}</li>)}
                      </ul>
                    </>
                  )}
                  {scoreResult.scores.cv_match.gaps?.length > 0 && (
                    <>
                      <div className="label" style={{ marginBottom: 8, color: "var(--error)" }}>GAPS</div>
                      <ul style={{ fontSize: "0.75rem", margin: 0, paddingLeft: 16, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {scoreResult.scores.cv_match.gaps.slice(0, 5).map((g: string, i: number) => <li key={i}>{g}</li>)}
                      </ul>
                    </>
                  )}
                </div>
              )}

              <button className="btn" onClick={handleSave} style={{ width: "100%", padding: 12, justifyContent: "center", marginTop: 16, borderColor: "var(--accent)", color: "var(--accent)" }}>
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
