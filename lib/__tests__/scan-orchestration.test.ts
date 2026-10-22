/** P1-1: scan orchestration across company-direct, Google Jobs, remote boards, aggregators and Exa. Collectors are stubbed. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { calls, greenhouse, serpapi, remotive, theirstack, exaPortal, exaCompany, adzuna } = vi.hoisted(() => {
  const calls: string[] = [];
  const make = (name: string, jobs: Record<string, unknown>[]) => ({
    name,
    collect: async () => { calls.push(name); return { jobs: jobs.map(j => ({ title: "Strategy Manager", url: `https://x/${name}`, source: name, ...j })) }; },
  });
  return {
    calls,
    greenhouse: make("greenhouse", [{ company: "Acme", url: "https://boards.greenhouse.io/acme/jobs/1" }]),
    serpapi: make("serpapi", [{ company: "Acme", url: "https://www.google.com/x", applyUrl: "https://boards.greenhouse.io/acme/jobs/1" }, { company: "Beta", title: "Strategy Manager, India", url: "https://www.google.com/y" }]),
    remotive: make("remotive", [{ company: "Gamma", title: "Strategy Manager (Remote)", url: "https://remotive.com/j/1" }]),
    theirstack: make("theirstack", [{ company: "Delta", title: "Strategy Manager, EMEA", url: "https://jobs.delta.com/1" }]),
    exaPortal: make("exa-portal", [{ company: "Eps", url: "https://bayt.com/x" }]),
    exaCompany: make("exa-company", []),
    adzuna: make("adzuna", []),
  };
});

vi.mock("../server/services/collectors", () => ({
  ATS_COLLECTORS: { greenhouse },
  GOOGLE_JOBS_COLLECTORS: [{ source: "serpapi", envKey: "SERPAPI_API_KEY", collector: serpapi }],
  KEYED_AGGREGATORS: [{ source: "theirstack", envKey: "THEIRSTACK_API_KEY", collector: theirstack }],
  REMOTE_BOARD_COLLECTORS: [remotive],
  REGION_PORTAL_DOMAINS: { global: ["bayt.com"], india: ["bayt.com"], "middle-east": [], apac: [], "north-america": [], europe: [] },
  exaPortalCollector: exaPortal,
  exaCompanyCollector: exaCompany,
  adzunaCollector: adzuna,
}));
vi.mock("../server/source-budget", async () => {
  const actual = await vi.importActual<typeof import("../server/source-budget")>("../server/source-budget");
  return { ...actual, dbSourceBudget: () => actual.memorySourceBudget() };
});

import { scanJobs } from "../server/services/scan-service";
import { memorySourceBudget } from "../server/source-budget";

const company = { id: "acme", name: "Acme", region: ["global"], sector: "industry", ats: "greenhouse", atsTenant: "acme", careersUrl: "https://acme.com/careers", enabled: true } as any;
const ENV = { ...process.env };

beforeEach(() => {
  calls.length = 0;
  process.env.SERPAPI_API_KEY = "serp-key";
  process.env.THEIRSTACK_API_KEY = "ts-key";
});
afterEach(() => { process.env = { ...ENV }; });

describe("scan orchestration", () => {
  it("manual: company-direct, Google Jobs, remote boards, aggregators and Exa, deduped with the company-direct URL kept", async () => {
    const r = await scanJobs({ query: "strategy manager", regions: ["global"], companies: [company], exaApiKey: "exa", budget: memorySourceBudget() });
    expect(calls).toEqual(expect.arrayContaining(["greenhouse", "serpapi", "remotive", "theirstack", "exa-portal"]));
    const acme = r.jobs.filter(j => j.company === "Acme");
    expect(acme).toHaveLength(1);
    expect(acme[0].url).toBe("https://boards.greenhouse.io/acme/jobs/1");
    expect(r.feeds?.acme).toEqual(["https://boards.greenhouse.io/acme/jobs/1"]);
    expect(r.counts.bySource?.greenhouse).toBe(1);
  });

  it("autopilot never calls Exa, even with a key", async () => {
    await scanJobs({ query: "strategy manager", regions: ["global"], companies: [company], exaApiKey: "exa", mode: "autopilot", budget: memorySourceBudget() });
    expect(calls).not.toContain("exa-portal");
    expect(calls).not.toContain("exa-company");
  });

  it("autopilot prefers keyless, company-direct sources: keyed aggregators only top up", async () => {
    const budget = memorySourceBudget();
    await scanJobs({ query: "strategy manager", regions: ["global"], companies: [company], mode: "autopilot", numResults: 1, budget });
    // The company board already met the target: no paid calls spent.
    expect(calls).not.toContain("serpapi");
    expect(calls).not.toContain("theirstack");
    expect(budget.used("serpapi")).toBe(0);
  });

  it("keyed sources respect their monthly budget and are reported when skipped", async () => {
    const budget = memorySourceBudget({ serpapi: 0, theirstack: 5 });
    const r = await scanJobs({ query: "strategy manager", regions: ["global"], companies: [company], budget });
    expect(calls).not.toContain("serpapi");
    expect(r.budgetSkipped).toContain("serpapi");
    expect(budget.used("theirstack")).toBe(1);
  });

  it("keyed sources without a key are never called", async () => {
    delete process.env.SERPAPI_API_KEY;
    await scanJobs({ query: "strategy manager", regions: ["global"], companies: [company], budget: memorySourceBudget() });
    expect(calls).not.toContain("serpapi");
  });

  it("orders equally relevant jobs company-direct first by default", async () => {
    const r = await scanJobs({ query: "strategy manager", regions: ["global"], companies: [company], budget: memorySourceBudget(), includeRemoteBoards: true });
    expect(r.jobs[0].source).toBe("greenhouse");
  });
});
