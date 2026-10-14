import { describe, it, expect } from "vitest";
import { measureAndFill, addFromReserve, dropLowestRanked, MAX_FILL_ITERATIONS, UNDERFILL_WARNING, type MeasureFn } from "../resume-measure-fill";
import { taperFor } from "../resume-budget";
import { roleSubLabelGroups, anyRoleUsesSubLabels, CONSULTING_ENGAGEMENTS_LABEL, AI_BUILDS_LABEL } from "../resume-sublabels";
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
  it("adds eligible reserve bullets until page two is at least 50% full", async () => {
    const start = content(3, 12); // 9 bullets: 66 lines, page two ~6%
    const r = await measureAndFill(start, "consulting", 2, fakeMeasure());
    expect(r.steps[0].action).toBe("added");
    expect(r.steps.at(-1)!.action).toBe("ok");
    expect(r.measurement.pageCount).toBe(2);
    expect(r.measurement.pageTwoFillPercent!).toBeGreaterThanOrEqual(50);
    expect(bullets(r.content)).toBe(9 + r.addedIds.length);
    expect(r.warning).toBeNull();
  });

  it("drops the lowest-ranked bullet when the PDF reaches 3 pages", async () => {
    const start = content(8, 0); // 24 bullets: 126 lines, 3 pages
    const r = await measureAndFill(start, "consulting", 2, fakeMeasure());
    expect(r.steps[0].action).toBe("dropped");
    expect(r.measurement.pageCount).toBe(2);
    expect(r.droppedIds[0]).toBe("e_Gamma7"); // highest priority number = lowest ranked
  });

  it("when eligible content runs out it stops and exports WITH A WARNING: no padding, no block, no one-page fallback", async () => {
    const start = content(3, 0);
    const r = await measureAndFill(start, "consulting", 2, fakeMeasure());
    expect(r.steps.map(s => s.action)).toEqual(["content-exhausted"]);
    expect(r.maxPages).toBe(2);
    expect(bullets(r.content)).toBe(9); // nothing padded in
    expect(r.underfilledWithReserve).toBe(true);
    expect(r.warning).toBe(UNDERFILL_WARNING);
  });

  it("caps at 8 iterations", async () => {
    // A PDF that flips between overflowing and under-filled on every render.
    let calls = 0;
    const flaky: MeasureFn = async () => (++calls % 2 ? { pageCount: 3, pageTwoFillPercent: null } : { pageCount: 2, pageTwoFillPercent: 10 });
    const r = await measureAndFill(content(6, 300), "consulting", 2, flaky);
    expect(r.steps).toHaveLength(MAX_FILL_ITERATIONS);
    expect(r.steps.at(-1)!.action).toBe("iterations-exhausted");
  });

  it("never re-adds a bullet it dropped for overflow", async () => {
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
});

describe("taper by recency and seniority (export additions and drops)", () => {
  it("caps: current role its full relevant set, next role next, then 3-4, then 2; founders 2", () => {
    expect(taperFor(0).cap).toBeGreaterThan(taperFor(1).cap);
    expect(taperFor(1).cap).toBeGreaterThan(taperFor(2).cap);
    expect([taperFor(2), taperFor(3)].map(t => [t.floor, t.cap])).toEqual([[3, 4], [3, 4]]);
    expect(taperFor(4).cap).toBe(2);
    expect(taperFor(1, "Co-founder").cap).toBe(2);
  });

  it("addFromReserve never takes an older role past its taper cap", () => {
    const c = content(2, 0); // Gamma is index 2: cap 4
    const reserve: ReserveBullet[] = Array.from({ length: 6 }, (_, i) => ({ sourceBulletId: `e_g${i}`, company: "Gamma", text: LONG(500 + i), score: 0.9 }));
    // Alpha (current) has no reserve left: it has run out, so Gamma may pass it, up to its cap.
    const r = addFromReserve({ ...c, reserve }, 1000);
    expect(r.content.experience.find(e => e.company === "Gamma")!.bullets).toHaveLength(4);
    // While Alpha still has relevant bullets, Gamma never outnumbers it.
    const r2 = addFromReserve({ ...c, reserve: [...reserve, ...Array.from({ length: 4 }, (_, i) => ({ sourceBulletId: `e_a${i}`, company: "Alpha", text: LONG(600 + i), score: 0.2 }))] }, 1000);
    const n = Object.fromEntries(r2.content.experience.map(e => [e.company, e.bullets.length]));
    expect(n.Gamma).toBe(4); // capped at 4
    expect(n.Alpha).toBeGreaterThanOrEqual(n.Gamma); // the current role leads
  });

  it("dropLowestRanked keeps every role at its taper floor where possible", () => {
    const c = content(3, 0); // Gamma at its floor of 3
    c.experience[0].bullets.push({ sourceBulletId: "e_x", text: "Extra.", priority: 99 });
    expect(dropLowestRanked(c).id).toBe("e_x");
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

  it("labels only a role with both categories (preview helper), consulting first", () => {
    const groups = roleSubLabelGroups(tagged().experience[0])!;
    expect(groups.map(g => g.label)).toEqual([CONSULTING_ENGAGEMENTS_LABEL, AI_BUILDS_LABEL]);
    expect(groups[0].bullets[0].sourceBulletId).toBe("e_b");
    expect(roleSubLabelGroups({ role: "Manager", bullets: [{ text: "Led a study.", priority: 1, category: "consulting_engagement" }] })).toBeNull();
    expect(anyRoleUsesSubLabels(content(2, 0).experience)).toBe(false);
    expect(anyRoleUsesSubLabels(tagged().experience)).toBe(true);
  });

  it("the DOCX plan emits both sub-labels for tagged bullets under a non-consulting archetype", () => {
    const plan = buildDocxPlan(tagged(), "product");
    const labels = plan.filter(n => n.kind === "subLabel").map(n => (n as { text: string }).text);
    expect(labels).toEqual([CONSULTING_ENGAGEMENTS_LABEL, AI_BUILDS_LABEL]);
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
