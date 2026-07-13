"use client";

import { useEffect, useRef, useState } from "react";
import { ResumeContent } from "../lib/resume-schema";
import { trimLowestPriorityBullet, nextDensity, MIN_DENSITY, DENSITY_STEP } from "../lib/resume-fit";

// Letter page at 96 CSS px/in, 0.5in margins — the actual target we measure against.
const PAGE_HEIGHT_IN = 11;
const MARGIN_IN = 0.5;
const PX_PER_IN = 96;
const TARGET_CONTENT_HEIGHT_PX = (PAGE_HEIGHT_IN - MARGIN_IN * 2) * PX_PER_IN;
const UNDERFLOW_THRESHOLD = 0.94;
const MAX_ITERATIONS = 80;

function sortedBullets(bullets: ResumeContent["experience"][number]["bullets"]) {
  return [...bullets].sort((a, b) => a.priority - b.priority);
}

// Pure layout — renders whatever content/density it's given. No fitting logic here.
function ResumePage({ content, density }: { content: ResumeContent; density: number }) {
  const bodyPt = 10 + density * 1.2; // ~10pt -> ~11.2pt across the density range
  const lineHeight = 1.32 + (density - MIN_DENSITY) * 0.6;
  const sectionGap = 14 + (density - MIN_DENSITY) * 48;
  const bulletGap = 3 + (density - MIN_DENSITY) * 6;

  const style: React.CSSProperties = {
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
    <div key={key} style={{ marginTop: sectionGap }}>{node}</div>
  );

  const experienceBlock = section("experience", <>
    <div style={sectionTitleStyle}>Experience</div>
    {content.experience.map((e, i) => (
      <div key={i} style={{ marginBottom: i === content.experience.length - 1 ? 0 : sectionGap * 0.6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "10.5pt" }}>
          <span>{e.role}, {e.company}</span>
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
  </>);

  const educationBlock = section("education", <>
    <div style={sectionTitleStyle}>Education</div>
    {content.education.map((ed, i) => (
      <div key={i} style={{ marginBottom: i === content.education.length - 1 ? 0 : 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>{ed.institution}</span>
          <span style={{ fontWeight: 400, fontStyle: "italic" }}>{ed.years}</span>
        </div>
        <div style={{ fontSize: "9.5pt" }}>
          {ed.degree}{ed.field ? ` in ${ed.field}` : ""}{ed.gpa ? ` — GPA: ${ed.gpa}` : ""}
        </div>
        {ed.achievements?.map((a, j) => <div key={j} style={{ fontSize: "9pt", color: "#333" }}>{a}</div>)}
      </div>
    ))}
  </>);

  return (
    <div className="resume-page" style={style}>
      <div style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "21pt", fontWeight: 700, letterSpacing: "0.02em" }}>
        {content.name}
      </div>
      <div style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "9.5pt", color: "#333", marginTop: 2 }}>
        {content.contactLine}
      </div>

      {content.summary && section("summary", <div style={{ marginTop: 2 }}>{content.summary}</div>)}

      {content.sectionOrder === "education-first" ? (
        <>{educationBlock}{experienceBlock}</>
      ) : (
        <>{experienceBlock}{educationBlock}</>
      )}

      {content.projects && content.projects.length > 0 && section("projects", <>
        <div style={sectionTitleStyle}>Projects</div>
        {content.projects.map((p, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <span style={{ fontWeight: 700 }}>{p.name}</span>{": "}{p.description}
          </div>
        ))}
      </>)}

      {section("skills", <>
        <div style={sectionTitleStyle}>Skills</div>
        {content.skills.map((g, i) => (
          <div key={i}><span style={{ fontWeight: 700 }}>{g.category}:</span> {g.items.join(", ")}</div>
        ))}
      </>)}

      {content.leadership && content.leadership.length > 0 && section("leadership", <>
        <div style={sectionTitleStyle}>Leadership &amp; Activities</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {content.leadership.map((l, i) => <li key={i} style={{ marginBottom: bulletGap }}>{l}</li>)}
        </ul>
      </>)}

      {content.certifications && content.certifications.length > 0 && section("certifications", <>
        <div style={sectionTitleStyle}>Certifications</div>
        {content.certifications.map((c, i) => (
          <div key={i}>{c.name}{c.issuer ? ` — ${c.issuer}` : ""}{c.date ? ` (${c.date})` : ""}</div>
        ))}
      </>)}
    </div>
  );
}

export type FitStatus = "measuring" | "fit";

/**
 * Full one-page export view: measures the real rendered DOM, trims the
 * lowest-priority bullets if it overflows, and expands spacing/type density
 * if it underflows — a genuine layout fit, not a font-shrink guess.
 */
export function ResumeExportView({
  content: initialContent,
  onClose,
  onContentSettled,
}: {
  content: ResumeContent;
  onClose: () => void;
  onContentSettled?: (content: ResumeContent) => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [density, setDensity] = useState(MIN_DENSITY);
  const [phase, setPhase] = useState<"trim" | "expand" | "done">("trim");
  const pageRef = useRef<HTMLDivElement>(null);
  const iterations = useRef(0);

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
    const el = pageRef.current;
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
  }, [content, density, phase]);

  const handlePrint = () => window.print();

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#525659", overflow: "auto" }}>
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
      <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 48px" }}>
        <div ref={pageRef} style={{ boxShadow: "0 0 12px rgba(0,0,0,0.4)" }}>
          <ResumePage content={content} density={density} />
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .resume-page, .resume-page * { visibility: visible; }
          .resume-export-toolbar { display: none !important; }
          .resume-page { position: absolute; top: 0; left: 0; box-shadow: none !important; }
          @page { size: letter portrait; margin: 0; }
        }
      `}</style>
    </div>
  );
}
