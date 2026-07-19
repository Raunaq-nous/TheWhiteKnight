"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ResumeContent, ResumeSectionKey, resolveSectionSequence } from "../lib/resume-schema";
import { RESUME_SPECS, ResumeArchetype } from "../lib/resume-archetype";
import { trimLowestPriorityBullet, nextDensity, MIN_DENSITY, DENSITY_STEP } from "../lib/resume-fit";

// Letter page at 96 CSS px/in with 0.5in margins — the content box we must
// fit inside is 10in tall. The fit loop measures the INNER content div
// (height: auto), never the padded/min-height page frame, so the ratio is a
// true content-vs-page comparison.
const PAGE_HEIGHT_IN = 11;
const MARGIN_IN = 0.5;
const PX_PER_IN = 96;
const TARGET_CONTENT_HEIGHT_PX = (PAGE_HEIGHT_IN - MARGIN_IN * 2) * PX_PER_IN;
const UNDERFLOW_THRESHOLD = 0.94;
const MAX_ITERATIONS = 80;

function sortedBullets(bullets: ResumeContent["experience"][number]["bullets"]) {
  return [...bullets].sort((a, b) => a.priority - b.priority);
}

function hrefFor(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Pure layout — renders whatever content/density/order it's given.
// No fitting logic here; contentRef exposes the auto-height inner box.
function ResumePage({
  content,
  density,
  sequence,
  contentRef,
}: {
  content: ResumeContent;
  density: number;
  sequence: ResumeSectionKey[];
  contentRef?: React.Ref<HTMLDivElement>;
}) {
  const bodyPt = 10 + density * 1.2; // ~10pt -> ~11.2pt across the density range
  const lineHeight = 1.32 + (density - MIN_DENSITY) * 0.6;
  const sectionGap = 14 + (density - MIN_DENSITY) * 48;
  const bulletGap = 3 + (density - MIN_DENSITY) * 6;

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
            <div key={i} style={{ marginBottom: 4 }}>
              <span style={{ fontWeight: 700 }}>{p.name}</span>{": "}{p.description}
            </div>
          ))}
        </>)
      : null,

    experience: content.experience.length > 0
      ? section("experience", <>
          <div style={sectionTitleStyle}>Experience</div>
          {content.experience.map((e, i) => (
            <div key={i} style={{ marginBottom: i === content.experience.length - 1 ? 0 : sectionGap * 0.6 }}>
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
            <div key={i} style={{ marginBottom: i === content.education.length - 1 ? 0 : 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>{ed.institution}</span>
                <span style={{ fontWeight: 400, fontStyle: "italic" }}>{ed.years}</span>
              </div>
              <div style={{ fontSize: "9.5pt" }}>
                {ed.degree}{ed.field ? ` in ${ed.field}` : ""}{ed.gpa ? ` - GPA: ${ed.gpa}` : ""}
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
          <div style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "9.5pt", color: "#333", marginTop: 2 }}>
            {content.contactLine}
            {content.links && content.links.length > 0 && (
              <>
                {content.contactLine ? " | " : ""}
                {content.links.map((l, i) => (
                  <span key={i}>
                    {i > 0 && " | "}
                    <a href={hrefFor(l.url)} style={{ color: "#0a58ca", textDecoration: "none" }}>
                      {l.label}
                    </a>
                  </span>
                ))}
              </>
            )}
          </div>
        </div>

        {sequence.map(key => blocks[key])}
      </div>
    </div>
  );
}

export type FitStatus = "measuring" | "fit";

/**
 * Full one-page export view. Rendered through a portal as a direct child of
 * <body> so print CSS can hide the entire app with display:none (which
 * removes its layout space) and print ONLY the resume — a fixed overlay
 * left in the normal tree gets repeated on every printed page.
 *
 * Fit loop: measures the auto-height inner content box against a 10in
 * target; trims lowest-priority bullets on overflow, steps up density on
 * underflow.
 */
export function ResumeExportView({
  content: initialContent,
  archetype,
  onClose,
  onContentSettled,
}: {
  content: ResumeContent;
  archetype?: ResumeArchetype | null;
  onClose: () => void;
  onContentSettled?: (content: ResumeContent) => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [density, setDensity] = useState(MIN_DENSITY);
  const [phase, setPhase] = useState<"trim" | "expand" | "done">("trim");
  const [mounted, setMounted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const iterations = useRef(0);

  const sequence: ResumeSectionKey[] = content.sectionSequence?.length
    ? resolveSectionSequence(content)
    : archetype
      ? resolveSectionSequence({ ...content, sectionSequence: RESUME_SPECS[archetype].sectionSequence })
      : resolveSectionSequence(content);

  useEffect(() => { setMounted(true); }, []);

  // Marks <body> so the print stylesheet can hide everything except the
  // portal root without affecting screen rendering.
  useEffect(() => {
    document.body.classList.add("resume-print-mode");
    return () => document.body.classList.remove("resume-print-mode");
  }, []);

  useEffect(() => {
    setContent(initialContent);
    setDensity(MIN_DENSITY);
    setPhase("trim");
    iterations.current = 0;
  }, [initialContent]);

  useEffect(() => {
    if (phase === "done") {
      onContentSettled?.(content);
      return;
    }
    const el = contentRef.current;
    if (!el) return;

    const ratio = el.scrollHeight / TARGET_CONTENT_HEIGHT_PX;
    iterations.current += 1;
    if (iterations.current > MAX_ITERATIONS) { setPhase("done"); return; }

    if (phase === "trim") {
      if (ratio > 1) {
        const trimmed = trimLowestPriorityBullet(content);
        if (trimmed) { setContent(trimmed); return; }
      }
      setPhase("expand");
      return;
    }

    // phase === "expand"
    if (ratio > 1) {
      // Last density step overflowed — back off one step and stop.
      setDensity(d => Math.max(MIN_DENSITY, Math.round((d - DENSITY_STEP) * 100) / 100));
      setPhase("done");
      return;
    }
    if (ratio < UNDERFLOW_THRESHOLD) {
      const next = nextDensity(density);
      if (next !== null) { setDensity(next); return; }
    }
    setPhase("done");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, density, phase, mounted]);

  const handlePrint = () => window.print();

  if (!mounted) return null;

  return createPortal(
    <div className="resume-export-root" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#525659", overflow: "auto" }}>
      <div className="resume-export-toolbar" style={{
        position: "sticky", top: 0, zIndex: 2, display: "flex", justifyContent: "center",
        gap: 10, padding: "10px 16px", background: "#2d2f31", boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}>
        <button onClick={handlePrint} className="btn btn-primary" style={{ fontSize: "0.75rem" }}>
          SAVE AS PDF
        </button>
        <span style={{ color: phase === "done" ? "#8fd19e" : "#ccc", fontFamily: "var(--font-mono)", fontSize: "0.7rem", alignSelf: "center" }}>
          {phase === "done" ? "FITTED TO ONE PAGE" : "FITTING..."}
        </span>
        <button onClick={onClose} className="btn" style={{ fontSize: "0.75rem" }}>CLOSE</button>
      </div>
      <div className="resume-export-scroll" style={{ display: "flex", justifyContent: "center", padding: "24px 0 48px" }}>
        <div className="resume-page-frame" style={{ boxShadow: "0 0 12px rgba(0,0,0,0.4)" }}>
          <ResumePage content={content} density={density} sequence={sequence} contentRef={contentRef} />
        </div>
      </div>
      <style>{`
        @page { size: letter portrait; margin: 0.5in; }
        @media print {
          /* The app (everything that is not this portal) is removed from
             layout entirely — display:none, not visibility:hidden — so the
             printed document is exactly as tall as the resume content. */
          body.resume-print-mode > :not(.resume-export-root) { display: none !important; }

          /* The overlay leaves fixed positioning for print. A position:fixed
             box is repeated on every printed page per the CSS paged-media
             spec — that was the cause of the N repeated cut-off pages. */
          .resume-export-root {
            position: static !important;
            overflow: visible !important;
            background: #fff !important;
          }
          .resume-export-toolbar { display: none !important; }
          .resume-export-scroll { display: block !important; padding: 0 !important; }
          .resume-page-frame { box-shadow: none !important; }

          /* @page margin supplies the 0.5in margins; the on-screen page
             padding and 11in min-height would double them / force overflow. */
          .resume-page {
            width: auto !important;
            min-height: 0 !important;
            height: auto !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          .resume-section { break-inside: avoid; page-break-inside: avoid; }
          .resume-page a { color: #0a58ca !important; text-decoration: underline; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
