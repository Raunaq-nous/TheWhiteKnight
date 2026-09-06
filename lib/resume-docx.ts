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
//
// Typography is one of TWO fixed formats from docs/MASTER-PROFILE-SPEC.md
// Part 9 — "two-page senior consulting" or "one-page dense" — selected by
// the resolved page ceiling (see resolveConfiguredMaxPages in
// lib/resume-archetype.ts). There is no dynamic font-scaling step: content
// that can't fit at the selected format's numbers is a content-budget
// problem (lib/resume-budget.ts) or a page-ceiling problem, never fixed by
// inventing a third, smaller format.

import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, LineRuleType, Packer, Paragraph, TabStopType, TextRun,
} from "docx";
import { ResumeContent, resolveSectionSequence, ResumeSectionKey, formatDegreeLine } from "./resume-schema";
import { ResumeArchetype } from "./resume-archetype";
import { computeBoldSpans, splitTextByBoldSpans } from "./resume-bolding";

const FONT = "Calibri";

// Letter page width in twips (8.5in * 1440 twips/in) — used to derive each
// format's right tab-stop position from its own margins.
const PAGE_WIDTH_TWIPS = 12240;

export type DocxFormat = {
  bodySize: number;
  smallSize: number; // secondary text — the role/degree line, the contact line
  companyHeaderSize: number;
  sectionHeaderSize: number;
  subLabelSize: number;
  nameSize: number;
  marginTwips: { top: number; right: number; bottom: number; left: number };
  sectionSpacingBefore: number;
  sectionSpacingAfter: number;
  companySpacingBefore: number;
  companySpacingAfter: number;
  subLabelSpacingBefore: number;
  subLabelSpacingAfter: number;
  bulletSpacingAfter: number;
  bulletLineSpacing: number;
  bulletIndentLeft: number;
  bulletIndentHanging: number;
  sectionBorder: { style: typeof BorderStyle.SINGLE; size: number; color: string; space: number };
  companyBorder: { style: typeof BorderStyle.DOTTED; size: number; color: string; space: number };
  linkColor: string;
  dateColor: string;
  subLabelColor: string;
};

// TWO-PAGE SENIOR CONSULTING FORMAT — docs/MASTER-PROFILE-SPEC.md Part 9,
// exact values, no rounding/approximation.
export const TWO_PAGE_SENIOR_CONSULTING_FORMAT: DocxFormat = {
  bodySize: 18, // 9pt
  smallSize: 17,
  companyHeaderSize: 21,
  sectionHeaderSize: 22,
  subLabelSize: 16,
  nameSize: 34,
  marginTwips: { top: 620, right: 800, bottom: 620, left: 800 },
  sectionSpacingBefore: 70,
  sectionSpacingAfter: 16,
  companySpacingBefore: 44,
  companySpacingAfter: 8,
  subLabelSpacingBefore: 12,
  subLabelSpacingAfter: 6,
  bulletSpacingAfter: 12,
  bulletLineSpacing: 250,
  bulletIndentLeft: 220,
  bulletIndentHanging: 140,
  sectionBorder: { style: BorderStyle.SINGLE, size: 6, color: "111111", space: 2 },
  companyBorder: { style: BorderStyle.DOTTED, size: 4, color: "999999", space: 6 },
  linkColor: "1155CC",
  dateColor: "555555",
  subLabelColor: "666666",
};

// ONE-PAGE DENSE FORMAT — spec Part 9 gives only the numbers that most
// affect page-fit (body/company-header/section-header sizes, margins,
// bullet spacing/line height); everything else (name size, sub-label
// size/spacing/color, section/company spacing-before, borders, link/date
// colors, bullet indent) is unchanged from the two-page reference format —
// same visual language, denser numbers, not a different design.
export const ONE_PAGE_DENSE_FORMAT: DocxFormat = {
  ...TWO_PAGE_SENIOR_CONSULTING_FORMAT,
  bodySize: 16, // 8pt
  companyHeaderSize: 19,
  sectionHeaderSize: 18,
  marginTwips: { top: 340, right: 580, bottom: 340, left: 580 },
  bulletSpacingAfter: 8,
  bulletLineSpacing: 200,
};

/** Selects the exact spec format for the resolved page ceiling — never a third, in-between format. */
export function selectDocxFormat(maxPages: number): DocxFormat {
  return maxPages >= 2 ? TWO_PAGE_SENIOR_CONSULTING_FORMAT : ONE_PAGE_DENSE_FORMAT;
}

