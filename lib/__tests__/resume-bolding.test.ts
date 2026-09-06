import { describe, it, expect } from "vitest";
import { computeBoldSpans, splitTextByBoldSpans, MAX_SPANS_PER_BULLET, TYPICAL_MIN_SPANS, type BoldSpan } from "../resume-bolding";

function boldedFragments(text: string, spans: BoldSpan[]): string[] {
  return splitTextByBoldSpans(text, spans).filter(s => s.bold).map(s => s.text);
}

function fullyReconstructs(text: string, spans: BoldSpan[]): boolean {
  return splitTextByBoldSpans(text, spans).map(s => s.text).join("") === text;
}

// The exact two reference bullets from docs/MASTER-PROFILE-SPEC.md Part 8's
// "Bullet formula" section — the acceptance bar for this whole module.
const REFERENCE_BULLET_1 =
  "Led a concept selection study for a national oil and gas company on a stalled upstream asset, building the evaluation framework across financial, technical, and regulatory criteria and authoring the C-suite decision document that unlocked investment on a previously non-feasible project";

const REFERENCE_BULLET_2 =
  "Drove performance improvement on a utility-scale solar asset returning below its hurdle rate, isolating CapEx and OpEx optimisation levers that lifted project IRR from 6% to the 10% hurdle rate";

describe("computeBoldSpans — spec Part 8 reference bullets", () => {
  it("reference bullet 1: lands 3-5 spans covering the client type and the methodology/artifact terms", () => {
    const spans = computeBoldSpans(REFERENCE_BULLET_1);
    expect(spans.length).toBeGreaterThanOrEqual(TYPICAL_MIN_SPANS);
    expect(spans.length).toBeLessThanOrEqual(MAX_SPANS_PER_BULLET);
    const fragments = boldedFragments(REFERENCE_BULLET_1, spans);
    expect(fragments).toContain("national oil and gas company"); // client/entity descriptor
    expect(fragments).toContain("evaluation framework"); // methodology term
    expect(fragments).toContain("C-suite decision document"); // methodology term
  });

  it("reference bullet 2: lands 3-5 spans covering the methodology, the client type, and the quantified range", () => {
    const spans = computeBoldSpans(REFERENCE_BULLET_2);
    expect(spans.length).toBeGreaterThanOrEqual(TYPICAL_MIN_SPANS);
    expect(spans.length).toBeLessThanOrEqual(MAX_SPANS_PER_BULLET);
    const fragments = boldedFragments(REFERENCE_BULLET_2, spans);
    expect(fragments).toContain("CapEx and OpEx optimisation levers"); // methodology term
    expect(fragments).toContain("utility-scale solar asset"); // client/entity descriptor
    expect(fragments.some(f => f.includes("6%") && f.includes("10%"))).toBe(true); // the quantified range
  });

  it("never splits a word and always reconstructs the original text exactly", () => {
    for (const bullet of [REFERENCE_BULLET_1, REFERENCE_BULLET_2]) {
      const spans = computeBoldSpans(bullet);
      expect(fullyReconstructs(bullet, spans)).toBe(true);
      for (const span of spans) {
        // A real word boundary sits at start/end: not a word character
        // immediately before start, and not a word character straddling end.
        if (span.start > 0) expect(/\w/.test(bullet[span.start - 1]) && /\w/.test(bullet[span.start])).toBe(false);
        if (span.end < bullet.length) expect(/\w/.test(bullet[span.end - 1]) && /\w/.test(bullet[span.end])).toBe(false);
      }
    }
  });
});

describe("computeBoldSpans — quantities", () => {
  it("bolds a currency figure", () => {
    const text = "Demonstrated on a $10 billion portfolio of capital projects.";
    expect(boldedFragments(text, computeBoldSpans(text))).toContain("$10 billion");
  });

  it("bolds counts with units", () => {
    const text = "Spanned 16 projects across 10+ sites in a single system.";
    const fragments = boldedFragments(text, computeBoldSpans(text));
    expect(fragments).toContain("16 projects");
    expect(fragments).toContain("10+ sites");
  });

  it("bolds a compound partial/complete count", () => {
    const text = "Deployed across 55+ partial and 10 complete live client cases.";
    expect(boldedFragments(text, computeBoldSpans(text))).toContain("55+ partial and 10 complete live client cases");
  });

  it("bolds a plain percentage", () => {
    const text = "Cut manual review effort by 80% for the client.";
    expect(boldedFragments(text, computeBoldSpans(text))).toContain("80%");
  });

  it("bolds a range as ONE span rather than two separate percentages", () => {
    const text = "Lifted project IRR from 6% to the 10% hurdle rate for the client.";
    const spans = computeBoldSpans(text);
    const fragments = boldedFragments(text, spans);
    expect(fragments).toContain("IRR from 6% to the 10% hurdle rate");
    expect(fragments).not.toContain("6%");
    expect(fragments).not.toContain("10%");
  });
});

