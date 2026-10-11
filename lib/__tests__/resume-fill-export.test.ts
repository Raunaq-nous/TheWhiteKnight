import { describe, it, expect } from "vitest";
import { measureAndFill, addFromReserve, dropLowestRanked, MAX_FILL_ITERATIONS, type MeasureFn } from "../resume-measure-fill";
import { separateSummaryProofPoint } from "../resume-fill";
import { usesSubLabels, groupBulletsBySubLabel, CONSULTING_ENGAGEMENTS_LABEL, AI_BUILDS_LABEL } from "../resume-sublabels";
import { buildDocxPlan } from "../resume-docx";
import { runPdfExtractionGate } from "../resume-pdf-extract-gate";
import { resolveResumeSelections } from "../resume-selection";
import { bulletId } from "../profile-bullets";
import { getSeedProfile, type Profile } from "../profile";
import type { ResumeContent, ReserveBullet } from "../resume-schema";

// Every token unique per bullet, so the same-engagement dedupe never merges fixtures.
const LONG = (n: number) => Array.from({ length: 14 }, (_, k) => `tok${n}x${k}`).join(" ") + ".";

function content(bulletsPerRole: number, reserve: number): ResumeContent {
  const companies = ["Alpha", "Beta", "Gamma"];
  let p = 0;
  return {
    name: "Jordan Lee", contactLine: "j@example.com | 555-0100", summary: "Consulting manager.",
    sectionOrder: "experience-first", sectionSequence: ["summary", "experience", "education", "skills"],
    experience: companies.map((c, ci) => ({
      company: c, role: "Manager", tenure: "2020 - 2024",
      bullets: Array.from({ length: bulletsPerRole }, (_, i) => ({ sourceBulletId: `e_${c}${i}`, text: `${c} ${LONG(ci * 10 + i)}`, priority: ++p })),
    })),
    education: [], skills: [], keyWins: [], keyWinIds: [],
    reserve: Array.from({ length: reserve }, (_, i): ReserveBullet => ({
      sourceBulletId: `e_r${i}`, company: companies[i % 3], text: LONG(i + 30), score: 1 - i / 100,
    })),
  } as ResumeContent;
}

const bullets = (c: ResumeContent) => c.experience.reduce((n, e) => n + e.bullets.length, 0);

/** A fake PDF: 4 lines of page per bullet, 62 lines a page. */
const fakeMeasure = (linesPerBullet = 4, fixed = 30): MeasureFn => async (c, pages) => {
  const lines = fixed + bullets(c) * linesPerBullet;
  if (pages === 1) return { pageCount: Math.max(1, Math.ceil(lines / 62)), pageTwoFillPercent: null };
  const pageCount = Math.max(1, Math.ceil(lines / 62));
  return { pageCount, pageTwoFillPercent: pageCount === 2 ? Math.round(((lines - 62) / 62) * 100) : null };
};

