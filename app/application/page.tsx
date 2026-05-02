"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header, Footer, ScoreBar, StatusPill } from "../components";
import { getApplication, updateApplication, deleteApplication, Application } from "../../lib/store";
import { getProfile } from "../../lib/profile";
import { generateTailoredResume, generateCoverLetter, generateExecutiveSummary, generateProblemSolverPitch, generateSkillGap, generateHMOutreach, generateLinkedInDM, GenerationAction, SkillGapResult } from "../../lib/generate";
import { applications as sampleData } from "../data";

const STATUSES = ["sourced", "reviewed", "applied", "interview", "offer", "rejected"] as const;

function ApplicationDetail() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = searchParams.get("slug") ?? "";

  const [app, setApp] = useState<Application | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [editingNextAction, setEditingNextAction] = useState(false);
  const [nextActionText, setNextActionText] = useState("");
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState<GenerationAction | null>(null);
  const [aiOutput, setAiOutput] = useState<{ action: GenerationAction; content: string } | null>(null);
  const [skillGap, setSkillGap] = useState<SkillGapResult | null>(null);
  const [genError, setGenError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    // Try localStorage first, fall back to sample data
    let found = getApplication(slug);
    if (!found) {
      const sample = (sampleData as any[]).find(a => a.slug === slug);
      if (sample) found = { ...sample, id: sample.slug, jdRaw: "", jdParsed: null, seniority: "senior", sector: "", sourceUrl: sample.source ?? "", interviews: [], reminders: [], resumeVersions: [], emailEvents: [], createdAt: sample.capturedAt, updatedAt: sample.capturedAt } as Application;
    }
    if (found) {
      setApp(found);
      setNoteText(found.notes ?? "");
      setNextActionText(found.nextAction ?? "");
    }
  }, [slug]);

  if (!slug) return <div style={{ padding: 48, textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>NO APPLICATION SELECTED</div>;
  if (!app) return <div style={{ padding: 48, textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>APPLICATION NOT FOUND</div>;

  const filled = Math.round(app.score);
  const empty = 10 - filled;

  const handleStatusChange = (newStatus: typeof STATUSES[number]) => {
    if (!app.id) return;
    updateApplication(app.id, { status: newStatus });
    setApp(prev => prev ? { ...prev, status: newStatus } : prev);
  };

  const handleSaveNote = () => {
    if (!app.id) return;
    updateApplication(app.id, { notes: noteText });
    setApp(prev => prev ? { ...prev, notes: noteText } : prev);
    setEditingNote(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveNextAction = () => {
    if (!app.id) return;
    updateApplication(app.id, { nextAction: nextActionText });
    setApp(prev => prev ? { ...prev, nextAction: nextActionText } : prev);
    setEditingNextAction(false);
  };

  const handleGenerate = async (action: GenerationAction) => {
    const profile = getProfile();
    if (!profile) {
      setGenError("No profile found. Set up your profile first.");
      return;
    }
    if (!app) return;
    setGenerating(action);
    setGenError("");
    setAiOutput(null);
    try {
      if (action === "skill-gap") {
        const result = await generateSkillGap(profile, app);
        setSkillGap(result);
        setAiOutput(null);
      } else {
        let content = "";
        if (action === "resume") content = await generateTailoredResume(profile, app);
        else if (action === "cover-letter") content = await generateCoverLetter(profile, app);
        else if (action === "executive-summary") content = await generateExecutiveSummary(profile, app);
        else if (action === "problem-solver") content = await generateProblemSolverPitch(profile, app);
        else if (action === "outreach-hm") content = await generateHMOutreach(profile, app);
        else if (action === "linkedin-dm") content = await generateLinkedInDM(profile, app);
        setSkillGap(null);
        setAiOutput({ action, content });
      }
    } catch (e: any) {
      setGenError(e.message || "Generation failed.");
    } finally {
      setGenerating(null);
    }
  };

  const handleCopy = () => {
    if (!aiOutput) return;
    navigator.clipboard.writeText(aiOutput.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleArchive = () => {
    if (!app.id || !confirm(`Archive ${app.company} — ${app.role}?`)) return;
    deleteApplication(app.id);
    router.push("/");
  };

  return (
    <main className="container" style={{ paddingTop: 32, paddingBottom: 64, flex: 1 }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/" className="label" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          {"←"} PIPELINE
        </Link>
      </div>

      {/* Title block */}
      <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-mono)", fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.01em", textTransform: "uppercase", marginBottom: 4 }}>
              {app.company}
            </h1>
            <p style={{ fontSize: "1.125rem", color: "var(--text-secondary)", marginBottom: 12 }}>
              {app.role}
            </p>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span className="label">{app.location}{app.remote ? " · REMOTE" : ""}</span>
              <StatusPill status={app.status} days={app.days ?? 0} />
              <span className="label">{app.bucket}</span>
            </div>
          </div>
          {/* Status changer */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STATUSES.map(s => (
              <button
                key={s}
                className="btn"
                onClick={() => handleStatusChange(s)}
                style={{
                  borderColor: app.status === s ? `var(--status-${s})` : undefined,
                  color: app.status === s ? `var(--status-${s})` : undefined,
                  fontSize: "0.625rem",
                  padding: "4px 8px",
                }}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
        {/* Left */}
        <div>
          {/* Score */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 12 }}>MATCH SCORE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "3rem", fontWeight: 300, color: "var(--accent)", lineHeight: 1 }}>
                {app.score.toFixed(1)}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.25rem", letterSpacing: 2 }}>
                  <span style={{ color: "var(--accent)" }}>{"█".repeat(filled)}</span>
                  <span style={{ color: "var(--border)" }}>{"░".repeat(empty)}</span>
                </div>
                <div className="label" style={{ marginTop: 4 }}>{app.bucket} BUCKET</div>
              </div>
            </div>
          </div>

          {/* Next action */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div className="label">NEXT ACTION</div>
              <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 8px" }} onClick={() => setEditingNextAction(!editingNextAction)}>
                {editingNextAction ? "CANCEL" : "EDIT"}
              </button>
            </div>
            {editingNextAction ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={nextActionText}
                  onChange={e => setNextActionText(e.target.value)}
                  style={{ flex: 1, padding: 8, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}
                />
                <button className="btn btn-primary" style={{ padding: "8px 16px" }} onClick={handleSaveNextAction}>SAVE</button>
              </div>
            ) : (
              <p className="mono" style={{ color: "var(--text-primary)" }}>{app.nextAction || "—"}</p>
            )}
          </div>

          {/* Actions */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 16 }}>ACTIONS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button className="btn btn-primary" onClick={() => handleGenerate("resume")} disabled={!!generating}>
                {generating === "resume" ? "GENERATING..." : "TAILOR RESUME"}
              </button>
              <button className="btn" onClick={() => handleGenerate("cover-letter")} disabled={!!generating}>
                {generating === "cover-letter" ? "GENERATING..." : "COVER LETTER"}
              </button>
              <button className="btn" onClick={() => handleGenerate("executive-summary")} disabled={!!generating}>
                {generating === "executive-summary" ? "GENERATING..." : "EXECUTIVE SUMMARY"}
              </button>
              <button className="btn" style={{ borderColor: "var(--accent)", color: "var(--accent)" }} onClick={() => handleGenerate("problem-solver")} disabled={!!generating}>
                {generating === "problem-solver" ? "GENERATING..." : "PROBLEM SOLVER PITCH"}
              </button>
              <button className="btn" onClick={() => handleGenerate("skill-gap")} disabled={!!generating}>
                {generating === "skill-gap" ? "ANALYZING..." : "SKILL GAP"}
              </button>
              <button className="btn" onClick={() => handleGenerate("outreach-hm")} disabled={!!generating}>
                {generating === "outreach-hm" ? "GENERATING..." : "OUTREACH: HM"}
              </button>
              <button className="btn" onClick={() => handleGenerate("linkedin-dm")} disabled={!!generating}>
                {generating === "linkedin-dm" ? "GENERATING..." : "LINKEDIN DM"}
              </button>
              <button className="btn" style={{ borderColor: "var(--error)", color: "var(--error)" }} onClick={handleArchive}>ARCHIVE</button>
            </div>
            {genError && (
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{genError}</span>
                {genError.includes("Settings") && (
                  <Link href="/settings/" className="btn" style={{ borderColor: "var(--error)", color: "var(--error)", textDecoration: "none", fontSize: "0.625rem", padding: "4px 8px" }}>SETTINGS</Link>
                )}
                {genError.includes("profile") && (
                  <Link href="/profile/" className="btn" style={{ textDecoration: "none", fontSize: "0.625rem", padding: "4px 8px" }}>SET UP PROFILE</Link>
                )}
              </div>
            )}
          </div>

          {/* AI Output Panel */}
          {aiOutput && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div className="label" style={{ color: "var(--accent)" }}>
                  {aiOutput.action === "resume" && "TAILORED RESUME"}
                  {aiOutput.action === "cover-letter" && "COVER LETTER"}
                  {aiOutput.action === "executive-summary" && "EXECUTIVE SUMMARY"}
                  {aiOutput.action === "problem-solver" && "PROBLEM SOLVER PITCH"}
                  {aiOutput.action === "outreach-hm" && "OUTREACH EMAIL — HIRING MANAGER"}
                  {aiOutput.action === "linkedin-dm" && "LINKEDIN DM"}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={handleCopy}>
                    {copied ? "COPIED!" : "COPY"}
                  </button>
                  <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={() => setAiOutput(null)}>CLOSE</button>
                </div>
              </div>
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0, maxHeight: 600, overflowY: "auto" }}>
                {aiOutput.content}
              </pre>
            </div>
          )}

          {/* Notes */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div className="label">NOTES</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {saved && <span style={{ color: "var(--success)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>SAVED</span>}
                <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 8px" }} onClick={() => setEditingNote(!editingNote)}>
                  {editingNote ? "CANCEL" : "EDIT"}
                </button>
              </div>
            </div>
            {editingNote ? (
              <div>
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  rows={6}
                  style={{ width: "100%", padding: 8, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", resize: "vertical" }}
                />
                <button className="btn btn-primary" style={{ marginTop: 8, padding: "8px 16px" }} onClick={handleSaveNote}>SAVE NOTES</button>
              </div>
            ) : (
              <p style={{ color: app.notes ? "var(--text-secondary)" : "var(--text-tertiary)", fontSize: "0.875rem", fontFamily: "var(--font-mono)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {app.notes || "No notes yet. Click EDIT to add."}
              </p>
            )}
          </div>

          {/* Skill Gap Panel */}
          {skillGap && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div className="label">SKILL GAP ANALYSIS</div>
                <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={() => setSkillGap(null)}>CLOSE</button>
              </div>

              {/* Readiness bar */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="label" style={{ fontSize: "0.625rem" }}>ROLE READINESS</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: skillGap.overallReadiness >= 75 ? "var(--success)" : skillGap.overallReadiness >= 50 ? "var(--accent)" : "var(--error)" }}>
                    {skillGap.overallReadiness}%
                  </span>
                </div>
                <div style={{ height: 4, background: "var(--border)", borderRadius: 2 }}>
                  <div style={{ height: "100%", borderRadius: 2, width: `${skillGap.overallReadiness}%`, background: skillGap.overallReadiness >= 75 ? "var(--success)" : skillGap.overallReadiness >= 50 ? "var(--accent)" : "var(--error)", transition: "width 0.5s ease" }} />
                </div>
                <p style={{ marginTop: 8, fontSize: "0.8125rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{skillGap.headline}</p>
              </div>

              {skillGap.strongMatches.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="label" style={{ fontSize: "0.625rem", color: "var(--success)", marginBottom: 8 }}>STRONG MATCHES ({skillGap.strongMatches.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {skillGap.strongMatches.map((m, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, fontSize: "0.8125rem" }}>
                        <span style={{ color: "var(--success)", flexShrink: 0 }}>✓</span>
                        <div>
                          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{m.skill}</span>
                          <span style={{ color: "var(--text-tertiary)" }}> — {m.evidence}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {skillGap.partialMatches.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="label" style={{ fontSize: "0.625rem", color: "var(--accent)", marginBottom: 8 }}>PARTIAL MATCHES ({skillGap.partialMatches.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {skillGap.partialMatches.map((m, i) => (
                      <div key={i} style={{ borderLeft: "2px solid var(--accent)", paddingLeft: 10, fontSize: "0.8125rem" }}>
                        <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>{m.skill}</div>
                        <div style={{ color: "var(--text-tertiary)", fontSize: "0.75rem" }}>Gap: {m.gap}</div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>Fix: {m.suggestion}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {skillGap.missingSkills.length > 0 && (
                <div>
                  <div className="label" style={{ fontSize: "0.625rem", color: "var(--error)", marginBottom: 8 }}>GAPS TO ADDRESS ({skillGap.missingSkills.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {skillGap.missingSkills.map((m, i) => (
                      <div key={i} style={{ borderLeft: `2px solid ${m.priority === "high" ? "var(--error)" : m.priority === "medium" ? "var(--accent)" : "var(--border)"}`, paddingLeft: 10, fontSize: "0.8125rem" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{m.skill}</span>
                          <span className="label" style={{ fontSize: "0.5rem", color: m.priority === "high" ? "var(--error)" : "var(--text-tertiary)" }}>{m.priority.toUpperCase()}</span>
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: 2 }}>{m.suggestion}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* JD extract */}
          {app.jdParsed && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 12 }}>AI-EXTRACTED JD INSIGHTS</div>
              {app.jdParsed.keyRequirements?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div className="label" style={{ fontSize: "0.625rem", marginBottom: 6 }}>KEY REQUIREMENTS</div>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {app.jdParsed.keyRequirements.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {app.jdParsed.redFlags?.length > 0 && (
                <div>
                  <div className="label" style={{ fontSize: "0.625rem", color: "var(--error)", marginBottom: 6 }}>RED FLAGS</div>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.8125rem", color: "var(--error)", lineHeight: 1.6 }}>
                    {app.jdParsed.redFlags.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Timeline */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
            <div className="label" style={{ marginBottom: 16 }}>TIMELINE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <span className="mono" style={{ color: "var(--text-tertiary)", minWidth: 90, fontSize: "0.75rem" }}>{app.capturedAt}</span>
                <span className="mono" style={{ color: "var(--status-sourced)", fontSize: "0.75rem" }}>SOURCED</span>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                  {app.sourceUrl ? `from ${app.sourceUrl}` : "JD ingested"}
                </span>
              </div>
              {app.status !== "sourced" && (
                <div style={{ display: "flex", gap: 12 }}>
                  <span className="mono" style={{ color: "var(--text-tertiary)", minWidth: 90, fontSize: "0.75rem" }}>{app.updatedAt?.split("T")[0] ?? app.capturedAt}</span>
                  <span className="mono" style={{ color: `var(--status-${app.status})`, fontSize: "0.75rem" }}>{app.status.toUpperCase()}</span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>Status updated</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right */}
        <div>
          {/* Metadata */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 16 }}>METADATA</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {([
                ["STATUS", app.status.toUpperCase()],
                ["BUCKET", app.bucket],
                ["SENIORITY", app.seniority],
                ["SECTOR", app.sector],
                ["REMOTE", app.remote ? "YES" : "NO"],
                ["CAPTURED", app.capturedAt],
                ["DAYS IN PIPELINE", `${app.days ?? 0}`],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <div className="label" style={{ fontSize: "0.625rem", marginBottom: 2 }}>{label}</div>
                  <div className="mono" style={{ fontSize: "0.8125rem" }}>{value || "—"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Contacts */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 12 }}>CONTACTS</div>
            {(app.contacts ?? []).length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {app.contacts.map((c, i) => (
                  <div key={i} className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{typeof c === "string" ? c : JSON.stringify(c)}</div>
                ))}
              </div>
            ) : (
              <p className="label" style={{ color: "var(--text-tertiary)" }}>NO CONTACTS YET</p>
            )}
          </div>

          {/* Source URL */}
          {app.sourceUrl && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
              <div className="label" style={{ marginBottom: 8 }}>SOURCE</div>
              <a href={app.sourceUrl.startsWith("http") ? app.sourceUrl : `https://${app.sourceUrl}`}
                target="_blank" rel="noopener noreferrer"
                style={{ color: "var(--accent)", fontSize: "0.8125rem", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                {app.sourceUrl}
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ApplicationPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <Suspense fallback={<div style={{ padding: 48, textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>LOADING...</div>}>
        <ApplicationDetail />
      </Suspense>
      <Footer />
    </div>
  );
}
