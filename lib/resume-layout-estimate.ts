// Line estimate for the GENERATED DOCX (lib/resume-docx.ts), calibrated to
// the spec's Part 9 formats, so the fill can size content to two real pages
// before any PDF exists. Units are body lines. Export still measures the
// real PDF and corrects (lib/resume-measure-fill.ts); this only has to be
// close enough that the first render lands near the target.

import type { ResumeContent } from "./resume-schema";
import { RESUME_SPECS, type ResumeArchetype } from "./resume-archetype";
import { usesSubLabels, groupBulletsBySubLabel } from "./resume-sublabels";

type Metrics = { bulletChars: number; bodyChars: number; linesPerPage: number };

// Two-page senior format: Calibri 9pt, 800-twip side margins (7.39in text
// width, minus the 220-twip bullet indent), 620-twip top/bottom margins.
// One-page dense format: 8pt, 580-twip sides, 340-twip top/bottom.
export const DOCX_METRICS: Record<1 | 2, Metrics> = {
  // linesPerPage is CALIBRATED against real LibreOffice renders (A4, Carlito
  // as Calibri), not derived from leading: across 18-34 experience bullets
  // page one filled at ~75 estimated lines and page-two fill rose ~1.2% per
  // estimated line, so 78 predicts measured page-two fill within ~3 points.
  2: { bulletChars: 118, bodyChars: 122, linesPerPage: 78 },
  1: { bulletChars: 138, bodyChars: 142, linesPerPage: 76 },
};

const lines = (text: string, perLine: number) => Math.max(1, Math.ceil(text.length / perLine));

export function estimateDocxLines(content: ResumeContent, archetype: ResumeArchetype, maxPages: number): number {
  const m = DOCX_METRICS[maxPages >= 2 ? 2 : 1];
  const seq = content.sectionSequence?.length ? content.sectionSequence : RESUME_SPECS[archetype].sectionSequence;
  const SECTION_HEADER = 1.6;
  let total = 3 + (content.links?.length ? 1 : 0); // name, contact, links

  for (const key of seq) {
    if (key === "summary" && content.summary?.trim()) {
      total += SECTION_HEADER + lines(content.summary, m.bodyChars);
    } else if (key === "selectedImpact" || key === "keyWins" || key === "projects") {
      const wins = key === "projects" ? [] : content.keyWins ?? [];
      const projects = key === "keyWins" ? [] : (content.projects ?? []).map(p => `${p.name}: ${p.description}`);
      const items = [...wins, ...projects];
      if (items.length) total += SECTION_HEADER + items.reduce((n, t) => n + lines(t, m.bulletChars), 0);
    } else if (key === "experience" && content.experience.length) {
      total += SECTION_HEADER;
      const grouped = usesSubLabels(content, archetype);
      for (const e of content.experience) {
        total += 1.5 + 1; // company header row + role line
        if (grouped) total += groupBulletsBySubLabel(e.bullets).length * 1.1;
        total += e.bullets.reduce((n, b) => n + lines(b.text, m.bulletChars) + 0.05, 0);
      }
    } else if (key === "education" && content.education.length) {
      total += SECTION_HEADER + content.education.length * 2;
    } else if (key === "skills" && content.skills.length) {
      total += SECTION_HEADER + content.skills.reduce((n, g) => n + lines(`${g.category}: ${g.items.join(", ")}`, m.bodyChars), 0);
    } else if (key === "leadership" && content.leadership?.length) {
      total += SECTION_HEADER + content.leadership.reduce((n, t) => n + lines(t, m.bulletChars), 0);
    }
  }
  return Math.round(total * 10) / 10;
}

/** Estimated page count and page-two fill, for reporting. */
export function estimatePages(totalLines: number, maxPages: number): { pages: number; pageTwoFillPercent: number | null } {
  const per = DOCX_METRICS[maxPages >= 2 ? 2 : 1].linesPerPage;
  const pages = Math.max(1, Math.ceil(totalLines / per));
  return { pages, pageTwoFillPercent: pages === 2 ? Math.round(((totalLines - per) / per) * 100) : null };
}