describe("measureAndFill (export, against a measured PDF)", () => {
  it("adds reserve bullets until page two is at least 50% full", async () => {
    const start = content(3, 12); // 9 bullets: 66 lines, page two ~6%
    const r = await measureAndFill(start, "consulting", 2, fakeMeasure());
    expect(r.steps[0].action).toBe("added");
    expect(r.steps.at(-1)!.action).toBe("ok");
    expect(r.measurement.pageCount).toBe(2);
    expect(r.measurement.pageTwoFillPercent!).toBeGreaterThanOrEqual(50);
    expect(r.addedIds.length).toBeGreaterThan(0);
    expect(bullets(r.content)).toBe(9 + r.addedIds.length);
    expect(r.underfilledWithReserve).toBe(false);
  });

  it("drops the lowest-ranked bullet when the PDF reaches 3 pages", async () => {
    const start = content(9, 0); // 27 bullets: 138 lines, 3 pages
    const r = await measureAndFill(start, "consulting", 2, fakeMeasure());
    expect(r.steps[0].action).toBe("dropped");
    expect(r.measurement.pageCount).toBe(2);
    expect(r.droppedIds[0]).toBe("e_Gamma8"); // highest priority number = lowest ranked
  });

  it("falls back to one page only when the reserve is exhausted", async () => {
    const start = content(3, 0);
    const r = await measureAndFill(start, "consulting", 2, fakeMeasure());
    expect(r.steps.map(s => s.action)).toEqual(["reserve-exhausted", "fallback-one-page"]);
    expect(r.maxPages).toBe(1);
  });

  it("caps at 8 iterations and never blocks export while reserve bullets remain", async () => {
    // A PDF that never fills: page two always 10%.
    const stuck: MeasureFn = async () => ({ pageCount: 2, pageTwoFillPercent: 10 });
    const r = await measureAndFill(content(3, 300), "consulting", 2, stuck);
    expect(r.steps).toHaveLength(MAX_FILL_ITERATIONS);
    expect(r.steps.at(-1)!.action).toBe("iterations-exhausted");
    expect(r.underfilledWithReserve).toBe(true);
  });

  it("never re-adds a bullet it dropped for overflow", async () => {
    // 2 bullets fit; anything more than 15 overflows, under 13 under-fills.
    const m: MeasureFn = async c => {
      const n = bullets(c);
      return n > 15 ? { pageCount: 3, pageTwoFillPercent: null } : { pageCount: 2, pageTwoFillPercent: n >= 13 ? 60 : 20 };
    };
    const r = await measureAndFill(content(3, 20), "consulting", 2, m);
    for (const id of r.droppedIds) expect(r.content.experience.flatMap(e => e.bullets.map(b => b.sourceBulletId))).not.toContain(id);
    expect(r.steps.at(-1)!.action).toBe("ok");
  });

  it("addFromReserve skips a reserve bullet describing an engagement already shown", () => {
    const c = content(2, 0);
    const dup = c.experience[0].bullets[0];
    const withDup = { ...c, reserve: [{ sourceBulletId: "e_dup", company: "Alpha", text: dup.text, score: 1 }] };
    expect(addFromReserve(withDup, 5).ids).toEqual([]);
  });

  it("addFromReserve spreads additions across employers instead of draining the deepest reserve", () => {
    const c = content(4, 0);
    // 12 reserve bullets, best-ranked all for Alpha, then Beta and Gamma.
    const reserve: ReserveBullet[] = Array.from({ length: 12 }, (_, i) => ({
      sourceBulletId: `e_r${i}`, company: i < 8 ? "Alpha" : i < 10 ? "Beta" : "Gamma", text: LONG(100 + i), score: 1 - i / 100,
    }));
    const r = addFromReserve({ ...c, reserve }, 12); // ~12 lines: about 6 two-line bullets
    const counts = Object.fromEntries(r.content.experience.map(e => [e.company, e.bullets.length]));
    expect(r.ids.length).toBeGreaterThanOrEqual(6);
    expect(counts.Beta).toBeGreaterThan(4);
    expect(counts.Gamma).toBeGreaterThan(4);
    expect(counts.Alpha - Math.min(counts.Beta, counts.Gamma)).toBeLessThanOrEqual(2);
  });

  it("dropLowestRanked keeps every employer at 2+ bullets where possible", () => {
    const c = content(2, 0);
    c.experience[1].bullets.push({ sourceBulletId: "e_x", text: "Extra.", priority: 1 });
    expect(dropLowestRanked(c).id).toBe("e_Beta1");
  });
});

describe("pdf extraction gate: under-fill never blocks while the fill could still add", () => {
  const c = content(2, 0);
  const text = c.experience.flatMap(e => [e.company, ...e.bullets.map(b => b.text)]).join("\n") + "\nJordan Lee";
  const extracted = { text, numpages: 2, pageTexts: [text + "x".repeat(4000), "short tail"] };
  it("blocks a nearly empty page two by default", () => {
    expect(runPdfExtractionGate(extracted, c, "consulting", 2).errors.join(" ")).toMatch(/Page two is only/);
  });
  it("reports but does not block when allowUnderfilledPageTwo is set", () => {
    const r = runPdfExtractionGate(extracted, c, "consulting", 2, { allowUnderfilledPageTwo: true });
    expect(r.errors.join(" ")).not.toMatch(/Page two is only/);
    expect(r.pageTwoFillPercent).not.toBeNull();
  });
});

