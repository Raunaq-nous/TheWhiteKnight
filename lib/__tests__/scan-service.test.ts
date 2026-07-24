import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const exaJobSearchMock = vi.fn();
const adzunaSearchMock = vi.fn();

vi.mock("../exa-client", () => ({ exaJobSearch: (...args: any[]) => exaJobSearchMock(...args) }));
vi.mock("../adzuna-client", () => ({
  adzunaSearch: (...args: any[]) => adzunaSearchMock(...args),
  REGION_TO_ADZUNA_COUNTRIES: { global: ["us"], india: ["in"] },
}));

import { tokenize, scoreRelevance, scanJobs } from "../server/services/scan-service";
import type { CompanyTarget } from "../company-targets";

describe("tokenize", () => {
  it("lowercases, strips punctuation, and drops stopwords/short tokens", () => {
    expect(tokenize("Senior Product Manager, AI/ML")).toEqual(["senior", "product", "manager", "ai/ml"]);
  });
});

describe("scoreRelevance", () => {
  it("scores a title match higher than a snippet-only match", () => {
    const titleMatch = scoreRelevance("Senior Product Manager", "", ["product"], [], []);
    const snippetOnly = scoreRelevance("Software Engineer", "great product opportunity", ["product"], [], []);
    expect(titleMatch).toBeGreaterThan(snippetOnly);
  });

  it("hard-rejects when the title contains an exclude token", () => {
    expect(scoreRelevance("Junior Product Manager", "", ["product"], [], ["junior"])).toBe(0);
  });

  it("returns 0 when no query token matches anywhere", () => {
    expect(scoreRelevance("Staff Engineer", "backend infra", ["product"], [], [])).toBe(0);
  });
});

describe("scanJobs", () => {
  const greenhouseCompany: CompanyTarget = {
    id: "acme", name: "Acme Corp", region: ["global"], sector: "consulting",
    ats: "greenhouse", atsTenant: "acme", careersUrl: "https://acme.com/careers", enabled: true,
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    exaJobSearchMock.mockReset();
    adzunaSearchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when the query has no useful tokens", async () => {
    await expect(scanJobs({ query: "the a of", companies: [] })).rejects.toThrow("Query has no useful tokens");
  });

  it("fetches Greenhouse jobs for an enabled ATS company and captures the full description", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [{
          title: "Senior Product Manager", location: { name: "Remote" },
          absolute_url: "https://boards.greenhouse.io/acme/jobs/1", updated_at: "2024-01-01",
          content: "<p>Own the roadmap.</p>",
        }],
      }),
    });

    const result = await scanJobs({ query: "product manager", companies: [greenhouseCompany] });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("boards-api.greenhouse.io/v1/boards/acme/jobs"),
      expect.anything(),
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].descriptionHtml).toBe("<p>Own the roadmap.</p>");
    expect(result.jobs[0].company).toBe("Acme Corp");
  });

  it("skips a disabled company entirely", async () => {
    const disabled = { ...greenhouseCompany, enabled: false };
    const result = await scanJobs({ query: "product manager", companies: [disabled] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.jobs).toHaveLength(0);
  });

  it("dedupes identical URLs across sources", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [
          { title: "Senior Product Manager", absolute_url: "https://boards.greenhouse.io/acme/jobs/1", updated_at: "2024-01-01" },
          { title: "Senior Product Manager (dup)", absolute_url: "https://boards.greenhouse.io/acme/jobs/1", updated_at: "2024-01-01" },
        ],
      }),
    });

    const result = await scanJobs({ query: "product manager", companies: [greenhouseCompany] });
    expect(result.jobs).toHaveLength(1);
  });

  it("filters out jobs scoring below the relevance floor", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [{ title: "Warehouse Associate", absolute_url: "https://boards.greenhouse.io/acme/jobs/2", updated_at: "2024-01-01" }],
      }),
    });

    const result = await scanJobs({ query: "product manager", companies: [greenhouseCompany] });
    expect(result.jobs).toHaveLength(0);
    expect(result.counts.beforeFiltering).toBe(1);
  });

  it("only calls Adzuna/Exa when keys are supplied", async () => {
    const result = await scanJobs({ query: "product manager", regions: ["global"], companies: [] });
    expect(adzunaSearchMock).not.toHaveBeenCalled();
    expect(exaJobSearchMock).not.toHaveBeenCalled();
    expect(result.jobs).toHaveLength(0);
  });

  it("calls Adzuna when keys are supplied and maps results", async () => {
    adzunaSearchMock.mockResolvedValue([
      { title: "Senior Product Manager", company: "Beta Inc", location: "Remote", url: "https://adzuna.example/job/1", created: "2024-01-01", description: "Own the product strategy" },
    ]);

    const result = await scanJobs({ query: "product manager", regions: ["global"], companies: [], adzunaAppId: "id", adzunaAppKey: "key" });
    expect(adzunaSearchMock).toHaveBeenCalled();
    expect(result.jobs.some(j => j.source === "adzuna")).toBe(true);
  });
});
