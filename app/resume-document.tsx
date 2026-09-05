"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ResumeContent, ResumeSectionKey, resolveSectionSequence, formatDegreeLine } from "../lib/resume-schema";
import { ResumeArchetype, resolveMaxPages } from "../lib/resume-archetype";
import type { FormatGateViolation, OutcomeWarning } from "../lib/resume-format-gate";
import type { Application } from "../lib/store";
import { getProfile, saveProfile } from "../lib/profile";
import { rewriteBulletFromAnswer, replaceBulletInProfile } from "../lib/profile-enrichment";
import { showToast } from "../lib/toast";

// Targeted, named question for a bullet the format gate flagged as having
// no identifiable outcome — same "name the specific thing" convention as
// buildReactiveProbeQuestion (lib/resume-requirement-map.ts), never generic.
function buildOutcomeGapQuestion(w: OutcomeWarning): string {
  return `Your bullet under ${w.company} ("${w.text}") doesn't have an explicit outcome. What was the concrete result — a number, a decision it enabled, or what it produced?`;
}

// This preview is a visual approximation only — it no longer has any role
// in whether the exported document fits one page. The actual PDF is a
// direct LibreOffice conversion of the generated .docx (lib/resume-docx.ts,
// lib/server/resume-pdf-pipeline.ts), verified server-side by the PDF
// extraction gate (lib/resume-pdf-extract-gate.ts), which is what this
// on-screen render used to try to reproduce with browser font metrics.

function sortedBullets(bullets: ResumeContent["experience"][number]["bullets"]) {
  return [...bullets].sort((a, b) => a.priority - b.priority);
}

function hrefFor(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

type LinkKind = "linkedin" | "github" | "portfolio";

function linkKindFor(label: string): LinkKind {
  const l = label.toLowerCase();
  if (l.includes("linkedin")) return "linkedin";
  if (l.includes("github")) return "github";
  return "portfolio";
}

// Small inline SVG badges (built from plain shapes/text, not traced brand
// logo paths) — inline SVG survives browser print-to-PDF, unlike icon
// fonts or background images, which is why this isn't a font-icon library.
function LinkIcon({ kind }: { kind: LinkKind }) {
  const size = 12;
  if (kind === "linkedin") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ verticalAlign: "-1.5px", marginRight: 3 }}>
        <rect width="16" height="16" rx="3" fill="#0a58ca" />
        <text x="8" y="11.5" textAnchor="middle" fontSize="8" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fill="#fff">in</text>
      </svg>
    );
  }
  if (kind === "github") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ verticalAlign: "-1.5px", marginRight: 3 }}>
        <rect width="16" height="16" rx="3" fill="#24292e" />
        <text x="8" y="11.5" textAnchor="middle" fontSize="6.5" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fill="#fff">GH</text>
      </svg>
    );
  }
  // portfolio / website — simple globe built from primitives only.
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ verticalAlign: "-1.5px", marginRight: 3 }}>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="#0a58ca" strokeWidth="1.2" />
      <ellipse cx="8" cy="8" rx="2.8" ry="6.5" fill="none" stroke="#0a58ca" strokeWidth="1" />
      <line x1="1.5" y1="8" x2="14.5" y2="8" stroke="#0a58ca" strokeWidth="1" />
    </svg>
  );
}

