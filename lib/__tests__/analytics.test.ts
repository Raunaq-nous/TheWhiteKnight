import { describe, it, expect } from "vitest";
import {
  countByStatus, hasResponded, computeReplyRate, scoreResponseCorrelation,
  averageTimeToResponseDays, computeResponseAnalytics,
} from "../analytics";
import type { Application } from "../store";

function app(overrides: Partial<Application> = {}): Application {
  return {
    id: Math.random().toString(36), slug: "acme-pm", company: "Acme", role: "PM", location: "Remote",
    remote: true, status: "sourced", score: 5, bucket: "", sector: "", seniority: "mid",
    sourceUrl: "https://x.com", capturedAt: "2025-01-01", jdRaw: "", jdParsed: null,
    nextAction: "", contacts: [], interviews: [], reminders: [], resumeVersions: [], notes: "",
    emailEvents: [], createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  } as Application;
}

describe("countByStatus", () => {
  it("counts every status bucket, including zero for statuses with no applications", () => {
    const counts = countByStatus([app({ status: "applied" }), app({ status: "applied" }), app({ status: "offer" })]);
    expect(counts).toEqual({ sourced: 0, reviewed: 0, applied: 2, interview: 0, offer: 1, rejected: 0 });
  });

  it("handles the empty-data case", () => {
    expect(countByStatus([])).toEqual({ sourced: 0, reviewed: 0, applied: 0, interview: 0, offer: 0, rejected: 0 });
  });
});

describe("hasResponded", () => {
  it("treats interview/offer/rejected as a response", () => {
    expect(hasResponded(app({ status: "interview" }))).toBe(true);
    expect(hasResponded(app({ status: "offer" }))).toBe(true);
    expect(hasResponded(app({ status: "rejected" }))).toBe(true);
  });

  it("treats sourced/reviewed/applied as no response yet", () => {
    expect(hasResponded(app({ status: "sourced" }))).toBe(false);
    expect(hasResponded(app({ status: "reviewed" }))).toBe(false);
    expect(hasResponded(app({ status: "applied" }))).toBe(false);
  });
});

describe("computeReplyRate", () => {
  it("computes the rate only over applications that reached 'applied' or later", () => {
    const apps = [
      app({ status: "sourced" }), // excluded — never sent
      app({ status: "reviewed" }), // excluded — never sent
      app({ status: "applied" }), // sent, no response
      app({ status: "interview" }), // sent, responded
      app({ status: "rejected" }), // sent, responded
    ];
    const result = computeReplyRate(apps);
    expect(result.sentTotal).toBe(3);
    expect(result.responded).toBe(2);
    expect(result.rate).toBeCloseTo(2 / 3);
  });

  it("returns null (not 0) when nothing has been sent yet — the empty-data case", () => {
    const result = computeReplyRate([app({ status: "sourced" }), app({ status: "reviewed" })]);
    expect(result.sentTotal).toBe(0);
    expect(result.rate).toBeNull();
  });

  it("handles a fully empty application list", () => {
    const result = computeReplyRate([]);
    expect(result.rate).toBeNull();
    expect(result.sentTotal).toBe(0);
  });
});

describe("scoreResponseCorrelation", () => {
  it("returns a strong positive correlation when higher score consistently means a response", () => {
    const apps = [
      app({ status: "applied", score: 2 }),
      app({ status: "rejected", score: 8 }),
      app({ status: "applied", score: 3 }),
      app({ status: "offer", score: 9 }),
    ];
    const r = scoreResponseCorrelation(apps);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.5);
  });

  it("returns null with fewer than 3 sent, scored applications", () => {
    expect(scoreResponseCorrelation([app({ status: "applied" }), app({ status: "rejected" })])).toBeNull();
  });

  it("returns null when every application has the same score (no variance)", () => {
    const apps = [
      app({ status: "applied", score: 5 }),
      app({ status: "rejected", score: 5 }),
      app({ status: "offer", score: 5 }),
    ];
    expect(scoreResponseCorrelation(apps)).toBeNull();
  });

  it("returns null on an empty list", () => {
    expect(scoreResponseCorrelation([])).toBeNull();
  });
});

describe("averageTimeToResponseDays", () => {
  it("averages createdAt-to-updatedAt only for applications that got a response", () => {
    const apps = [
      app({ status: "interview", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-05T00:00:00.000Z" }), // 4 days
      app({ status: "rejected", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-11T00:00:00.000Z" }), // 10 days
      app({ status: "applied", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-02-01T00:00:00.000Z" }), // no response — excluded
    ];
    expect(averageTimeToResponseDays(apps)).toBeCloseTo(7);
  });

  it("returns null when nothing has responded yet", () => {
    expect(averageTimeToResponseDays([app({ status: "applied" })])).toBeNull();
  });

  it("returns null on an empty list", () => {
    expect(averageTimeToResponseDays([])).toBeNull();
  });
});

describe("computeResponseAnalytics — the combined view, empty-data case", () => {
  it("never throws and returns sane nulls/zeros for an empty pipeline", () => {
    const result = computeResponseAnalytics([]);
    expect(result.total).toBe(0);
    expect(result.statusCounts.applied).toBe(0);
    expect(result.replyRate.rate).toBeNull();
    expect(result.scoreCorrelation).toBeNull();
    expect(result.avgTimeToResponseDays).toBeNull();
  });

  it("computes a full, consistent picture from a realistic pipeline", () => {
    const apps = [
      app({ status: "sourced", score: 4 }),
      app({ status: "applied", score: 6 }),
      app({ status: "interview", score: 8, createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-06T00:00:00.000Z" }),
      app({ status: "rejected", score: 3, createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-08T00:00:00.000Z" }),
    ];
    const result = computeResponseAnalytics(apps);
    expect(result.total).toBe(4);
    expect(result.replyRate.sentTotal).toBe(3);
    expect(result.replyRate.responded).toBe(2);
    expect(result.avgTimeToResponseDays).toBeCloseTo(6);
  });
});
