import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  detectAtsFromUrl, detectAtsFromHtml, detectAts, detectAtsDetailed, targetFromDetection, extractCompanyName,
} from "../server/services/ats-detector";

const html = (f: string) => readFileSync(join(__dirname, "fixtures", "ats-detector", f), "utf8");

function page(url: string, body: string, ok = true) {
  return { ok, status: ok ? 200 : 404, url, text: async () => body } as unknown as Response;
}

describe("detectAtsFromUrl", () => {
  it.each([
    ["https://boards.greenhouse.io/acme", "greenhouse", "acme", "https://job-boards.greenhouse.io/acme"],
    ["https://job-boards.greenhouse.io/acme/jobs/123", "greenhouse", "acme", "https://job-boards.greenhouse.io/acme"],
    ["https://boards.greenhouse.io/embed/job_board?for=acme", "greenhouse", "acme", "https://job-boards.greenhouse.io/acme"],
    ["https://boards-api.greenhouse.io/v1/boards/acme/jobs", "greenhouse", "acme", "https://job-boards.greenhouse.io/acme"],
    ["https://jobs.lever.co/acme/abc-123", "lever", "acme", "https://jobs.lever.co/acme"],
    ["jobs.ashbyhq.com/acme", "ashby", "acme", "https://jobs.ashbyhq.com/acme"],
    ["https://careers.smartrecruiters.com/AcmeCorp", "smartrecruiters", "AcmeCorp", "https://careers.smartrecruiters.com/AcmeCorp"],
    ["https://jobs.smartrecruiters.com/AcmeCorp/12345-pm", "smartrecruiters", "AcmeCorp", "https://careers.smartrecruiters.com/AcmeCorp"],
    ["https://acme.wd5.myworkdayjobs.com/en-US/External", "workday", "acme/wd5/External", "https://acme.wd5.myworkdayjobs.com/External"],
    ["https://acme.wd1.myworkdayjobs.com/Careers/job/London/PM_R1", "workday", "acme/wd1/Careers", "https://acme.wd1.myworkdayjobs.com/Careers"],
    ["https://apply.workable.com/acme/j/ABC123/", "workable", "acme", "https://apply.workable.com/acme/"],
    ["https://acme.recruitee.com/o/pm", "recruitee", "acme", "https://acme.recruitee.com"],
    ["https://acme.jobs.personio.de/job/1?language=en", "personio", "acme", "https://acme.jobs.personio.de"],
    ["https://acme.jobs.personio.com", "personio", "acme", "https://acme.jobs.personio.com"],
    ["https://acme.teamtailor.com/jobs", "teamtailor", "acme", "https://acme.teamtailor.com/jobs"],
    ["https://ats.rippling.com/acme/jobs", "rippling", "acme", "https://ats.rippling.com/acme/jobs"],
    ["https://ats.rippling.com/en-GB/acme/jobs/u1", "rippling", "acme", "https://ats.rippling.com/acme/jobs"],
  ])("%s -> %s", (url, ats, tenant, careersUrl) => {
    expect(detectAtsFromUrl(url)).toEqual({ ats, tenant, careersUrl });
  });

  it.each([
    "https://acme.com/careers",
    "https://www.teamtailor.com/en/pricing",
    "https://app.recruitee.com/login",
    "https://apply.workable.com/api/v1/widget",
    "https://acme.wd5.myworkdayjobs.com/",
    "https://boards.greenhouse.io/",
    "not a url at all %%%",
    "",
    "javascript:alert(1)",
  ])("returns null for %s", (url) => {
    expect(detectAtsFromUrl(url)).toBeNull();
  });
});

describe("detectAtsFromHtml", () => {
  it("finds a Greenhouse embed script (with &amp; in the URL)", () => {
    expect(detectAtsFromHtml(html("greenhouse-embed.html"))).toEqual({
      ats: "greenhouse", tenant: "acmeanalytics", careersUrl: "https://job-boards.greenhouse.io/acmeanalytics",
    });
  });
  it("finds a Lever link", () => {
    expect(detectAtsFromHtml(html("lever-link.html"))?.tenant).toBe("betalabs");
  });
  it("finds a JSON-escaped Workday URL", () => {
    expect(detectAtsFromHtml(html("workday-json.html"))).toEqual({
      ats: "workday", tenant: "gammacorp/wd3/Gamma_External", careersUrl: "https://gammacorp.wd3.myworkdayjobs.com/Gamma_External",
    });
  });
  it("finds a Personio iframe", () => {
    expect(detectAtsFromHtml(html("personio-iframe.html"))?.ats).toBe("personio");
  });
  it.each([
    ['<a href="https://jobs.ashbyhq.com/zeta/embed">', "ashby", "zeta"],
    ['<a href="//careers.smartrecruiters.com/Zeta">', "smartrecruiters", "Zeta"],
    ['<a href="https://apply.workable.com/zeta/">', "workable", "zeta"],
    ['<script src="https://zeta.recruitee.com/embed.js"></script>', "recruitee", "zeta"],
    ['<a href="https://zeta.teamtailor.com/jobs">', "teamtailor", "zeta"],
    ['<a href="https://ats.rippling.com/zeta/jobs">', "rippling", "zeta"],
  ])("detects %s", (snippet, ats, tenant) => {
    expect(detectAtsFromHtml(`<html><body>${snippet}</body></html>`)).toMatchObject({ ats, tenant });
  });
  it("returns null when no ATS is present (CDN look-alikes ignored)", () => {
    expect(detectAtsFromHtml(html("no-ats.html"))).toBeNull();
    expect(detectAtsFromHtml("")).toBeNull();
  });
  it("falls back to the base URL", () => {
    expect(detectAtsFromHtml("<html></html>", "https://jobs.lever.co/omega")?.tenant).toBe("omega");
  });
});

