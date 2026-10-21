import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { workdayCollector, parseWorkdayBoard } from "../server/services/collectors/workday";
import { workableCollector } from "../server/services/collectors/workable";
import { recruiteeCollector } from "../server/services/collectors/recruitee";
import { personioCollector } from "../server/services/collectors/personio";
import { teamtailorCollector, decodeEntities } from "../server/services/collectors/teamtailor";
import { ripplingCollector } from "../server/services/collectors/rippling";

const FIX = join(__dirname, "fixtures", "collectors");
const fixText = (f: string) => readFileSync(join(FIX, f), "utf8");
const fixJson = (f: string) => JSON.parse(fixText(f));

const jsonRes = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const textRes = (body: string) => ({ ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) });
const badJsonRes = () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); }, text: async () => "<html>" });

describe("ATS collectors", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const all = [
    ["workday", workdayCollector],
    ["workable", workableCollector],
    ["recruitee", recruiteeCollector],
    ["personio", personioCollector],
    ["teamtailor", teamtailorCollector],
    ["rippling", ripplingCollector],
  ] as const;

  describe.each(all)("%s common behaviour", (name, collector) => {
    const tenant = name === "workday" ? "acme/wd5/External" : "acme";

    it("has name equal to the source", () => { expect(collector.name).toBe(name); });

    it("returns [] with no tenant and never fetches", async () => {
      const r = await collector.collect({});
      expect(r).toEqual({ jobs: [] });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns an error (not a throw) on non-OK HTTP", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 });
      const r = await collector.collect({ tenant });
      expect(r.jobs).toEqual([]);
      expect(r.error).toMatch(/503/);
    });

    it("returns an error on a network failure", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const r = await collector.collect({ tenant });
      expect(r.jobs).toEqual([]);
      expect(r.error).toContain("network down");
    });

    it("returns an error on a malformed body", async () => {
      fetchMock.mockResolvedValue(name === "personio" || name === "teamtailor" ? textRes("<html>not a feed</html>") : badJsonRes());
      const r = await collector.collect({ tenant });
      expect(r.jobs).toEqual([]);
      expect(r.error).toBeTruthy();
    });

    it("returns an error on a well-formed but wrong-shaped body", async () => {
      fetchMock.mockResolvedValue(name === "personio" || name === "teamtailor" ? textRes("{}") : jsonRes({ unexpected: true }));
      const r = await collector.collect({ tenant });
      expect(r.jobs).toEqual([]);
      expect(r.error).toBeTruthy();
    });
  });

  describe("workdayCollector", () => {
    const template = (i: number) => ({
      title: `Strategy Analyst ${i}`,
      externalPath: `/job/London/Strategy-Analyst-${i}_R${1000 + i}`,
      locationsText: "London",
      postedOn: "Posted Yesterday",
      bulletFields: [`R${1000 + i}`],
    });
    const page0 = { total: 23, jobPostings: Array.from({ length: 20 }, (_, i) => template(i)), facets: [] };

    it("parses careers URLs and tenant strings", () => {
      expect(parseWorkdayBoard({ careersUrl: "https://acme.wd5.myworkdayjobs.com/en-US/External" }))
        .toEqual({ tenant: "acme", wd: "wd5", site: "External", host: "acme.wd5.myworkdayjobs.com" });
      expect(parseWorkdayBoard({ careersUrl: "https://acme.wd1.myworkdayjobs.com/Careers" })?.site).toBe("Careers");
      expect(parseWorkdayBoard({ tenant: "acme/wd3/Ext_Site" })).toEqual({ tenant: "acme", wd: "wd3", site: "Ext_Site", host: "acme.wd3.myworkdayjobs.com" });
      expect(parseWorkdayBoard({ tenant: "acme" })).toBeNull();
    });

    it("paginates by offset (0 then 20, limit 20, POST JSON) until the reported total", async () => {
      fetchMock.mockResolvedValueOnce(jsonRes(page0)).mockResolvedValueOnce(jsonRes(fixJson("workday-page1.json")));
      const r = await workdayCollector.collect({
        careersUrl: "https://acme.wd5.myworkdayjobs.com/en-US/External", companyName: "Acme", query: "strategy",
      });
      expect(r.error).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const bodies = fetchMock.mock.calls.map(([url, init]) => {
        expect(url).toBe("https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/jobs");
        expect(init.method).toBe("POST");
        expect(init.headers["Content-Type"]).toBe("application/json");
        return JSON.parse(init.body);
      });
      expect(bodies).toEqual([
        { appliedFacets: {}, limit: 20, offset: 0, searchText: "strategy" },
        { appliedFacets: {}, limit: 20, offset: 20, searchText: "strategy" },
      ]);
      expect(r.jobs).toHaveLength(23);
      expect(r.jobs[20]).toEqual({
        title: "Strategy Manager, Corporate Development",
        company: "Acme",
        url: "https://acme.wd5.myworkdayjobs.com/External/job/London/Strategy-Manager--Corporate-Development_R0101",
        applyUrl: "https://acme.wd5.myworkdayjobs.com/External/job/London/Strategy-Manager--Corporate-Development_R0101/apply",
        source: "workday",
        externalId: "R0101",
        location: "London",
        publishedDate: "Posted 2 Days Ago",
      });
      expect(r.jobs[21].remote).toBe(true);
      // No bulletFields: falls back to externalPath.
      expect(r.jobs[22].externalId).toBe("/job/Dubai/Business-Operations-Lead_R0103");
    });

    it("caps pages with maxPages", async () => {
      fetchMock.mockResolvedValue(jsonRes({ total: 500, jobPostings: page0.jobPostings }));
      const r = await workdayCollector.collect({ tenant: "acme/wd5/External", maxPages: 3 });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(JSON.parse(fetchMock.mock.calls[2][1].body).offset).toBe(40);
      expect(r.jobs).toHaveLength(20); // same URLs each page are deduped
      expect(r.jobs[0].company).toBe("acme");
    });

    it("stops after one page when total fits on it", async () => {
      fetchMock.mockResolvedValue(jsonRes({ total: 2, jobPostings: [template(1), template(2)] }));
      const r = await workdayCollector.collect({ tenant: "acme/wd5/External" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(r.jobs).toHaveLength(2);
    });

    it("keeps page-0 jobs and reports an error when a later page fails", async () => {
      fetchMock.mockResolvedValueOnce(jsonRes(page0)).mockResolvedValueOnce({ ok: false, status: 429 });
      const r = await workdayCollector.collect({ tenant: "acme/wd5/External" });
      expect(r.jobs).toHaveLength(20);
      expect(r.error).toMatch(/429/);
    });

    it("errors cleanly when the tenant cannot be parsed", async () => {
      const r = await workdayCollector.collect({ tenant: "acme" });
      expect(r.jobs).toEqual([]);
      expect(r.error).toMatch(/tenant/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("workableCollector maps the widget response", async () => {
    fetchMock.mockResolvedValue(jsonRes(fixJson("workable.json")));
    const r = await workableCollector.collect({ tenant: "acme-robotics", companyName: "Acme Robotics" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://apply.workable.com/api/v1/widget/accounts/acme-robotics?details=true");
    expect(r.error).toBeUndefined();
    expect(r.jobs).toHaveLength(2);
    expect(r.jobs[0]).toEqual({
      title: "Head of Strategy &amp; Operations",
      company: "Acme Robotics",
      url: "https://apply.workable.com/j/A1B2C3D4E5",
      applyUrl: "https://apply.workable.com/j/A1B2C3D4E5/apply",
      source: "workable",
      externalId: "A1B2C3D4E5",
      location: "London, England, United Kingdom",
      publishedDate: "2026-09-30",
      descriptionHtml: "<p>Lead strategy and operations across the company.</p>",
      remote: false,
    });
    expect(r.jobs[1].remote).toBe(true);
    expect(r.jobs[1].location).toBe("Berlin, Germany");
  });

  it("recruiteeCollector maps offers", async () => {
    fetchMock.mockResolvedValue(jsonRes(fixJson("recruitee.json")));
    const r = await recruiteeCollector.collect({ tenant: "acme" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://acme.recruitee.com/api/offers/");
    expect(r.jobs).toHaveLength(2);
    expect(r.jobs[0]).toEqual({
      title: "Strategy Associate",
      company: "acme",
      url: "https://acme.recruitee.com/o/strategy-associate",
      applyUrl: "https://acme.recruitee.com/o/strategy-associate/c/new",
      source: "recruitee",
      externalId: "1100201",
      location: "Amsterdam, Netherlands",
      publishedDate: "2026-10-01 09:15:00 UTC",
      descriptionHtml: "<p>Shape company strategy.</p>\n<ul><li>3+ years consulting</li></ul>",
      remote: false,
    });
    expect(r.jobs[1].remote).toBe(true);
    expect(r.jobs[1].location).toBeUndefined();
  });

  it("teamtailorCollector parses RSS with CDATA and HTML entities", async () => {
    fetchMock.mockResolvedValue(textRes(fixText("teamtailor.rss")));
    const r = await teamtailorCollector.collect({ tenant: "acme", companyName: "Acme Nordic" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://acme.teamtailor.com/jobs.rss");
    expect(r.error).toBeUndefined();
    expect(r.jobs).toHaveLength(2);
    expect(r.jobs[0]).toEqual({
      title: "Strategy & Insights Manager",
      company: "Acme Nordic",
      url: "https://acme.teamtailor.com/jobs/1234567-strategy-insights-manager",
      source: "teamtailor",
      externalId: "a1b2c3d4-0000-4000-8000-000000000001",
      publishedDate: "2026-10-05T06:30:00.000Z",
      descriptionHtml: "<p>Drive <strong>strategy</strong> & insights.</p>",
      location: "Stockholm, Sweden",
      remote: false,
    });
    expect(r.jobs[1].title).toBe("Product Lead, AI & Data – Remote");
    expect(r.jobs[1].descriptionHtml).toBe("<p>Build &amp; ship AI products.</p>");
    expect(r.jobs[1].location).toBe("Remote");
    expect(r.jobs[1].remote).toBe(true);
  });

  it("decodeEntities handles named, decimal and hex entities without double-decoding", () => {
    expect(decodeEntities("a &amp;lt; b &#38; c &#x26; &copy;")).toBe("a &lt; b & c & &copy;");
  });

  it("personioCollector parses the XML feed", async () => {
    fetchMock.mockResolvedValue(textRes(fixText("personio.xml")));
    const r = await personioCollector.collect({ tenant: "acme", companyName: "Acme GmbH" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://acme.jobs.personio.de/xml?language=en");
    expect(r.error).toBeUndefined();
    expect(r.jobs).toHaveLength(2);
    expect(r.jobs[0]).toEqual({
      title: "Senior Strategy Manager (m/f/d)",
      company: "Acme GmbH",
      url: "https://acme.jobs.personio.de/job/1500001?language=en",
      source: "personio",
      externalId: "1500001",
      location: "Munich",
      publishedDate: "2026-09-20T10:11:12+00:00",
      descriptionHtml: "<h3>Your mission</h3><p>Lead the strategic planning cycle.</p>\n<h3>Your profile</h3><ul><li>5+ years in consulting</li></ul>",
    });
    expect(r.jobs[1].remote).toBe(true);
  });

  it("personioCollector returns [] (no error) for an empty feed", async () => {
    fetchMock.mockResolvedValue(textRes('<?xml version="1.0"?><workzag-jobs></workzag-jobs>'));
    expect(await personioCollector.collect({ tenant: "acme" })).toEqual({ jobs: [] });
  });

  it("ripplingCollector maps an array response", async () => {
    fetchMock.mockResolvedValue(jsonRes(fixJson("rippling.json")));
    const r = await ripplingCollector.collect({ tenant: "acme", companyName: "Acme" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.rippling.com/platform/api/ats/v1/board/acme/jobs");
    expect(r.jobs).toHaveLength(2);
    expect(r.jobs[0]).toEqual({
      title: "Strategy & Operations Manager",
      company: "Acme",
      url: "https://ats.rippling.com/acme/jobs/0b6f6a7e-1111-4c1e-9d0a-000000000001",
      source: "rippling",
      externalId: "0b6f6a7e-1111-4c1e-9d0a-000000000001",
      location: "San Francisco, CA",
    });
    expect(r.jobs[1].remote).toBe(true);
  });

  it.each(["items", "results"])("ripplingCollector accepts a {%s: [...]} wrapper", async (key) => {
    fetchMock.mockResolvedValue(jsonRes({ [key]: [{ uuid: "u1", name: "PM", workLocation: { label: "NYC" } }] }));
    const r = await ripplingCollector.collect({ tenant: "acme" });
    expect(r.jobs).toEqual([{
      title: "PM", company: "acme", url: "https://ats.rippling.com/acme/jobs/u1", source: "rippling", externalId: "u1", location: "NYC",
    }]);
  });
});
