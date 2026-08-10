// DOCX-first resume renderer — replaces the HTML/browser-print-CSS
// pipeline (six iterations of trying to force a browser to fit one page
// were the actual problem, not a font-size or margin tweak away from
// working). The .docx IS the source of truth; the PDF is a direct
// LibreOffice conversion of it (see lib/server/resume-pdf-pipeline.ts), so
// the two can never drift apart the way an HTML preview and a printed
// page did.
//
// Split into two layers on purpose:
//   1. buildDocxPlan() — a PURE function from ResumeContent -> a flat list
//      of typed, order-preserving render instructions. No docx library
//      types touch this layer, so it's fully unit-testable without ever
//      constructing a real .docx.
//   2. renderDocxPlan()/generateResumeDocxBuffer() — thin glue that turns
//      the plan into an actual `docx` Document and packs it to a buffer.
//      Not meaningfully unit-testable beyond "it doesn't throw and
//      produces a real .docx" — the FORMAT GATE (lib/resume-format-gate.ts)
//      is what actually guarantees the content is safe to render.

import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, LineRuleType, Packer, Paragraph, TabStopType, TextRun,
} from "docx";
import { ResumeContent, resolveSectionSequence, ResumeSectionKey, formatDegreeLine } from "./resume-schema";
import { ResumeArchetype } from "./resume-archetype";

// Calibri 10-11pt per spec, tightened toward the smaller end (~15-20% more
// content per page target — real content quality should never be traded
// for page-fit again; typography is the room-maker instead, see
// clampBulletText in lib/resume-budget.ts for the compression-quality fix
// this pairs with).
const FONT = "Calibri";
const BODY_SIZE = 20; // half-points -> 10pt (was 10.5pt)
const NAME_SIZE = 32; // 16pt
const HEADING_SIZE = 22; // 11pt
const CONTACT_SIZE = 18; // 9pt (was 9.5pt)

// Tight, near-single line spacing (240 twips/line = exactly single) — set
// explicitly on every paragraph rather than left to the docx library's
// implicit default, so it can't silently drift.
const LINE_SPACING = 228;

// 0.4in margins (was 0.5in), in twips (1440 twips/inch).
const MARGIN_TWIPS = 576;
// Page content width at 8.5in page - 2*0.4in margin = 7.7in = 11088 twips —
// used as the right tab-stop position for right-aligned dates/years.
const RIGHT_TAB_POSITION = 11088;

const SECTION_LABELS: Partial<Record<ResumeSectionKey, string>> = {
  summary: "SUMMARY",
  keyWins: "KEY WINS",
  projects: "RELEVANT PROJECTS",
  selectedImpact: "KEY PROJECTS & IMPACT",
  experience: "EXPERIENCE",
  education: "EDUCATION",
  skills: "SKILLS",
  leadership: "LEADERSHIP & ACTIVITIES",
  // certifications intentionally has no label — never rendered, any archetype.
};