function rightTabPosition(format: DocxFormat): number {
  return PAGE_WIDTH_TWIPS - format.marginTwips.left - format.marginTwips.right;
}

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

// Experience sub-labels (spec Part 8/9) — only the "consulting" archetype's
// senior layout groups a role's bullets under these two bands; every other
// archetype keeps a flat bullet list, unchanged.
export const CONSULTING_ENGAGEMENTS_LABEL = "CONSULTING ENGAGEMENTS";
export const AI_BUILDS_LABEL = "AI BUILDS AND PROCESS REINVENTION";

// Deterministic, content-derived classification — never invents anything,
// just reads the ALREADY-SELECTED bullet text (see lib/resume-selection.ts
// — bullets are selected by id from the real profile, never authored) and
// buckets it by vocabulary. A bullet naming a build/platform/tool reads as
// an AI build; everything else (an engagement/study/program/deal) reads as
// a client consulting engagement. This never changes WHICH bullets were
// selected or their text — only which sub-label heading they render under.
const AI_BUILD_PATTERN = /\b(ai|artificial intelligence|platform|toolkit|cockpit|studio|agent|agentic|algorithm|automat\w*|software|engine|dashboard|application|generative|machine learning|\bml\b|pipeline|knowledge graph)\b/i;

export function classifyExperienceBulletLabel(text: string): typeof CONSULTING_ENGAGEMENTS_LABEL | typeof AI_BUILDS_LABEL {
  return AI_BUILD_PATTERN.test(text) ? AI_BUILDS_LABEL : CONSULTING_ENGAGEMENTS_LABEL;
}