describe("sub-labels render from bullet category tags", () => {
  const tagged = (): ResumeContent => {
    const c = content(0, 0);
    c.experience = [{
      company: "Bain and Company", role: "Project Leader", tenure: "2025 - Present",
      bullets: [
        { sourceBulletId: "e_a", text: "Built a workflow studio.", priority: 2, category: "ai_build" },
        { sourceBulletId: "e_b", text: "Led a concept selection study.", priority: 1, category: "consulting_engagement" },
      ],
    }];
    return c;
  };

  it("tags switch sub-labels on even for a non-consulting archetype", () => {
    expect(usesSubLabels(tagged(), "product")).toBe(true);
    expect(usesSubLabels(content(2, 0), "product")).toBe(false);
    expect(usesSubLabels(content(2, 0), "consulting")).toBe(true);
  });

  it("groups Consulting first, then AI builds, omitting empty bands (preview helper)", () => {
    const groups = groupBulletsBySubLabel(tagged().experience[0].bullets);
    expect(groups.map(g => g.label)).toEqual([CONSULTING_ENGAGEMENTS_LABEL, AI_BUILDS_LABEL]);
    expect(groups[0].bullets[0].sourceBulletId).toBe("e_b");
    expect(groupBulletsBySubLabel([{ text: "Led a study.", priority: 1, category: "consulting_engagement" }]).map(g => g.label)).toEqual([CONSULTING_ENGAGEMENTS_LABEL]);
  });

  it("the DOCX plan emits both sub-labels for tagged bullets under a non-consulting archetype", () => {
    const plan = buildDocxPlan(tagged(), "product");
    const labels = plan.filter(n => n.kind === "subLabel").map(n => (n as { text: string }).text);
    expect(labels).toEqual([CONSULTING_ENGAGEMENTS_LABEL, AI_BUILDS_LABEL]);
  });
});

describe("summary never repeats the leading Key Projects figure", () => {
  const base = (): ResumeContent => ({
    ...content(2, 0),
    summary: "Strategy manager who cut cycle time by 80% with an AI cockpit.",
    keyWins: ["Built an AI cockpit that cut review cycle time by 80%.", "Led a $40M capital program across 6 sites."],
    keyWinIds: ["e_k1", "e_k2"],
  });
  it("reorders the band so a non-colliding item leads", () => {
    const r = separateSummaryProofPoint(base());
    expect(r.changed).toBe(true);
    expect(r.content.keyWins![0]).toMatch(/\$40M/);
    expect(r.content.keyWinIds).toEqual(["e_k2", "e_k1"]);
  });
  it("leaves content alone when there is no collision", () => {
    const c = { ...base(), summary: "Strategy manager with board-level delivery." };
    expect(separateSummaryProofPoint(c).changed).toBe(false);
  });
});

describe("resolveResumeSelections uses the page ceiling's character cap", () => {
  const text = "Led a concept selection study for a national oil and gas company, " + "structuring the options, the economics and the decision record for the board, ".repeat(3) + "saving 12% of capex.";
  const profile: Profile = { ...getSeedProfile(), experience: [{ id: "a", company: "Bain and Company", role: "PL", tenure: "2025", location: "", current: true, bullets: text }] };
  const raw = { ...content(0, 0), experience: [{ company: "Bain and Company", role: "PL", tenure: "2025", bullets: [{ sourceBulletId: bulletId("experience", "Bain and Company", text), text: "", priority: 1 }] }] } as ResumeContent;
  it("keeps a 300+ char bullet intact at two pages, compresses it at one page", () => {
    expect(text.length).toBeGreaterThan(300);
    expect(text.length).toBeLessThanOrEqual(400);
    expect(resolveResumeSelections(raw, profile, 2).experience[0].bullets[0].text).toBe(text);
    const one = resolveResumeSelections(raw, profile, 1).experience[0]?.bullets[0]?.text ?? "";
    expect(one.length).toBeLessThanOrEqual(240);
  });
});