export type DocxPlanNode =
  | { kind: "header"; name: string; contactLine: string; links: { label: string; url: string }[] }
  | { kind: "sectionHeading"; heading: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  // Bold left run, right-aligned right run on the same line via a right
  // tab stop — company+dates, or institution+years.
  | { kind: "entryHeader"; left: string; right: string }
  | { kind: "entryRole"; text: string }
  | { kind: "skillsLine"; category: string; items: string };

/**
 * Pure planning pass: ResumeContent -> ordered render instructions. Section
 * order comes from the SAME resolveSectionSequence used everywhere else in
 * this codebase (the render layer, the markdown export), so this can never
 * disagree with what the on-screen preview or the requirement map assumes
 * about section order. Certifications are never planned, for any archetype
 * or stored data — same blanket rule as resolveSectionSequence itself.
 */
export function buildDocxPlan(content: ResumeContent, archetype?: ResumeArchetype): DocxPlanNode[] {
  const plan: DocxPlanNode[] = [
    { kind: "header", name: content.name, contactLine: content.contactLine, links: content.links ?? [] },
  ];

  const heading = (key: ResumeSectionKey) => {
    const label = SECTION_LABELS[key];
    if (label) plan.push({ kind: "sectionHeading", heading: label });
  };

  const blocks: Record<ResumeSectionKey, () => void> = {
    summary: () => {
      if (!content.summary?.trim()) return;
      heading("summary");
      plan.push({ kind: "paragraph", text: content.summary });
    },
    keyWins: () => {
      if (!content.keyWins?.length) return;
      heading("keyWins");
      for (const w of content.keyWins) plan.push({ kind: "bullet", text: w });
    },
    projects: () => {
      if (!content.projects?.length) return;
      heading("projects");
      for (const p of content.projects) plan.push({ kind: "bullet", text: `${p.name}: ${p.description}` });
    },
    selectedImpact: () => {
      if (!content.keyWins?.length && !content.projects?.length) return;
      heading("selectedImpact");
      for (const w of content.keyWins ?? []) plan.push({ kind: "bullet", text: w });
      for (const p of content.projects ?? []) plan.push({ kind: "bullet", text: `${p.name}: ${p.description}` });
    },
    experience: () => {
      if (content.experience.length === 0) return;
      heading("experience");
      for (const e of content.experience) {
        plan.push({ kind: "entryHeader", left: e.company, right: e.tenure });
        plan.push({ kind: "entryRole", text: e.location ? `${e.role}, ${e.location}` : e.role });
        for (const b of [...e.bullets].sort((a, b) => a.priority - b.priority)) {
          plan.push({ kind: "bullet", text: b.text });
        }
      }
    },
    education: () => {
      if (content.education.length === 0) return;
      heading("education");
      for (const ed of content.education) {
        plan.push({ kind: "entryHeader", left: ed.institution, right: ed.years });
        let line = formatDegreeLine(ed.degree, ed.field);
        if (ed.gpa) line += `, GPA: ${ed.gpa}`;
        plan.push({ kind: "entryRole", text: line });
        for (const a of ed.achievements ?? []) plan.push({ kind: "bullet", text: a });
      }
    },
    skills: () => {
      if (content.skills.length === 0) return;
      heading("skills");
      for (const g of content.skills) plan.push({ kind: "skillsLine", category: g.category, items: g.items.join(", ") });
    },
    leadership: () => {
      if (!content.leadership?.length) return;
      heading("leadership");
      for (const l of content.leadership) plan.push({ kind: "bullet", text: l });
    },
    certifications: () => {
      // Never rendered — blanket product rule, see lib/resume-schema.ts.
    },
  };

  for (const key of resolveSectionSequence(content, archetype)) blocks[key]();

  return plan;
}

// Every paragraph gets the same explicit, tight line height — set once
// here rather than repeated per case, so LINE_SPACING can't drift out of
// sync between node kinds.
const TIGHT_LINE = { line: LINE_SPACING, lineRule: LineRuleType.AUTO } as const;

function docxParagraphsForNode(node: DocxPlanNode): Paragraph[] {
  switch (node.kind) {
    case "header": {
      const nameRun = new Paragraph({
        children: [new TextRun({ text: node.name, bold: true, font: FONT, size: NAME_SIZE })],
        spacing: { after: 30, ...TIGHT_LINE },
      });
      const contactChildren: (TextRun | ExternalHyperlink)[] = [
        new TextRun({ text: node.contactLine, font: FONT, size: CONTACT_SIZE }),
      ];
      for (const l of node.links) {
        contactChildren.push(new TextRun({ text: "   ", font: FONT, size: CONTACT_SIZE }));
        contactChildren.push(new ExternalHyperlink({
          link: /^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}`,
          children: [new TextRun({ text: l.label, font: FONT, size: CONTACT_SIZE, color: "0563C1", underline: {} })],
        }));
      }
      const contactRun = new Paragraph({ children: contactChildren, spacing: { after: 100, ...TIGHT_LINE } });
      return [nameRun, contactRun];
    }
    case "sectionHeading":
      return [new Paragraph({
        children: [new TextRun({ text: node.heading, bold: true, font: FONT, size: HEADING_SIZE })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999", space: 1 } },
        spacing: { before: 100, after: 40, ...TIGHT_LINE },
      })];
    case "paragraph":
      return [new Paragraph({
        children: [new TextRun({ text: node.text, font: FONT, size: BODY_SIZE })],
        spacing: { after: 40, ...TIGHT_LINE },
      })];
    case "bullet":
      return [new Paragraph({
        children: [new TextRun({ text: node.text, font: FONT, size: BODY_SIZE })],
        bullet: { level: 0 },
        spacing: { after: 24, ...TIGHT_LINE },
      })];
    case "entryHeader":
      return [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB_POSITION }],
        children: [
          new TextRun({ text: node.left, bold: true, font: FONT, size: BODY_SIZE }),
          new TextRun({ text: "\t", font: FONT, size: BODY_SIZE }),
          new TextRun({ text: node.right, font: FONT, size: BODY_SIZE }),
        ],
        spacing: { before: 70, ...TIGHT_LINE },
      })];
    case "entryRole":
      return [new Paragraph({
        children: [new TextRun({ text: node.text, italics: true, font: FONT, size: BODY_SIZE })],
        spacing: { after: 24, ...TIGHT_LINE },
      })];
    case "skillsLine":
      return [new Paragraph({
        children: [
          new TextRun({ text: `${node.category}: `, bold: true, font: FONT, size: BODY_SIZE }),
          new TextRun({ text: node.items, font: FONT, size: BODY_SIZE }),
        ],
        spacing: { after: 24, ...TIGHT_LINE },
      })];
  }
}

export function renderDocxPlan(plan: DocxPlanNode[]): Document {
  return new Document({
    sections: [{
      properties: {
        page: { margin: { top: MARGIN_TWIPS, bottom: MARGIN_TWIPS, left: MARGIN_TWIPS, right: MARGIN_TWIPS } },
      },
      children: plan.flatMap(docxParagraphsForNode),
    }],
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY_SIZE } },
      },
    },
  });
}

export async function generateResumeDocxBuffer(content: ResumeContent, archetype?: ResumeArchetype): Promise<Buffer> {
  const plan = buildDocxPlan(content, archetype);
  const doc = renderDocxPlan(plan);
  return Packer.toBuffer(doc);
}