describe("extractCompanyName", () => {
  it("prefers og:site_name, then cleans <title>", () => {
    expect(extractCompanyName(html("greenhouse-embed.html"))).toBe("Acme Analytics");
    expect(extractCompanyName(html("lever-link.html"))).toBe("Beta Labs");
    expect(extractCompanyName(html("workday-json.html"))).toBe("Gamma Corp");
    expect(extractCompanyName(html("personio-iframe.html"))).toBe("Epsilon GmbH");
    expect(extractCompanyName("<html></html>")).toBeUndefined();
  });
});

describe("detectAts", () => {
  it("short-circuits on an ATS URL without fetching", async () => {
    const f = vi.fn();
    expect(await detectAts("https://jobs.lever.co/acme", f as unknown as typeof fetch)).toEqual({
      ats: "lever", tenant: "acme", careersUrl: "https://jobs.lever.co/acme",
    });
    expect(f).not.toHaveBeenCalled();
  });

  it("fetches the domain home page and detects an embed", async () => {
    const f = vi.fn().mockResolvedValue(page("https://acme.com/", html("greenhouse-embed.html")));
    const r = await detectAts("acme.com", f as unknown as typeof fetch);
    expect(r).toEqual({
      ats: "greenhouse", tenant: "acmeanalytics", careersUrl: "https://job-boards.greenhouse.io/acmeanalytics", companyName: "Acme Analytics",
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("https://acme.com");
    expect(f.mock.calls[0][1].redirect).toBe("follow");
  });

  it("falls through to /careers then /jobs, max 3 fetches", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(page("https://beta.com/", html("no-ats.html")))
      .mockResolvedValueOnce(page("https://beta.com/careers", "", false))
      .mockResolvedValueOnce(page("https://beta.com/jobs", html("lever-link.html")));
    const r = await detectAts("beta.com", f as unknown as typeof fetch);
    expect(f.mock.calls.map((c) => c[0])).toEqual(["https://beta.com", "https://beta.com/careers", "https://beta.com/jobs"]);
    expect(r).toMatchObject({ ats: "lever", tenant: "betalabs" });
  });

  it("detects from the final redirected URL", async () => {
    const f = vi.fn().mockResolvedValue(page("https://gamma.wd3.myworkdayjobs.com/en-US/Ext", "<html><title>Gamma</title></html>"));
    const r = await detectAts("https://gamma.com/careers", f as unknown as typeof fetch);
    expect(r).toMatchObject({ ats: "workday", tenant: "gamma/wd3/Ext", companyName: "Gamma" });
    expect(f.mock.calls[0][0]).toBe("https://gamma.com/careers");
  });

  it("returns null with a reason when nothing is found, after at most 3 fetches", async () => {
    const f = vi.fn().mockResolvedValue(page("https://delta.com/", html("no-ats.html")));
    const d = await detectAtsDetailed("delta.com", f as unknown as typeof fetch);
    expect(d.result).toBeNull();
    expect(d.reason).toMatch(/no ATS/);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("never throws: rejecting fetch, throwing text(), bad input, private hosts", async () => {
    const rejecting = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(detectAts("acme.com", rejecting as unknown as typeof fetch)).resolves.toBeNull();
    const badBody = vi.fn().mockResolvedValue({ ok: true, url: "https://acme.com", text: async () => { throw new Error("stream"); } });
    await expect(detectAts("acme.com", badBody as unknown as typeof fetch)).resolves.toBeNull();
    const throwsSync = vi.fn(() => { throw new Error("sync"); });
    await expect(detectAts("acme.com", throwsSync as unknown as typeof fetch)).resolves.toBeNull();
    const f = vi.fn();
    await expect(detectAts("", f as unknown as typeof fetch)).resolves.toBeNull();
    await expect(detectAts("localhost", f as unknown as typeof fetch)).resolves.toBeNull();
    await expect(detectAts("http://127.0.0.1/admin", f as unknown as typeof fetch)).resolves.toBeNull();
    await expect(detectAts(undefined as unknown as string, f as unknown as typeof fetch)).resolves.toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("times out a hanging fetch", async () => {
    const hang = vi.fn(() => new Promise<Response>(() => {}));
    const r = await detectAtsDetailed("slow.com", hang as unknown as typeof fetch, { timeoutMs: 5 });
    expect(r.result).toBeNull();
    expect(hang).toHaveBeenCalledTimes(3);
  });
});

describe("targetFromDetection", () => {
  it("builds a CompanyTarget", () => {
    expect(targetFromDetection({ ats: "greenhouse", tenant: "acmeanalytics", careersUrl: "https://job-boards.greenhouse.io/acmeanalytics", companyName: "Acme Analytics" }))
      .toEqual({
        id: "acme-analytics", name: "Acme Analytics", region: ["global"], sector: "industry", ats: "greenhouse",
        atsTenant: "acmeanalytics", careersUrl: "https://job-boards.greenhouse.io/acmeanalytics", enabled: true,
      });
    const t = targetFromDetection({ ats: "workday", tenant: "gamma/wd3/Ext", careersUrl: "https://gamma.wd3.myworkdayjobs.com/Ext" }, "Gamma Corp");
    expect(t.id).toBe("gamma-corp");
    expect(targetFromDetection({ ats: "workday", tenant: "gamma/wd3/Ext", careersUrl: "x" }).name).toBe("gamma");
  });
});
