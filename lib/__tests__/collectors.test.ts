import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { greenhouseCollector } from "../server/services/collectors/greenhouse";
import { ashbyCollector } from "../server/services/collectors/ashby";
import { leverCollector } from "../server/services/collectors/lever";
import { smartRecruitersCollector } from "../server/services/collectors/smartrecruiters";
import { naukriCollector } from "../server/services/collectors/naukri";
import { ATS_COLLECTORS } from "../server/services/collectors";

describe("job collectors", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("greenhouseCollector", () => {
    it("returns the same JobResult shape the old inline fetchGreenhouse produced", async () => {
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

      const result = await greenhouseCollector.collect({ tenant: "acme", companyName: "Acme Corp" });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("boards-api.greenhouse.io/v1/boards/acme/jobs"),
        expect.anything(),
      );
      expect(result.error).toBeUndefined();
      expect(result.jobs).toEqual([{
        title: "Senior Product Manager",
        company: "Acme Corp",
        location: "Remote",
        url: "https://boards.greenhouse.io/acme/jobs/1",
        source: "greenhouse",
        publishedDate: "2024-01-01",
        descriptionHtml: "<p>Own the roadmap.</p>",
      }]);
    });

    it("fails cleanly (empty array, no throw) on a non-ok response", async () => {
      fetchMock.mockResolvedValue({ ok: false });
      const result = await greenhouseCollector.collect({ tenant: "acme", companyName: "Acme Corp" });
      expect(result.jobs).toEqual([]);
    });

    it("fails cleanly on a network error", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const result = await greenhouseCollector.collect({ tenant: "acme", companyName: "Acme Corp" });
      expect(result.jobs).toEqual([]);
      expect(result.error).toContain("network down");
    });

    it("returns [] with no tenant, never throws", async () => {
      const result = await greenhouseCollector.collect({});
      expect(result.jobs).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("ashbyCollector", () => {
    it("maps Ashby postings to JobResult", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          jobs: [{ title: "AI Engineer", locationName: "Remote", jobUrl: "https://jobs.ashbyhq.com/openai/1", publishedAt: "2024-02-01", descriptionHtml: "<p>Build models.</p>" }],
        }),
      });
      const result = await ashbyCollector.collect({ tenant: "openai", companyName: "OpenAI" });
      expect(result.jobs).toEqual([{
        title: "AI Engineer",
        company: "OpenAI",
        location: "Remote",
        url: "https://jobs.ashbyhq.com/openai/1",
        source: "ashby",
        publishedDate: "2024-02-01",
        descriptionHtml: "<p>Build models.</p>",
      }]);
    });

    it("fails cleanly on error", async () => {
      fetchMock.mockRejectedValue(new Error("boom"));
      const result = await ashbyCollector.collect({ tenant: "openai", companyName: "OpenAI" });
      expect(result.jobs).toEqual([]);
    });
  });

  describe("leverCollector", () => {
    it("maps Lever postings to JobResult", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ([{ text: "Data Scientist", categories: { location: "NYC" }, hostedUrl: "https://jobs.lever.co/netflix/1", createdAt: 1700000000000, descriptionPlain: "Analyze data." }]),
      });
      const result = await leverCollector.collect({ tenant: "netflix", companyName: "Netflix" });
      expect(result.jobs).toEqual([{
        title: "Data Scientist",
        company: "Netflix",
        location: "NYC",
        url: "https://jobs.lever.co/netflix/1",
        source: "lever",
        publishedDate: new Date(1700000000000).toISOString(),
        descriptionHtml: "Analyze data.",
      }]);
    });

    it("fails cleanly on non-ok response", async () => {
      fetchMock.mockResolvedValue({ ok: false });
      const result = await leverCollector.collect({ tenant: "netflix", companyName: "Netflix" });
      expect(result.jobs).toEqual([]);
    });
  });

  describe("smartRecruitersCollector", () => {
    it("maps a successful SmartRecruiters postings response to JobResult", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          totalFound: 1,
          content: [{
            id: "job123",
            name: "Strategy Consultant",
            company: { identifier: "roland-berger", name: "Roland Berger" },
            releaseDate: "2024-03-01",
            location: { city: "Munich", region: "Bavaria", country: "Germany", remote: false },
            actions: [{ id: "apply", type: "link", uri: "https://jobs.smartrecruiters.com/RolandBerger/job123" }],
          }],
        }),
      });

      const result = await smartRecruitersCollector.collect({ tenant: "roland-berger", companyName: "Roland Berger" });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("api.smartrecruiters.com/v1/companies/roland-berger/postings"),
        expect.anything(),
      );
      expect(result.error).toBeUndefined();
      expect(result.jobs).toEqual([{
        title: "Strategy Consultant",
        company: "Roland Berger",
        location: "Munich, Bavaria, Germany",
        url: "https://jobs.smartrecruiters.com/RolandBerger/job123",
        source: "smartrecruiters",
        publishedDate: "2024-03-01",
      }]);
    });

    it("fails cleanly (empty array) when the company has no postings feed", async () => {
      fetchMock.mockResolvedValue({ ok: false });
      const result = await smartRecruitersCollector.collect({ tenant: "unknown-co", companyName: "Unknown Co" });
      expect(result.jobs).toEqual([]);
    });

    it("fails cleanly on a network error", async () => {
      fetchMock.mockRejectedValue(new Error("timeout"));
      const result = await smartRecruitersCollector.collect({ tenant: "roland-berger", companyName: "Roland Berger" });
      expect(result.jobs).toEqual([]);
      expect(result.error).toContain("timeout");
    });

    it("is wired into ATS_COLLECTORS under the smartrecruiters key", () => {
      expect(ATS_COLLECTORS.smartrecruiters).toBe(smartRecruitersCollector);
    });
  });

  describe("naukriCollector", () => {
    it("always fails cleanly with a reason, never throws, never hits the network", async () => {
      const result = await naukriCollector.collect({ companyName: "Any Company" });
      expect(result.jobs).toEqual([]);
      expect(result.error).toBeTruthy();
      expect(result.error).toMatch(/no public/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("is not wired into ATS_COLLECTORS (no per-company Naukri API exists)", () => {
      expect(ATS_COLLECTORS.naukri).toBeUndefined();
    });
  });
});
