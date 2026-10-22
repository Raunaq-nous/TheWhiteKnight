/**
 * P0-3: the OpenRouter model gateway. fetch is mocked: no live provider is
 * ever called. Storage tests use a temporary database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import { chat, visionExtract, CHEAP_MODEL } from "../ai-client";
import { setGatewayHooks, resolveChain, chainNameForTask, DEFAULT_CHAINS, overSpendCap, type AiCallRecord } from "../ai-gateway";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const err = (status: number, body: unknown) => ({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) });
const orReply = (content: string, model = "z-ai/glm-5.3-flash") => ({
  model, choices: [{ message: { content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 100, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 5 }, cost: 0.0012 },
});
const togetherReply = (content: string) => ({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } });

let records: AiCallRecord[];
beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "or-test-key-SECRET";
  process.env.TOGETHER_API_KEY = "tg-test-key-SECRET";
  records = [];
  setGatewayHooks({ record: r => { records.push(r); } });
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = ORIGINAL_FETCH;
  setGatewayHooks(null);
  vi.restoreAllMocks();
});

describe("chains", () => {
  it("structured tasks use the structured chain; writing (untasked, drafting) the writing chain; images the vision chain", () => {
    for (const t of ["scoring", "jd_extraction", "requirement_map", "resume_selection", "gap_analysis", "evaluator", "skill_extraction", "reflector"]) expect(chainNameForTask(t)).toBe("structured");
    expect(chainNameForTask(undefined)).toBe("writing");
    expect(chainNameForTask("drafting")).toBe("writing");
    expect(chainNameForTask("vision")).toBe("vision");
    expect(DEFAULT_CHAINS.structured.length).toBe(3);
    expect(DEFAULT_CHAINS.writing.length).toBe(3);
  });

  it("an operator edit replaces a chain; an empty edit keeps the default", () => {
    setGatewayHooks({ chains: () => ({ writing: ["a/x", "a/x", " b/y "], structured: [] }) });
    expect(resolveChain("writing")).toEqual(["a/x", "b/y"]);
    expect(resolveChain("structured")).toEqual(DEFAULT_CHAINS.structured);
  });
});

describe("OpenRouter requests", () => {
  it("sends the task's chain as OpenRouter's native fallback list, denies data collection, and records the model that served", async () => {
    let url = ""; let body: any; let headers: any;
    global.fetch = vi.fn().mockImplementation(async (u: string, init: any) => { url = u; body = JSON.parse(init.body); headers = init.headers; return ok(orReply("hello", "deepseek/deepseek-v4.1-flash")); }) as any;
    const out = await chat([{ role: "user", content: "score" }], { task: "scoring" });
    expect(out).toBe("hello");
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body.models).toEqual(DEFAULT_CHAINS.structured);
    expect(body.model).toBe(DEFAULT_CHAINS.structured[0]);
    expect(body.provider).toEqual({ data_collection: "deny" });
    expect(body.usage).toEqual({ include: true });
    expect(headers.Authorization).toBe("Bearer or-test-key-SECRET");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ provider: "openrouter", task: "scoring", modelServed: "deepseek/deepseek-v4.1-flash", promptTokens: 100, completionTokens: 20, reasoningTokens: 5, costUsd: 0.0012, ok: true });
  });

  it("never logs or records a key", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { logs.push(a.join(" ")); });
    global.fetch = vi.fn().mockImplementation(async () => ok(orReply("x"))) as any;
    await chat([{ role: "user", content: "hi" }], { task: "evaluator" });
    expect(JSON.stringify(records) + logs.join("\n")).not.toContain("SECRET");
  });

  it("Together is the last fallback: a failed OpenRouter call (402) falls through to Together", async () => {
    const urls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (u: string) => {
      urls.push(u);
      return u.includes("openrouter") ? err(402, { error: { code: 402, message: "Insufficient credits" } }) : ok(togetherReply("from together"));
    }) as any;
    expect(await chat([{ role: "user", content: "hi" }], { task: "scoring" })).toBe("from together");
    expect(urls[0]).toContain("openrouter");
    expect(urls[1]).toContain("together");
    expect(records.find(r => r.provider === "openrouter")?.ok).toBe(false);
  });

  it("model_not_available and empty content also fall through to Together", async () => {
    for (const bad of [err(400, { error: { code: "model_not_available" } }), ok(orReply(""))]) {
      global.fetch = vi.fn().mockImplementation(async (u: string) => (u.includes("openrouter") ? bad : ok(togetherReply("tg")))) as any;
      expect(await chat([{ role: "user", content: "hi" }], { task: "scoring" })).toBe("tg");
    }
  });

  it("without a Together key, an OpenRouter failure is the error returned", async () => {
    delete process.env.TOGETHER_API_KEY;
    global.fetch = vi.fn().mockImplementation(async () => err(402, { error: { message: "no credits" } })) as any;
    await expect(chat([{ role: "user", content: "hi" }], { task: "scoring" })).rejects.toThrow(/OpenRouter error 402/);
  });

  it("without an OpenRouter key, calls go straight to Together as before", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const urls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (u: string) => { urls.push(u); return ok(togetherReply("tg")); }) as any;
    await chat([{ role: "user", content: "hi" }], { task: "scoring" });
    expect(urls).toEqual(["https://api.together.xyz/v1/chat/completions"]);
  });

  it("vision tries the OpenRouter vision chain once, then the Together vision models", async () => {
    const calls: { url: string; model: string; models?: string[] }[] = [];
    global.fetch = vi.fn().mockImplementation(async (u: string, init: any) => {
      const b = JSON.parse(init.body); calls.push({ url: u, model: b.model, models: b.models });
      return u.includes("openrouter") ? err(503, { error: "down" }) : ok(togetherReply("text"));
    }) as any;
    vi.useFakeTimers();
    const p = visionExtract("AAAA", "image/png", "read");
    await vi.runAllTimersAsync();
    expect(await p).toBe("text");
    vi.useRealTimers();
    const orCalls = calls.filter(c => c.url.includes("openrouter"));
    expect(orCalls[0].models).toEqual(DEFAULT_CHAINS.vision);
    expect(new Set(orCalls.map(c => JSON.stringify(c.models))).size).toBe(1); // one chain, retried only by backoff
    expect(calls.at(-1)!.url).toContain("together");
  });
});

describe("spend guard", () => {
  it("a provider at its monthly cap is skipped and the call falls through", async () => {
    setGatewayHooks({ caps: () => ({ openrouter: 5 }), monthlySpend: p => (p === "openrouter" ? 5 : 0), record: r => { records.push(r); } });
    expect(overSpendCap("openrouter")).toBe(true);
    expect(overSpendCap("together")).toBe(false);
    const urls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (u: string) => { urls.push(u); return ok(togetherReply("tg")); }) as any;
    expect(await chat([{ role: "user", content: "hi" }], { task: "scoring" })).toBe("tg");
    expect(urls.every(u => !u.includes("openrouter"))).toBe(true);
  });

  it("when every provider is capped, the call fails with a clear message", async () => {
    setGatewayHooks({ caps: () => ({ openrouter: 1, together: 1 }), monthlySpend: () => 2 });
    global.fetch = vi.fn() as any;
    await expect(chat([{ role: "user", content: "hi" }], { task: "scoring" })).rejects.toThrow(/spend cap/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("no cap means no limit", () => {
    setGatewayHooks({ caps: () => ({ openrouter: null }), monthlySpend: () => 1e9 });
    expect(overSpendCap("openrouter")).toBe(false);
  });
});

describe("gateway storage (temporary database)", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "careeros-gw-"));
    process.env.CAREEROS_DB_PATH = path.join(tmp, "gw.db");
    const { _resetDbForTesting } = await import("../server/db");
    _resetDbForTesting();
  });

  it("records calls, sums this month's spend per provider, and lists recent calls per task", async () => {
    const { gatewayStore } = await import("../server/gateway-store");
    const base = { task: "scoring", provider: "openrouter" as const, modelRequested: "a", modelServed: "a", promptTokens: 1, completionTokens: 1, reasoningTokens: 0, ok: true };
    gatewayStore.record({ ...base, at: "2026-10-02T00:00:00.000Z", costUsd: 1.5 });
    gatewayStore.record({ ...base, at: "2026-10-03T00:00:00.000Z", costUsd: 2 });
    gatewayStore.record({ ...base, at: "2026-09-30T23:59:59.000Z", costUsd: 100 }); // last month
    gatewayStore.record({ ...base, task: "drafting", at: "2026-10-04T00:00:00.000Z", costUsd: 0.5, modelServed: "z-ai/glm-5.3" });
    expect(gatewayStore.monthlySpend("openrouter", new Date("2026-10-21T12:00:00Z"))).toBeCloseTo(4);
    const recent = gatewayStore.recentCalls(10);
    expect(Object.keys(recent).sort()).toEqual(["drafting", "scoring"]);
    expect(recent.drafting[0].modelServed).toBe("z-ai/glm-5.3");
    expect(recent.scoring.map(r => r.at)).toEqual(["2026-10-03T00:00:00.000Z", "2026-10-02T00:00:00.000Z", "2026-09-30T23:59:59.000Z"]); // newest first
  });

  it("stores sanitised chains and caps, and the registered hooks feed resolveChain and the spend guard", async () => {
    const { gatewayStore, registerGatewayHooks, sanitiseGatewaySettings } = await import("../server/gateway-store");
    expect(sanitiseGatewaySettings({ chains: { writing: ["ok/model", "bad id with spaces", ""] , bogus: ["x/y"] }, caps: { openrouter: "12", together: -1, anthropic: "" } }))
      .toEqual({ chains: { writing: ["ok/model"] }, caps: { openrouter: 12 } });
    gatewayStore.saveSettings({ chains: { structured: ["edited/one", "edited/two"] }, caps: { openrouter: 0 } });
    registerGatewayHooks();
    expect(resolveChain("structured")).toEqual(["edited/one", "edited/two"]);
    expect(overSpendCap("openrouter")).toBe(true); // cap 0
  });
});

describe("model health (behind login, cached 10 minutes)", () => {
  it("flags configured OpenRouter ids missing from the public model list, and caches for 10 minutes", async () => {
    const { probeModels, _resetModelHealthCacheForTesting, MODEL_HEALTH_TTL_MS } = await import("../server/services/model-health");
    _resetModelHealthCacheForTesting();
    delete process.env.TOGETHER_API_KEY; // no live Together probes
    const listed = [...DEFAULT_CHAINS.structured, ...DEFAULT_CHAINS.writing]; // vision id missing
    const fetchImpl = vi.fn().mockImplementation(async () => ok({ data: listed.map(id => ({ id })) })) as unknown as typeof fetch;
    const r1 = await probeModels({ now: 1_000, fetchImpl });
    expect(r1.cached).toBe(false);
    expect(r1.openrouter.unknownIds).toEqual(DEFAULT_CHAINS.vision);
    expect(r1.ok).toBe(false);
    expect(JSON.stringify(r1)).not.toContain("SECRET");
    const r2 = await probeModels({ now: 1_000 + MODEL_HEALTH_TTL_MS - 1, fetchImpl });
    expect(r2.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await probeModels({ now: 1_000 + MODEL_HEALTH_TTL_MS + 1, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await probeModels({ now: 1_000 + MODEL_HEALTH_TTL_MS + 2, fetchImpl, force: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("an unreachable model list is reported, not treated as every id being fine", async () => {
    const { probeModels, _resetModelHealthCacheForTesting } = await import("../server/services/model-health");
    _resetModelHealthCacheForTesting();
    delete process.env.TOGETHER_API_KEY;
    const r = await probeModels({ force: true, fetchImpl: (async () => { throw new Error("blocked"); }) as unknown as typeof fetch });
    expect(r.openrouter.listReachable).toBe(false);
    expect(r.openrouter.chains.every(c => c.listed === null)).toBe(true);
    expect(r.ok).toBe(false);
  });
});