export type DocxPlanNode =
  | { kind: "header"; name: string; contactLine: string; links: { label: string; url: string }[] }
  | { kind: "sectionHeading"; heading: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  // Bold left run, right-aligned right run on the same line via a right
  // tab stop — company+dates, or institution+years.
  | { kind: "entryHeader"; left: string; right: string }
  | { kind: "entryRole"; text: string }
  | { kind: "skillsLine"; category: string; items: string }
  // Small grey uppercase group label within an experience entry (spec
  // Part 8/9) — CONSULTING ENGAGEMENTS / AI BUILDS AND PROCESS
  // REINVENTION. Only emitted for the "consulting" archetype.
  | { kind: "subLabel"; text: string };

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
      // Sub-labeled grouping is specific to the "consulting" senior layout
      // (spec Part 8's section-structure diagram) — every other archetype
      // keeps the flat, priority-ordered bullet list unchanged.
      const useSubLabels = archetype === "consulting";
      for (const e of content.experience) {
        plan.push({ kind: "entryHeader", left: e.company, right: e.tenure });
        plan.push({ kind: "entryRole", text: e.location ? `${e.role}, ${e.location}` : e.role });
        const sorted = [...e.bullets].sort((a, b) => a.priority - b.priority);
        if (!useSubLabels) {
          for (const b of sorted) plan.push({ kind: "bullet", text: b.text });
          continue;
        }
        // CONSULTING ENGAGEMENTS always precedes AI BUILDS — matches the
        // spec's fixed section-structure order — but each band only
        // appears when the role actually has a bullet in it (a role with
        // no AI-build bullets never gets an empty "AI BUILDS" heading).
        const consultingBullets = sorted.filter(b => classifyExperienceBulletLabel(b.text) === CONSULTING_ENGAGEMENTS_LABEL);
        const aiBullets = sorted.filter(b => classifyExperienceBulletLabel(b.text) === AI_BUILDS_LABEL);
        if (consultingBullets.length > 0) {
          plan.push({ kind: "subLabel", text: CONSULTING_ENGAGEMENTS_LABEL });
          for (const b of consultingBullets) plan.push({ kind: "bullet", text: b.text });
        }
        if (aiBullets.length > 0) {
          plan.push({ kind: "subLabel", text: AI_BUILDS_LABEL });
          for (const b of aiBullets) plan.push({ kind: "bullet", text: b.text });
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

function docxParagraphsForNode(node: DocxPlanNode, format: DocxFormat): Paragraph[] {
  const tightLine = { line: format.bulletLineSpacing, lineRule: LineRuleType.AUTO } as const;

  switch (node.kind) {
    case "header": {
      const nameRun = new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: node.name.toUpperCase(), bold: true, font: FONT, size: format.nameSize })],
        spacing: { after: 30, ...tightLine },
      });
      const contactChildren: (TextRun | ExternalHyperlink)[] = [
        new TextRun({ text: node.contactLine, font: FONT, size: format.smallSize }),
      ];
      for (const l of node.links) {
        contactChildren.push(new TextRun({ text: "   ", font: FONT, size: format.smallSize }));
        contactChildren.push(new ExternalHyperlink({
          link: /^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}`,
          children: [new TextRun({ text: l.label, font: FONT, size: format.smallSize, color: format.linkColor, underline: {} })],
        }));
      }
      const contactRun = new Paragraph({
        alignment: AlignmentType.CENTER,
        children: contactChildren,
        spacing: { after: 100, ...tightLine },
      });
      return [nameRun, contactRun];
    }
    case "sectionHeading":
      return [new Paragraph({
        children: [new TextRun({ text: node.heading, bold: true, font: FONT, size: format.sectionHeaderSize })],
        border: { bottom: format.sectionBorder },
        spacing: { before: format.sectionSpacingBefore, after: format.sectionSpacingAfter, ...tightLine },
      })];
    case "paragraph":
      return [new Paragraph({
        children: [new TextRun({ text: node.text, font: FONT, size: format.bodySize })],
        spacing: { after: 40, ...tightLine },
      })];
    case "bullet": {
      // Selective bolding (spec Part 8) — a deterministic pass over this
      // EXACT final string (lib/resume-bolding.ts), never a model call and
      // never a text edit: computeBoldSpans only returns offsets, and
      // splitTextByBoldSpans turns them into alternating plain/bold runs
      // that reconstruct node.text exactly when concatenated.
      const spans = computeBoldSpans(node.text);
      const segments = splitTextByBoldSpans(node.text, spans);
      return [new Paragraph({
        children: segments.map(seg => new TextRun({ text: seg.text, bold: seg.bold, font: FONT, size: format.bodySize })),
        bullet: { level: 0 },
        indent: { left: format.bulletIndentLeft, hanging: format.bulletIndentHanging },
        spacing: { after: format.bulletSpacingAfter, ...tightLine },
      })];
    }
    case "entryHeader":
      return [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: rightTabPosition(format) }],
        border: { top: format.companyBorder },
        children: [
          new TextRun({ text: node.left, bold: true, font: FONT, size: format.companyHeaderSize }),
          new TextRun({ text: "\t", font: FONT, size: format.companyHeaderSize }),
          new TextRun({ text: node.right, font: FONT, size: format.smallSize, color: format.dateColor }),
        ],
        spacing: { before: format.companySpacingBefore, after: format.companySpacingAfter, ...tightLine },
      })];
    case "entryRole":
      return [new Paragraph({
        children: [new TextRun({ text: node.text, italics: true, font: FONT, size: format.smallSize })],
        spacing: { after: 24, ...tightLine },
      })];
    case "skillsLine":
      return [new Paragraph({
        children: [
          new TextRun({ text: `${node.category}: `, bold: true, font: FONT, size: format.bodySize }),
          new TextRun({ text: node.items, font: FONT, size: format.bodySize }),
        ],
        spacing: { after: 24, ...tightLine },
      })];
    case "subLabel":
      return [new Paragraph({
        children: [new TextRun({
          text: node.text, bold: true, font: FONT, size: format.subLabelSize, color: format.subLabelColor,
        })],
        spacing: { before: format.subLabelSpacingBefore, after: format.subLabelSpacingAfter, ...tightLine },
      })];
  }
}

export function renderDocxPlan(plan: DocxPlanNode[], format: DocxFormat): Document {
  return new Document({
    sections: [{
      properties: {
        page: { margin: format.marginTwips },
      },
      children: plan.flatMap(node => docxParagraphsForNode(node, format)),
    }],
    styles: {
      default: {
        document: { run: { font: FONT, size: format.bodySize } },
      },
    },
  });
}

export async function generateResumeDocxBuffer(
  content: ResumeContent,
  archetype?: ResumeArchetype,
  maxPages: number = 1,
): Promise<Buffer> {
  const plan = buildDocxPlan(content, archetype);
  const format = selectDocxFormat(maxPages);
  const doc = renderDocxPlan(plan, format);
  return Packer.toBuffer(doc);
}
