/** P1-1: JD fetch order (direct + JSON-LD, then Jina Reader, then Exa last) and the automated-access rules. */
import { describe, it, expect, vi } from "vitest";
import { fetchJdText, isRestrictedJobHost } from "../server/services/jd-fetch-service";

const LONG = "We are hiring a strategy manager. ".repeat(20);
const res = (status: number, body: string, json?: unknown) => ({ ok: status < 400, status, text: async () => body, json: async () => json ?? JSON.parse(body) });

function router(map: Record<string, () => unknown>) {
  const calls: string[] = [];
  const f = vi.fn(async (url: string) => {
    calls.push(url);
    const key = Object.keys(map).find(k => url.includes(k));
    return key ? map[key]() : res(404, "not found");
  });
  return { f: f as unknown as typeof fetch, calls };
}

describe("JD fetch order", () => {
  it("direct fetch with JSON-LD wins and nothing else is called", async () => {
    const ld = `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Manager", description: LONG, hiringOrganization: { name: "Acme" } })}</script>`;
    const { f, calls } = router({ "acme.com": () => res(200, `<html>${ld}</html>`) });
    const r = await fetchJdText("https://acme.com/jobs/1", { fetchImpl: f, mode: "automated" });
    expect(r.ok && r.source).toBe("direct");
    expect(calls).toHaveLength(1);
  });

  it("falls back to Jina Reader when the direct page is unusable, with the optional key", async () => {
    const { f, calls } = router({ "r.jina.ai": () => res(200, LONG), "acme.com": () => res(403, "") });
    const r = await fetchJdText("https://acme.com/jobs/1", { fetchImpl: f, mode: "automated", jinaApiKey: "jina-key" });
    expect(r.ok && r.source).toBe("jina");
    expect(calls[1]).toBe("https://r.jina.ai/https://acme.com/jobs/1");
    expect(vi.mocked(f as any).mock.calls[1][1].headers.Authorization).toBe("Bearer jina-key");
  });

  it("autopilot (automated) never calls Exa, even with a key", async () => {
    const { f, calls } = router({ "acme.com": () => res(403, ""), "r.jina.ai": () => res(500, "") , "api.exa.ai": () => res(200, "", { results: [{ text: LONG }] }) });
    const r = await fetchJdText("https://acme.com/jobs/1", { fetchImpl: f, mode: "automated", exaApiKey: "exa" });
    expect(r.ok).toBe(false);
    expect(calls.some(c => c.includes("exa.ai"))).toBe(false);
  });

  it("a manual fetch uses Exa only as the last resort", async () => {
    const { f, calls } = router({ "acme.com": () => res(403, ""), "r.jina.ai": () => res(500, ""), "api.exa.ai": () => res(200, "", { results: [{ text: LONG }] }) });
    const r = await fetchJdText("https://acme.com/jobs/1", { fetchImpl: f, mode: "manual", exaApiKey: "exa" });
    expect(r.ok && r.source).toBe("exa");
    expect(calls.map(c => new URL(c).hostname)).toEqual(["acme.com", "r.jina.ai", "api.exa.ai"]);
  });

  it("automated access never touches LinkedIn, Naukri, Indeed and similar", async () => {
    for (const url of ["https://www.linkedin.com/jobs/view/1", "https://www.naukri.com/job-listings-x", "https://in.indeed.com/viewjob?jk=1", "https://www.glassdoor.com/job/1", "https://www.iimjobs.com/j/x"]) {
      expect(isRestrictedJobHost(url), url).toBe(true);
      const { f, calls } = router({});
      const r = await fetchJdText(url, { fetchImpl: f, mode: "automated", exaApiKey: "exa" });
      expect(r.ok).toBe(false);
      expect(calls, url).toHaveLength(0);
    }
    expect(isRestrictedJobHost("https://boards.greenhouse.io/acme/jobs/1")).toBe(false);
  });

  it("a restricted URL the user pastes is never sent to Jina", async () => {
    const { f, calls } = router({ "linkedin.com": () => res(403, "") });
    await fetchJdText("https://www.linkedin.com/jobs/view/1", { fetchImpl: f, mode: "manual" });
    expect(calls.some(c => c.includes("jina"))).toBe(false);
  });
});