// Visual approximation only, always rendered at scale 1 — see the module
// header comment. contentRef is kept as an unused optional hook point, not
// load-bearing for anything.
function ResumePage({
  content,
  scale,
  sequence,
  contentRef,
}: {
  content: ResumeContent;
  scale: number;
  sequence: ResumeSectionKey[];
  contentRef?: React.Ref<HTMLDivElement>;
}) {
  const bodyPt = 10.8 * scale;
  const lineHeight = 1.34;
  const sectionGap = 15 * scale;
  const bulletGap = 3.5 * scale;

  const pageStyle: React.CSSProperties = {
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: `${bodyPt}pt`,
    lineHeight,
    color: "#1a1a1a",
    width: "8.5in",
    minHeight: "11in",
    padding: "0.5in",
    background: "#fff",
    boxSizing: "border-box",
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "10.5pt",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    borderBottom: "1px solid #1a1a1a",
    paddingBottom: 2,
    marginBottom: 6,
  };

  const section = (key: string, node: React.ReactNode) => (
    <div key={key} className="resume-section" style={{ marginTop: sectionGap }}>{node}</div>
  );

  const blocks: Record<ResumeSectionKey, React.ReactNode> = {
    summary: content.summary?.trim()
      ? section("summary", <div>{content.summary}</div>)
      : null,

    keyWins: content.keyWins && content.keyWins.length > 0
      ? section("keyWins", <>
          <div style={sectionTitleStyle}>Key Wins</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {content.keyWins.map((w, i) => <li key={i} style={{ marginBottom: bulletGap }}>{w}</li>)}
          </ul>
        </>)
      : null,

    projects: content.projects && content.projects.length > 0
      ? section("projects", <>
          <div style={sectionTitleStyle}>Relevant Projects</div>
          {content.projects.map((p, i) => (
            <div key={i} className="resume-entry" style={{ marginBottom: 4 }}>
              <span style={{ fontWeight: 700 }}>{p.name}</span>{": "}{p.description}
            </div>
          ))}
        </>)
      : null,

    // Combined band — keyWins + projects rendered together under ONE
    // heading. Used instead of placing "keyWins"/"projects" separately in
    // a sequence, so consulting resumes never end up with two adjacent
    // impact sections.
    selectedImpact: ((content.keyWins && content.keyWins.length > 0) || (content.projects && content.projects.length > 0))
      ? section("selectedImpact", <>
          <div style={sectionTitleStyle}>Key Projects &amp; Impact</div>
          {content.keyWins && content.keyWins.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {content.keyWins.map((w, i) => <li key={`kw-${i}`} style={{ marginBottom: bulletGap }}>{w}</li>)}
            </ul>
          )}
          {content.projects && content.projects.length > 0 && (
            <div style={{ marginTop: content.keyWins?.length ? bulletGap : 0 }}>
              {content.projects.map((p, i) => (
                <div key={`pr-${i}`} className="resume-entry" style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: 700 }}>{p.name}</span>{": "}{p.description}
                </div>
              ))}
            </div>
          )}
        </>)
      : null,

    experience: content.experience.length > 0
      ? section("experience", <>
          <div style={sectionTitleStyle}>Experience</div>
          {content.experience.map((e, i) => (
            <div
              key={i}
              className="resume-entry"
              style={{ marginBottom: i === content.experience.length - 1 ? 0 : sectionGap * 0.6 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5pt" }}>
                {/* Employer name leads and is bold — screeners (consulting
                    especially) scan firm names first, before the role. */}
                <span><span style={{ fontWeight: 700 }}>{e.company}</span>{e.role ? `, ${e.role}` : ""}</span>
                <span style={{ fontWeight: 400, fontStyle: "italic" }}>{e.tenure}</span>
              </div>
              {e.location && <div style={{ fontSize: "9pt", fontStyle: "italic", color: "#444", marginBottom: 2 }}>{e.location}</div>}
              <ul style={{ margin: `${bulletGap}px 0 0`, paddingLeft: 18 }}>
                {sortedBullets(e.bullets).map((b, j) => (
                  <li key={j} style={{ marginBottom: bulletGap }}>{b.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </>)
      : null,

    education: content.education.length > 0
      ? section("education", <>
          <div style={sectionTitleStyle}>Education</div>
          {content.education.map((ed, i) => (
            <div key={i} className="resume-entry" style={{ marginBottom: i === content.education.length - 1 ? 0 : 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>{ed.institution}</span>
                <span style={{ fontWeight: 400, fontStyle: "italic" }}>{ed.years}</span>
              </div>
              <div style={{ fontSize: "9.5pt" }}>
                {formatDegreeLine(ed.degree, ed.field)}{ed.gpa ? ` - GPA: ${ed.gpa}` : ""}
              </div>
              {ed.achievements?.map((a, j) => <div key={j} style={{ fontSize: "9pt", color: "#333" }}>{a}</div>)}
            </div>
          ))}
        </>)
      : null,

    skills: content.skills.length > 0
      ? section("skills", <>
          <div style={sectionTitleStyle}>Skills</div>
          {content.skills.map((g, i) => (
            <div key={i}><span style={{ fontWeight: 700 }}>{g.category}:</span> {g.items.join(", ")}</div>
          ))}
        </>)
      : null,

    leadership: content.leadership && content.leadership.length > 0
      ? section("leadership", <>
          <div style={sectionTitleStyle}>Leadership &amp; Activities</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {content.leadership.map((l, i) => <li key={i} style={{ marginBottom: bulletGap }}>{l}</li>)}
          </ul>
        </>)
      : null,

    certifications: content.certifications && content.certifications.length > 0
      ? section("certifications", <>
          <div style={sectionTitleStyle}>Certifications</div>
          {content.certifications.map((c, i) => (
            <div key={i}>{c.name}{c.issuer ? ` - ${c.issuer}` : ""}{c.date ? ` (${c.date})` : ""}</div>
          ))}
        </>)
      : null,
  };

  return (
    <div className="resume-page" style={pageStyle}>
      <div ref={contentRef} className="resume-page-content">
        <div className="resume-section" style={{ breakInside: "avoid" }}>
          <div style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "21pt", fontWeight: 700, letterSpacing: "0.02em" }}>
            {content.name}
          </div>
          {/* Single clean contact row: email/phone as plain text, each link
              as an icon+label pair, laid out with flex+gap (not stacked,
              not "|"-separated) — no location or "open to" line at all. */}
          <div style={{
            display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 2,
            fontFamily: "Arial, Helvetica, sans-serif", fontSize: "9.5pt", color: "#333", marginTop: 3,
          }}>
            {content.contactLine && <span>{content.contactLine}</span>}
            {content.links?.map((l, i) => (
              <a key={i} href={hrefFor(l.url)} style={{ display: "inline-flex", alignItems: "center", color: "#0a58ca", textDecoration: "none" }}>
                <LinkIcon kind={linkKindFor(l.label)} />
                {l.label}
              </a>
            ))}
          </div>
        </div>

        {sequence.map(key => blocks[key])}
      </div>
    </div>
  );
}

/**
 * On-screen preview + export trigger for the DOCX-first pipeline
 * (lib/resume-docx.ts, lib/server/resume-pdf-pipeline.ts). This component
 * used to BE the PDF (browser print-to-PDF via window.print(), with a
 * font-scale-stepping safety net to try to force one page). That approach
 * is gone: the .docx is the source of truth, the .pdf is a direct
 * LibreOffice conversion of it, and both are gated server-side (format
 * gate before generation, PDF-extraction gate after) — so there is nothing
 * left for this component to measure or fit. It only shows a visual
 * approximation and triggers the real export.
 */
export function ResumeExportView({
  content,
  archetype,
  app,
  onClose,
}: {
  content: ResumeContent;
  archetype?: ResumeArchetype | null;
  // Optional: needed only to resolve the page ceiling (MBB vs general
  // consulting, years-of-experience) via resolveMaxPages. Without it, the
  // export falls back to the archetype's own base maxPages server-side.
  app?: Application | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "exporting" | "done" | "error">("idle");
  const [exportError, setExportError] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageTwoFillPercent, setPageTwoFillPercent] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<FormatGateViolation[]>([]);
  const [outcomeWarnings, setOutcomeWarnings] = useState<OutcomeWarning[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set());
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  const sequence: ResumeSectionKey[] = resolveSectionSequence(content, archetype ?? undefined);

  useEffect(() => { setMounted(true); }, []);

  const handleExport = async () => {
    setExportState("exporting");
    setExportError("");
    try {
      const { exportResumeDocxAndPdf, downloadResumeExport } = await import("../lib/resume-export");
      const profile = getProfile();
      const maxPages = profile && app && archetype ? resolveMaxPages(profile, app, archetype) : undefined;
      const result = await exportResumeDocxAndPdf(content, archetype, maxPages);
      const filename = (content.name || "resume").toLowerCase().replace(/\s+/g, "-");
      downloadResumeExport(result, filename);
      setPageCount(result.pageCount);
      setPageTwoFillPercent(result.pageTwoFillPercent);
      setWarnings(result.warnings);
      setOutcomeWarnings(result.outcomeWarnings);
      setExportState("done");
    } catch (e: any) {
      setExportError(e.message || "Export failed.");
      setExportState("error");
    }
  };

  const warningKey = (w: OutcomeWarning) => `${w.company}::${w.bulletIndex}`;

  // Strengthens ONE flagged bullet with the user's supplied outcome and
  // writes it back into the CANONICAL PROFILE (lib/profile-enrichment.ts —
  // the same rewrite-in-place mechanism Feature 2's profile interview
  // uses), so every future resume for any JD benefits, not just this
  // already-exported document.
  const submitOutcomeAnswer = async (w: OutcomeWarning) => {
    const key = warningKey(w);
    const answer = answers[key]?.trim();
    if (!answer) return;
    const profile = getProfile();
    if (!profile) { showToast("No profile found.", "error"); return; }
    setSubmittingKey(key);
    try {
      const question = buildOutcomeGapQuestion(w);
      const newText = await rewriteBulletFromAnswer(profile, w.company, w.text, question, answer);
      if (!newText.trim()) { showToast("No usable outcome found in that answer.", "error"); return; }
      const nextProfile = replaceBulletInProfile(profile, "experience", w.company, w.text, newText);
      const ok = await saveProfile(nextProfile);
      if (!ok) { showToast("Rewrite failed to save to your profile.", "error"); return; }
      setResolvedKeys(prev => new Set(prev).add(key));
      showToast(`Updated in your profile: "${newText}"`, "ok");
    } catch (e: any) {
      showToast(e.message || "Couldn't process that answer.", "error");
    } finally {
      setSubmittingKey(null);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="resume-export-root" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#525659", overflow: "auto" }}>
      <div className="resume-export-toolbar" style={{
        position: "sticky", top: 0, zIndex: 2, display: "flex", justifyContent: "center", flexWrap: "wrap",
        gap: 10, padding: "10px 16px", background: "#2d2f31", boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}>
        <button onClick={handleExport} className="btn btn-primary" style={{ fontSize: "0.75rem" }} disabled={exportState === "exporting"}>
          {exportState === "exporting" ? "GENERATING DOCX + PDF..." : "EXPORT DOCX + PDF"}
        </button>
        {exportState === "done" && pageCount !== null && (
          <span style={{ color: "#8fd19e", fontFamily: "var(--font-mono)", fontSize: "0.7rem", alignSelf: "center" }}>
            MEASURED: {pageCount} PAGE{pageCount === 1 ? "" : "S"}
            {pageCount === 2 && pageTwoFillPercent !== null && ` — PAGE 2 ~${pageTwoFillPercent}% FULL`}
          </span>
        )}
        {exportState === "error" && (
          <span style={{ color: "#e08a8a", fontFamily: "var(--font-mono)", fontSize: "0.7rem", alignSelf: "center", maxWidth: 520, whiteSpace: "pre-wrap" }}>
            {exportError}
          </span>
        )}
        <button onClick={onClose} className="btn" style={{ fontSize: "0.75rem" }}>CLOSE</button>
      </div>

      {exportState === "done" && warnings.length > 0 && (
        <div style={{ maxWidth: 700, margin: "16px auto 0", background: "var(--surface, #2d2f31)", border: "1px solid var(--border, #444)", borderRadius: "var(--radius, 6px)", padding: 14 }}>
          <div className="label" style={{ color: "var(--accent, #e8b339)", marginBottom: 8, fontSize: "0.625rem" }}>
            EXPORTED WITH {warnings.length} WARNING{warnings.length === 1 ? "" : "S"} — DOCUMENT IS STILL YOURS TO SEND
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: outcomeWarnings.length > 0 ? 14 : 0 }}>
            {warnings.map((w, i) => (
              <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "#ccc" }}>
                <span style={{ color: "#e8b339" }}>{w.location}:</span> {w.reason}
              </div>
            ))}
          </div>

          {outcomeWarnings.length > 0 && (
            <>
              <div className="label" style={{ color: "var(--accent, #e8b339)", marginBottom: 8, fontSize: "0.625rem" }}>
                THESE BULLETS COULD BE STRONGER — SUPPLY A REAL OUTCOME
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {outcomeWarnings.map(w => {
                  const key = warningKey(w);
                  const resolved = resolvedKeys.has(key);
                  return (
                    <div key={key} style={{ opacity: resolved ? 0.6 : 1 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "#ccc", marginBottom: 6 }}>
                        {resolved ? "UPDATED IN YOUR PROFILE — " : ""}{buildOutcomeGapQuestion(w)}
                      </div>
                      {!resolved && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            value={answers[key] ?? ""}
                            onChange={e => setAnswers(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder="Your answer..."
                            style={{ flex: 1, padding: 8, background: "#1c1e1f", border: "1px solid #444", color: "#eee", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", borderRadius: 4 }}
                          />
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: "0.75rem", padding: "6px 12px" }}
                            disabled={submittingKey === key || !answers[key]?.trim()}
                            onClick={() => submitOutcomeAnswer(w)}
                          >
                            {submittingKey === key ? "SAVING..." : "SAVE TO PROFILE"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div className="resume-export-scroll" style={{ display: "flex", justifyContent: "center", padding: "24px 0 48px" }}>
        <div className="resume-page-frame" style={{ boxShadow: "0 0 12px rgba(0,0,0,0.4)" }}>
          <ResumePage content={content} scale={1} sequence={sequence} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