describe("computeBoldSpans — methodology/artifact terms (config-driven)", () => {
  it("bolds a configured methodology term", () => {
    const text = "Built the evaluation framework for the client's board.";
    expect(boldedFragments(text, computeBoldSpans(text))).toContain("evaluation framework");
  });

  it("matches case-insensitively", () => {
    const text = "Delivered a MONTE CARLO simulation for the risk team.";
    expect(boldedFragments(text, computeBoldSpans(text))).toContain("MONTE CARLO");
  });

  it("prefers the longer, more specific term over a shorter overlapping one", () => {
    const text = "Isolated CapEx and OpEx optimisation levers for the client.";
    const fragments = boldedFragments(text, computeBoldSpans(text));
    expect(fragments).toContain("CapEx and OpEx optimisation levers");
    expect(fragments.filter(f => f.toLowerCase().includes("capex")).length).toBe(1);
  });
});

describe("computeBoldSpans — client/entity descriptors", () => {
  it("bolds an adjective-chain ending in a recognised entity noun", () => {
    const cases: [string, string][] = [
      ["Delivered for a national oil and gas company across three regions.", "national oil and gas company"],
      ["Delivered for a green energy entity building 10 plants.", "green energy entity"],
      ["Improved performance on a utility-scale solar asset for the client.", "utility-scale solar asset"],
      ["Raised capital for an EMEA B2B marketplace last year.", "EMEA B2B marketplace"],
      ["Advised a global port operator across three continents.", "global port operator"],
    ];
    for (const [text, expected] of cases) {
      expect(boldedFragments(text, computeBoldSpans(text))).toContain(expected);
    }
  });

  it("excludes leading articles/prepositions from the qualifier chain", () => {
    const text = "Improved performance on a utility-scale solar asset for the client.";
    const fragments = boldedFragments(text, computeBoldSpans(text));
    expect(fragments).not.toContain("on a utility-scale solar asset");
    expect(fragments).not.toContain("a utility-scale solar asset");
  });
});

describe("computeBoldSpans — capping and priority order", () => {
  it("never exceeds MAX_SPANS_PER_BULLET even when many categories match", () => {
    const text = "Delivered a $10 million evaluation framework and C-suite decision document for a national oil and gas company across 16 projects, 10+ sites, and 55% margin uplift for a global port operator and an EMEA B2B marketplace.";
    const spans = computeBoldSpans(text);
    expect(spans.length).toBe(MAX_SPANS_PER_BULLET);
  });

  it("keeps quantities first, then methodology, then entity when trimming to the cap", () => {
    // 2 quantities + 2 methodology + 2 entity = 6 candidates, capped to 5 —
    // exactly one entity match should be dropped, quantities/methodology intact.
    const text = "Raised $10 million and grew revenue by 40% using an evaluation framework and a value bridge for a national oil and gas company and a global port operator.";
    const spans = computeBoldSpans(text);
    const fragments = boldedFragments(text, spans);
    expect(spans.length).toBe(MAX_SPANS_PER_BULLET);
    expect(fragments).toContain("$10 million");
    expect(fragments).toContain("40%");
    expect(fragments).toContain("evaluation framework");
    expect(fragments).toContain("value bridge");
    // Only one of the two entity candidates survives the cap.
    const entityHits = fragments.filter(f => f === "national oil and gas company" || f === "global port operator");
    expect(entityHits).toHaveLength(1);
  });

  it("returns no spans and never blocks when nothing matches", () => {
    expect(computeBoldSpans("Managed the team and delivered results for the client.")).toEqual([]);
  });

  it("returns no spans for empty text", () => {
    expect(computeBoldSpans("")).toEqual([]);
  });
});

describe("computeBoldSpans — lead-label guard", () => {
  it("drops a span that starts at index 0 (the lead verb/label)", () => {
    const text = "$10 million raised for a national oil and gas company last year.";
    const spans = computeBoldSpans(text);
    expect(spans.every(s => s.start !== 0)).toBe(true);
    expect(boldedFragments(text, spans)).not.toContain("$10 million");
    expect(boldedFragments(text, spans)).toContain("national oil and gas company");
  });
});

describe("computeBoldSpans — overlap safety", () => {
  it("never returns overlapping spans across categories", () => {
    const text = "Delivered a $10 million evaluation framework for a national oil and gas company across 16 projects.";
    const spans = computeBoldSpans(text);
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        const overlap = spans[i].start < spans[j].end && spans[j].start < spans[i].end;
        expect(overlap).toBe(false);
      }
    }
  });
});

describe("splitTextByBoldSpans", () => {
  it("returns the whole text unbolded when there are no spans", () => {
    expect(splitTextByBoldSpans("Plain bullet text.", [])).toEqual([{ text: "Plain bullet text.", bold: false }]);
  });

  it("alternates plain/bold segments that concatenate back to the original text", () => {
    const text = "Delivered a $10 million program for the client.";
    const spans = computeBoldSpans(text);
    const segments = splitTextByBoldSpans(text, spans);
    expect(segments.map(s => s.text).join("")).toBe(text);
    expect(segments.some(s => s.bold)).toBe(true);
    expect(segments.some(s => !s.bold)).toBe(true);
  });

  it("defensively drops an out-of-range span rather than throwing", () => {
    const text = "Short bullet.";
    const segments = splitTextByBoldSpans(text, [{ start: 5, end: 500 }]);
    expect(segments.map(s => s.text).join("")).toBe(text);
  });

  it("defensively drops a span that overlaps a previously placed one rather than throwing", () => {
    const text = "Short bullet text here.";
    const segments = splitTextByBoldSpans(text, [{ start: 0, end: 5 }, { start: 3, end: 8 }]);
    expect(segments.map(s => s.text).join("")).toBe(text);
  });
});
