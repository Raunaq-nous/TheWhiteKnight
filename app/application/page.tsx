"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header, Footer, ScoreBar, StatusPill } from "../components";
import { getApplication, updateApplication, deleteApplication, Application, Interview, generateId } from "../../lib/store";
import { getProfile } from "../../lib/profile";
import { NLUpdateResult } from "../../lib/prompts";
import { getModelSettings } from "../../lib/model-settings";
import { generateTailoredResume, generateCoverLetter, generateExecutiveSummary, generateProblemSolverPitch, generateSkillGap, generateHMOutreach, generateLinkedInDM, generateCEOColdEmail, refineGeneration, GenerationAction, SkillGapResult } from "../../lib/generate";
import { queueDM, queueOutreach, queueCEOEmail, scheduleFollowUp } from "../../lib/notifications";
import { ContactsPanel } from "../contacts-panel";
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
  const [showContacts, setShowContacts] = useState(false);
  const [nlText, setNlText] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const [nlParsed, setNlParsed] = useState<NLUpdateResult | null>(null);
  const [nlError, setNlError] = useState("");
  const [nlApplied, setNlApplied] = useState(false);
  const [refineText, setRefineText] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState("");
  const [versionHistory, setVersionHistory] = useState<{ action: GenerationAction; content: string; instruction?: string }[]>([]);
  const [loadingApp, setLoadingApp] = useState(true);

  useEffect(() => {
    if (!slug) { setLoadingApp(false); return; }
    const found = getApplication(slug);
    if (found) {
      setApp(found);
      setNoteText(found.notes ?? "");
      setNextActionText(found.nextAction ?? "");
    }
    setLoadingApp(false);
  }, [slug]);

  if (loadingApp) return <div style={{ padding: 48, textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>LOADING...</div>;
  if (!slug) return <div style={{ padding: 48, textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>NO APPLICATION SELECTED</div>;
  if (!app) {
    let storedSlugs: string[] = [];
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("careeros_apps") : null;
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) storedSlugs = parsed.map((a: any) => a.slug).filter(Boolean);
    } catch {}
    return (
      <div style={{ padding: 48, maxWidth: 480, margin: "0 auto", fontFamily: "var(--font-mono)" }}>
        <div style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 12, color: "var(--text-primary)" }}>APPLICATION NOT FOUND</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: 8 }}>Looking for: <code style={{ background: "var(--surface)", padding: "2px 6px", borderRadius: 2 }}>{slug}</code></div>
        {storedSlugs.length > 0 ? (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: 6 }}>Stored applications ({storedSlugs.length}):</div>
            {storedSlugs.map(s => (
              <div key={s}>
                <a href={`/application/?slug=${s}`} style={{ fontSize: "0.75rem", color: "var(--accent)", display: "block", padding: "2px 0" }}>{s}</a>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: "0.75rem", color: "var(--error)", marginBottom: 24 }}>No applications found in localStorage on this browser.</div>
        )}
        <a href="/" style={{ fontSize: "0.75rem", color: "var(--accent)" }}>← BACK TO PIPELINE</a>
      </div>
    );
  }

  const filled = Math.round(app.score);
  const empty = 10 - filled;

  const handleStatusChange = (newStatus: typeof STATUSES[number]) => {
    if (!app.id) return;
    updateApplication(app.id, { status: newStatus });
    setApp(prev => prev ? { ...prev, status: newStatus } : prev);
    if (newStatus === "applied") {
      scheduleFollowUp(app.slug, app.company, app.role, 7);
    }
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
    setVersionHistory([]);
    setRefineText("");
    setRefineError("");
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
        else if (action === "outreach-hm") {
          content = await generateHMOutreach(profile, app);
          queueOutreach(app.slug, app.company, app.role, content);
        } else if (action === "linkedin-dm") {
          content = await generateLinkedInDM(profile, app);
          queueDM(app.slug, app.company, app.role, content);
        } else if (action === "ceo-cold-email") {
          content = await generateCEOColdEmail(profile, app);
          queueCEOEmail(app.slug, app.company, app.role, content);
        }
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

  const handleRefine = async () => {
    if (!aiOutput || !refineText.trim() || !app) return;
    const profile = getProfile();
    if (!profile) { setRefineError("No profile found."); return; }
    setRefining(true);
    setRefineError("");
    try {
      const newContent = await refineGeneration(aiOutput.action, profile, app, aiOutput.content, refineText.trim());
      setVersionHistory(prev => [...prev, { action: aiOutput.action, content: aiOutput.content, instruction: refineText.trim() }]);
      setAiOutput({ action: aiOutput.action, content: newContent });
      setRefineText("");
    } catch (e: any) {
      setRefineError(e.message || "Refine failed.");
    } finally {
      setRefining(false);
    }
  };

  const handleUndoRefine = () => {
    if (versionHistory.length === 0 || !aiOutput) return;
    const previous = versionHistory[versionHistory.length - 1];
    setAiOutput({ action: previous.action, content: previous.content });
    setVersionHistory(prev => prev.slice(0, -1));
  };

  const handleDownloadMd = () => {
    if (!aiOutput || !app) return;
    const filename = `${app.company.toLowerCase().replace(/\s+/g, "-")}-${app.role.toLowerCase().replace(/\s+/g, "-")}-${aiOutput.action}.md`;
    const blob = new Blob([aiOutput.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    if (!aiOutput || !app) return;
    const md = aiOutput.content;
    // Minimal markdown -> HTML transform tuned for resume/letter outputs
    const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Render markdown inline patterns: **bold**, [text](url), bare http(s) URLs, and email addresses
    const renderInline = (text: string): string => {
      let out = escapeHtml(text);
      // Markdown links [label](url) -> <a>
      out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) =>
        `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`
      );
      // Bare http(s) URLs not already inside an href attribute
      out = out.replace(/(?<!href=")(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
      // Email addresses
      out = out.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1">$1</a>');
      // Bold
      out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return out;
    };
    const lines = md.split("\n");
    let html = "";
    let inList = false;
    const flushList = () => { if (inList) { html += "</ul>"; inList = false; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) { flushList(); continue; }
      if (line.startsWith("# ")) { flushList(); html += `<h1>${renderInline(line.slice(2))}</h1>`; continue; }
      if (line.startsWith("## ")) { flushList(); html += `<h2>${renderInline(line.slice(3))}</h2>`; continue; }
      if (line.startsWith("### ")) { flushList(); html += `<h3>${renderInline(line.slice(4))}</h3>`; continue; }
      if (/^[-*]\s+/.test(line)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${renderInline(line.replace(/^[-*]\s+/, ""))}</li>`;
        continue;
      }
      flushList();
      html += `<p>${renderInline(line)}</p>`;
    }
    flushList();
    const title = `${app.company} - ${app.role} - ${aiOutput.action}`;
    const win = window.open("", "_blank");
    if (!win) { alert("Popup blocked. Allow popups to export PDF."); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: letter portrait; margin: 0.45in; }
body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; line-height: 1.35; font-size: 10.5pt; max-width: 7.5in; margin: 0 auto; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font-size: 18pt; margin: 0 0 4px; letter-spacing: 0.3px; }
h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #333; padding-bottom: 2px; margin: 12px 0 6px; }
h3 { font-size: 10.5pt; margin: 8px 0 2px; }
p { margin: 2px 0; }
ul { margin: 2px 0 6px; padding-left: 18px; }
li { margin: 1px 0; }
strong { font-weight: 600; }
a { color: #0a58ca; text-decoration: none; border-bottom: 1px solid rgba(10,88,202,0.3); }
.toolbar { display: none; }
@media screen {
  .toolbar { display: flex !important; position: fixed; top: 12px; right: 12px; gap: 6px; z-index: 999; }
  .toolbar button { font: 12px -apple-system, sans-serif; padding: 8px 14px; background: #111; color: #fff; border: 0; border-radius: 4px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  body { background: #f5f5f5; padding: 24px 0; }
  #content { background: white; padding: 0.45in; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
}
@media print {
  .toolbar { display: none !important; visibility: hidden !important; }
  a { color: #0a58ca; text-decoration: underline; border: none; }
  body { background: white; padding: 0; }
  #content { box-shadow: none; padding: 0; }
}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">SAVE AS PDF</button><button onclick="window.close()">CLOSE</button></div>
<div id="content">${html}</div>
<script>
window.addEventListener('load', function() {
  var content = document.getElementById('content');
  var pageH = 970;
  var h = content.scrollHeight;
  if (h > pageH) {
    var scale = (pageH / h).toFixed(4);
    content.style.transform = 'scale(' + scale + ')';
    content.style.transformOrigin = 'top left';
    content.style.width = Math.round(100 / parseFloat(scale)) + '%';
  }
});
<\/script>
</body></html>`);
    win.document.close();
  };

  const handleArchive = () => {
    if (!app.id || !confirm(`Archive ${app.company} — ${app.role}?`)) return;
    deleteApplication(app.id);
    router.push("/");
  };

  const handleNLUpdate = async () => {
    if (!nlText.trim() || !app) return;
    setNlLoading(true);
    setNlError("");
    setNlParsed(null);
    setNlApplied(false);
    try {
      const s = getModelSettings();
      const providerSettings = s.provider !== "together" ? { provider: s.provider, model: s.model, apiKey: s.apiKey } : undefined;
      const res = await fetch("/api/nl-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nlText, app, providerSettings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      setNlParsed(data);
    } catch (e: any) {
      setNlError(e.message || "Failed to parse update.");
    } finally {
      setNlLoading(false);
    }
  };

  const applyNLUpdate = () => {
    if (!nlParsed || !app?.id) return;
    const changes: Partial<Application> = {};

    if (nlParsed.statusChange && nlParsed.newStatus) {
      changes.status = nlParsed.newStatus;
      if (nlParsed.newStatus === "applied") scheduleFollowUp(app.slug, app.company, app.role, nlParsed.reminderDays ?? 7);
    }

    if (nlParsed.noteToAppend) {
      const today = new Date().toISOString().split("T")[0];
      const existing = app.notes ?? "";
      changes.notes = existing ? `${existing}\n\n[${today}] ${nlParsed.noteToAppend}` : `[${today}] ${nlParsed.noteToAppend}`;
    }

    if (nlParsed.interview) {
      const iv = nlParsed.interview;
      const newInterview: Interview = {
        id: generateId(),
        round: iv.round,
        scheduledAt: iv.scheduledAt ?? undefined,
        contact: iv.contact ?? undefined,
        format: iv.format ?? undefined,
        outcome: "pending",
        createdAt: new Date().toISOString(),
      };
      changes.interviews = [...(app.interviews ?? []), newInterview];
    }

    if (nlParsed.contact) {
      changes.contacts = [...(app.contacts ?? []), `${nlParsed.contact.name}${nlParsed.contact.title ? ` (${nlParsed.contact.title})` : ""}`];
    }

    if (nlParsed.reminderDays && !nlParsed.statusChange) {
      scheduleFollowUp(app.slug, app.company, app.role, nlParsed.reminderDays);
    }

    updateApplication(app.id, changes);
    setApp(prev => prev ? { ...prev, ...changes } : prev);
    if (changes.notes) setNoteText(changes.notes);
    setNlApplied(true);
    setNlText("");
    setTimeout(() => { setNlParsed(null); setNlApplied(false); }, 3000);
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

      {/* NL Update */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 10, fontSize: "0.625rem" }}>LOG UPDATE</div>
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            value={nlText}
            onChange={e => setNlText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleNLUpdate(); }}
            placeholder='e.g. "Got a call from Priya at Bain. Second round case interview next Tuesday at 2pm via video."'
            rows={2}
            style={{ flex: 1, padding: "8px 10px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", resize: "vertical" }}
          />
          <button className="btn btn-primary" onClick={handleNLUpdate} disabled={nlLoading || !nlText.trim()} style={{ alignSelf: "flex-end", padding: "8px 16px", whiteSpace: "nowrap" }}>
            {nlLoading ? "PARSING..." : "UPDATE"}
          </button>
        </div>
        <div className="label" style={{ marginTop: 4, fontSize: "0.5rem", color: "var(--text-tertiary)" }}>⌘+ENTER TO SUBMIT</div>
        {nlError && <div style={{ marginTop: 8, color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{nlError}</div>}

        {nlApplied && (
          <div style={{ marginTop: 10, color: "var(--success)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>APPLIED — APPLICATION UPDATED</div>
        )}

        {nlParsed && !nlApplied && (
          <div style={{ marginTop: 12, background: "var(--bg-primary)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 14 }}>
            <div className="label" style={{ color: "var(--accent)", marginBottom: 8, fontSize: "0.625rem" }}>PARSED UPDATE — CONFIRM TO APPLY</div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-primary)", marginBottom: 10 }}>{nlParsed.summary}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              {nlParsed.statusChange && nlParsed.newStatus && (
                <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--text-tertiary)" }}>STATUS →</span> <span style={{ color: `var(--status-${nlParsed.newStatus})`, textTransform: "uppercase" }}>{nlParsed.newStatus}</span>
                </div>
              )}
              {nlParsed.interview && (
                <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--text-tertiary)" }}>INTERVIEW →</span> {nlParsed.interview.round.replace(/_/g, " ").toUpperCase()}{nlParsed.interview.scheduledAt ? ` on ${nlParsed.interview.scheduledAt}` : ""}{nlParsed.interview.format ? ` via ${nlParsed.interview.format}` : ""}
                </div>
              )}
              {nlParsed.contact && (
                <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--text-tertiary)" }}>CONTACT →</span> {nlParsed.contact.name}{nlParsed.contact.title ? ` (${nlParsed.contact.title})` : ""}
                </div>
              )}
              {nlParsed.reminderDays && (
                <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--text-tertiary)" }}>REMINDER →</span> in {nlParsed.reminderDays} days
                </div>
              )}
              <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-tertiary)" }}>NOTE →</span> {nlParsed.noteToAppend}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" style={{ padding: "6px 14px" }} onClick={applyNLUpdate}>APPLY CHANGES</button>
              <button className="btn" style={{ padding: "6px 14px" }} onClick={() => setNlParsed(null)}>DISMISS</button>
            </div>
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="app-two-col">
        {/* Left */}
        <div>
          {/* Score */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
            {app.afScore ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div className="label" style={{ marginBottom: 4 }}>A-F EVALUATION</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "3rem", fontWeight: 300, lineHeight: 1, color: app.afScore.global >= 4.5 ? "var(--success)" : app.afScore.global >= 4.0 ? "var(--accent)" : app.afScore.global >= 3.5 ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {app.afScore.global?.toFixed(1)}
                      </span>
                      <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>/5</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="label" style={{ marginBottom: 4 }}>ARCHETYPE</div>
                    <div style={{ color: "var(--text-primary)", fontSize: "0.875rem" }}>{app.afScore.archetype?.primary}</div>
                    {app.afScore.archetype?.secondary && (
                      <div style={{ color: "var(--text-tertiary)", fontSize: "0.75rem" }}>+ {app.afScore.archetype.secondary}</div>
                    )}
                  </div>
                </div>
                {[
                  { key: "cv_match" as const, label: "CV MATCH" },
                  { key: "north_star" as const, label: "NORTH STAR" },
                  { key: "comp" as const, label: "COMP" },
                  { key: "culture" as const, label: "CULTURE" },
                  { key: "red_flags" as const, label: "RED FLAGS (5=NONE)" },
                ].map(({ key, label }) => {
                  const block = app.afScore!.scores[key];
                  if (!block) return null;
                  const color = block.score >= 4 ? "var(--success)" : block.score >= 3 ? "var(--accent)" : "var(--error)";
                  return (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border-light)", fontSize: "0.75rem" }}>
                      <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.05em" }}>{label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ color: "var(--text-tertiary)", maxWidth: 220, textAlign: "right", fontSize: "0.7rem" }}>{block.reasoning}</span>
                        <span style={{ color, fontFamily: "var(--font-mono)", fontWeight: 600, minWidth: 28, textAlign: "right" }}>{block.score}/5</span>
                      </div>
                    </div>
                  );
                })}
                {app.afScore.legitimacy && (
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="label" style={{ fontSize: "0.625rem" }}>LEGITIMACY</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", textTransform: "uppercase", color: app.afScore.legitimacy.tier === "high_confidence" ? "var(--success)" : app.afScore.legitimacy.tier === "suspicious" ? "var(--error)" : "var(--accent)" }}>
                      {app.afScore.legitimacy.tier?.replace(/_/g, " ")}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
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
              </>
            )}
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
              <>
                <p className="mono" style={{ color: "var(--text-primary)", marginBottom: app.nextAction ? 12 : 0 }}>{app.nextAction || "—"}</p>
                {app.nextAction && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {/tailor|resume|cv/i.test(app.nextAction) && (
                      <button className="btn btn-primary" style={{ fontSize: "0.6875rem", padding: "6px 14px" }} onClick={() => handleGenerate("resume")} disabled={!!generating}>
                        {generating === "resume" ? "GENERATING..." : "TAILOR RESUME →"}
                      </button>
                    )}
                    {/apply/i.test(app.nextAction) && app.sourceUrl && (
                      <a className="btn btn-primary" href={app.sourceUrl.startsWith("http") ? app.sourceUrl : `https://${app.sourceUrl}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.6875rem", padding: "6px 14px", textDecoration: "none" }}>
                        OPEN POSTING →
                      </a>
                    )}
                    {/(outreach|reach out|email|message|dm|contact)/i.test(app.nextAction) && (
                      <button className="btn" style={{ fontSize: "0.6875rem", padding: "6px 14px" }} onClick={() => handleGenerate("outreach-hm")} disabled={!!generating}>
                        DRAFT OUTREACH →
                      </button>
                    )}
                    {/skip|reject|archive/i.test(app.nextAction) && (
                      <button className="btn" style={{ fontSize: "0.6875rem", padding: "6px 14px", borderColor: "var(--error)", color: "var(--error)" }} onClick={handleArchive}>
                        ARCHIVE →
                      </button>
                    )}
                    {/review|decide/i.test(app.nextAction) && (
                      <button className="btn" style={{ fontSize: "0.6875rem", padding: "6px 14px" }} onClick={() => handleStatusChange("reviewed")}>
                        MARK REVIEWED →
                      </button>
                    )}
                    <button
                      className="btn"
                      style={{ fontSize: "0.6875rem", padding: "6px 14px", color: "var(--text-tertiary)" }}
                      onClick={() => { setNextActionText(""); if (app.id) { updateApplication(app.id, { nextAction: "" }); setApp(prev => prev ? { ...prev, nextAction: "" } : prev); } }}
                    >
                      MARK DONE ✓
                    </button>
                  </div>
                )}
              </>
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
              <button className="btn" style={{ borderColor: "#a78bfa", color: "#a78bfa" }} onClick={() => handleGenerate("ceo-cold-email")} disabled={!!generating}>
                {generating === "ceo-cold-email" ? "GENERATING..." : "CEO COLD EMAIL"}
              </button>
              <button className="btn" style={{ borderColor: "var(--accent)", color: "var(--accent)" }} onClick={() => setShowContacts(s => !s)}>
                {showContacts ? "HIDE CONTACTS" : "FIND CONTACTS"}
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

          {/* Contacts Panel */}
          {showContacts && (() => {
            const profile = getProfile();
            return profile ? <ContactsPanel app={app} profile={profile} onClose={() => setShowContacts(false)} /> : null;
          })()}

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
                  {aiOutput.action === "ceo-cold-email" && "CEO COLD EMAIL"}
                  {aiOutput.action === "referral-dm" && "REFERRAL DM"}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={handleCopy}>
                    {copied ? "COPIED!" : "COPY"}
                  </button>
                  <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={handleDownloadMd}>DOWNLOAD .MD</button>
                  <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px", borderColor: "var(--accent)", color: "var(--accent)" }} onClick={handleExportPdf}>EXPORT PDF</button>
                  <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={() => setAiOutput(null)}>CLOSE</button>
                </div>
              </div>
              {aiOutput.content?.trim() ? (
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0, maxHeight: 600, overflowY: "auto" }}>
                  {aiOutput.content}
                </pre>
              ) : (
                <div style={{ color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                  AI returned an empty response. Try regenerating, or switch model in Settings if Together is rate-limited.
                  <div style={{ marginTop: 12 }}>
                    <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.75rem" }} onClick={() => handleGenerate(aiOutput.action)}>REGENERATE</button>
                  </div>
                </div>
              )}

              {/* Refine with AI — chat box */}
              {aiOutput.content?.trim() && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px dashed var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                    <div className="label" style={{ fontSize: "0.625rem", color: "var(--accent)" }}>REFINE WITH AI</div>
                    {versionHistory.length > 0 && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5625rem", color: "var(--text-tertiary)" }}>
                          {versionHistory.length} edit{versionHistory.length === 1 ? "" : "s"}
                        </span>
                        <button className="btn" style={{ fontSize: "0.5625rem", padding: "2px 8px" }} onClick={handleUndoRefine} disabled={refining}>
                          UNDO LAST
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: 8, lineHeight: 1.5 }}>
                    Tell the AI what to change. Examples: "Remove the Capital Projects line from Bain", "Make the summary punchier", "Add my IIM degree to Education", "Rewrite paragraph 2 to focus on AI work". The model will only edit what you ask.
                  </div>
                  <textarea
                    value={refineText}
                    onChange={e => setRefineText(e.target.value)}
                    placeholder="What should change?"
                    rows={3}
                    disabled={refining}
                    onKeyDown={e => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleRefine();
                      }
                    }}
                    style={{ width: "100%", padding: 10, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", resize: "vertical", borderRadius: 4 }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5625rem", color: "var(--text-tertiary)" }}>Cmd/Ctrl+Enter to send</span>
                    <button
                      className="btn btn-primary"
                      style={{ padding: "6px 14px", fontSize: "0.75rem" }}
                      onClick={handleRefine}
                      disabled={!refineText.trim() || refining}
                    >
                      {refining ? "REFINING..." : "APPLY EDIT"}
                    </button>
                  </div>
                  {refineError && (
                    <div style={{ marginTop: 8, color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.6875rem" }}>{refineError}</div>
                  )}
                </div>
              )}
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <div className="label">AI-EXTRACTED JD INSIGHTS</div>
                {app.jdParsed.yearsExperienceRequired && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--accent)", border: "1px solid var(--accent)", padding: "2px 8px", borderRadius: 2 }}>
                    {app.jdParsed.yearsExperienceRequired}+ YRS REQUIRED
                  </div>
                )}
              </div>

              {/* ATS Keywords cloud */}
              {app.jdParsed.keywords?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div className="label" style={{ fontSize: "0.625rem", color: "var(--accent)" }}>ATS KEYWORDS — use these exact phrases in your resume</div>
                    <button
                      className="btn"
                      style={{ fontSize: "0.5rem", padding: "2px 8px" }}
                      onClick={() => navigator.clipboard.writeText(app.jdParsed!.keywords.join(", "))}
                    >COPY ALL</button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {app.jdParsed.keywords.map((kw: string, i: number) => (
                      <span
                        key={i}
                        onClick={() => navigator.clipboard.writeText(kw)}
                        style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", padding: "3px 8px", background: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.3)", borderRadius: 2, color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}
                        title="Click to copy"
                      >{kw}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Technical skills */}
              {app.jdParsed.technicalSkills?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="label" style={{ fontSize: "0.625rem", marginBottom: 8 }}>TECHNICAL SKILLS REQUIRED</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {app.jdParsed.technicalSkills.map((s: string, i: number) => (
                      <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", padding: "3px 8px", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 2, color: "var(--text-secondary)" }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Soft skills */}
              {app.jdParsed.softSkills?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="label" style={{ fontSize: "0.625rem", marginBottom: 8 }}>SOFT SKILLS / BEHAVIOURS</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {app.jdParsed.softSkills.map((s: string, i: number) => (
                      <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", padding: "3px 8px", background: "var(--bg-primary)", border: "1px solid var(--border-light)", borderRadius: 2, color: "var(--text-tertiary)" }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Key requirements */}
              {app.jdParsed.keyRequirements?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="label" style={{ fontSize: "0.625rem", marginBottom: 8 }}>KEY REQUIREMENTS</div>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
                    {app.jdParsed.keyRequirements.map((r: string, i: number) => (
                      <li key={i} style={{ paddingLeft: 4 }}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Red flags */}
              {app.jdParsed.redFlags?.length > 0 && (
                <div style={{ padding: "10px 14px", background: "rgba(255,50,50,0.06)", border: "1px solid rgba(255,50,50,0.2)", borderRadius: "var(--radius)" }}>
                  <div className="label" style={{ fontSize: "0.625rem", color: "var(--error)", marginBottom: 6 }}>RED FLAGS</div>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.8125rem", color: "var(--error)", lineHeight: 1.6, opacity: 0.85 }}>
                    {app.jdParsed.redFlags.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Interview Log */}
          {(app.interviews ?? []).length > 0 && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 16 }}>INTERVIEWS ({app.interviews.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {app.interviews.map((iv, i) => {
                  const outcomeColor = iv.outcome === "passed" ? "var(--success)" : iv.outcome === "rejected" ? "var(--error)" : iv.outcome === "cancelled" ? "var(--text-tertiary)" : "var(--accent)";
                  return (
                    <div key={iv.id ?? i} style={{ borderLeft: "2px solid var(--border)", paddingLeft: 12 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", color: "var(--text-primary)" }}>
                          {iv.round?.replace(/_/g, " ")}
                        </span>
                        {iv.format && <span className="label" style={{ fontSize: "0.5rem", borderRadius: 2, padding: "1px 5px", background: "var(--bg-primary)" }}>{iv.format.toUpperCase()}</span>}
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: outcomeColor, marginLeft: "auto", textTransform: "uppercase" }}>{iv.outcome ?? "pending"}</span>
                      </div>
                      {iv.scheduledAt && <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{iv.scheduledAt}</div>}
                      {iv.contact && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>with {iv.contact}{iv.interviewerTitle ? ` · ${iv.interviewerTitle}` : ""}</div>}
                      {iv.notes && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>{iv.notes}</div>}
                    </div>
                  );
                })}
              </div>
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
              {(app.interviews ?? []).map((iv, i) => (
                <div key={iv.id ?? i} style={{ display: "flex", gap: 12 }}>
                  <span className="mono" style={{ color: "var(--text-tertiary)", minWidth: 90, fontSize: "0.75rem" }}>{iv.scheduledAt ?? iv.createdAt?.split("T")[0]}</span>
                  <span className="mono" style={{ color: "var(--status-interview)", fontSize: "0.75rem" }}>INTERVIEW</span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>{iv.round?.replace(/_/g, " ").toUpperCase()}{iv.contact ? ` with ${iv.contact}` : ""}</span>
                </div>
              ))}
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
