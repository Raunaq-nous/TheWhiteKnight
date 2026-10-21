import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  chat, getModelForTask, CHEAP_MODEL, DEFAULT_MODEL, isKnownNonServerless, isFailoverTrigger, providerErrorCode,
  probeTogetherModel, configuredTogetherModels, visionExtract,
} from "../ai-client";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function mockResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function togetherResult(opts: { content?: string; finishReason?: string; completionTokens?: number; reasoningTokens?: number; reasoningContent?: string }) {
  return {
    choices: [{
      message: { content: opts.content ?? "", reasoning_content: opts.reasoningContent },
      finish_reason: opts.finishReason ?? "stop",
    }],
    usage: {
      completion_tokens: opts.completionTokens ?? 0,
      completion_tokens_details: { reasoning_tokens: opts.reasoningTokens ?? 0 },
    },
  };
}

describe("ai-client", () => {
  beforeEach(() => {
    process.env.TOGETHER_API_KEY = "test-key";
    delete process.env.AI_MODEL;
    delete process.env.AI_MODEL_SCORING;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  describe("getModelForTask — per-task model registry", () => {
    it("resolves the non-reasoning default for every structured task", () => {
      for (const task of ["scoring", "jd_extraction", "requirement_map", "resume_selection", "profile_extraction", "gap_analysis", "form_answers", "company_discovery", "audit"] as const) {
        expect(getModelForTask(task)).toBe(CHEAP_MODEL);
      }
    });

    it("drafting defaults to a serverless model too, never a dedicated-endpoint one", () => {
      expect(getModelForTask("drafting")).toBe(DEFAULT_MODEL);
      expect(isKnownNonServerless(getModelForTask("drafting"))).toBe(false);
    });

    it("respects a task-specific env var override", () => {
      process.env.AI_MODEL_SCORING = "some/other-model";
      expect(getModelForTask("scoring")).toBe("some/other-model");
    });

    it("drafting still reads the pre-existing global AI_MODEL var for backward compatibility", () => {
      process.env.AI_MODEL = "custom/drafting-model";
      expect(getModelForTask("drafting")).toBe("custom/drafting-model");
    });
  });

  describe("chat() -> Together — per-task model selection end to end", () => {
    it("uses the task's default model when no explicit model is given", async () => {
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        return mockResponse(togetherResult({ content: "ok" }));
      }) as any;

      await chat([{ role: "user", content: "hi" }], { task: "scoring" });
      expect(capturedBody.model).toBe(CHEAP_MODEL);
    });

    it("an explicit opts.model always wins over the task default", async () => {
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        return mockResponse(togetherResult({ content: "ok" }));
      }) as any;

      await chat([{ role: "user", content: "hi" }], { task: "scoring", model: "explicit/model" });
      expect(capturedBody.model).toBe("explicit/model");
    });

    it("falls back to the serverless DEFAULT_MODEL when no task and no model are given", async () => {
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        return mockResponse(togetherResult({ content: "ok" }));
      }) as any;

      await chat([{ role: "user", content: "hi" }], {});
      expect(capturedBody.model).toBe(DEFAULT_MODEL);
    });
  });

  describe("reasoning-token budget exhaustion — the root-cause bug", () => {
    it("detects empty content + finish_reason=length + reasoning_tokens>0 as recoverable, retries ONCE with a substantially larger max_tokens, and returns the retry's content", async () => {
      const calls: any[] = [];
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        calls.push(body);
        if (calls.length === 1) {
          return mockResponse(togetherResult({ content: "", finishReason: "length", completionTokens: 12000, reasoningTokens: 12000 }));
        }
        return mockResponse(togetherResult({ content: '{"ok":true}', finishReason: "stop", completionTokens: 50, reasoningTokens: 0 }));
      }) as any;

      const result = await chat([{ role: "user", content: "score this JD" }], { task: "scoring", maxTokens: 3000 });

      expect(calls).toHaveLength(2); // exactly one retry
      expect(calls[1].max_tokens).toBeGreaterThan(calls[0].max_tokens); // substantially larger budget
      expect(result).toBe('{"ok":true}');
    });

    it("retries only ONCE — if the retry ALSO comes back empty, throws rather than retrying again", async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return mockResponse(togetherResult({ content: "", finishReason: "length", completionTokens: 24000, reasoningTokens: 24000 }));
      }) as any;

      await expect(chat([{ role: "user", content: "x" }], { task: "scoring" })).rejects.toThrow(/even after retrying/);
      expect(callCount).toBe(2); // original + exactly one retry, never a third attempt
    });

    it("also treats a separate reasoning_content field (with empty content and finish_reason=length) as the recoverable case", async () => {
      const calls: any[] = [];
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        calls.push(JSON.parse(init.body));
        if (calls.length === 1) {
          return mockResponse(togetherResult({ content: "", finishReason: "length", reasoningContent: "still thinking..." }));
        }
        return mockResponse(togetherResult({ content: "final answer", finishReason: "stop" }));
      }) as any;

      const result = await chat([{ role: "user", content: "x" }], { task: "scoring" });
      expect(calls).toHaveLength(2);
      expect(result).toBe("final answer");
    });

    it("does NOT retry when content is empty for an unrelated reason (finish_reason=stop, no reasoning tokens) — that's a real error, not a recoverable budget exhaustion", async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return mockResponse(togetherResult({ content: "", finishReason: "stop", completionTokens: 0, reasoningTokens: 0 }));
      }) as any;

      await expect(chat([{ role: "user", content: "x" }], { task: "scoring" })).rejects.toThrow(/returned empty content/);
      expect(callCount).toBe(1); // no retry attempted
    });

    it("does NOT retry when finish_reason=length but there was never any reasoning (a genuinely non-reasoning model truncating normal content)", async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        // Empty content with finish_reason length but zero reasoning tokens
        // and no reasoning_content — not the reasoning-exhaustion pattern.
        return mockResponse(togetherResult({ content: "", finishReason: "length", completionTokens: 0, reasoningTokens: 0 }));
      }) as any;

      await expect(chat([{ role: "user", content: "x" }], { task: "scoring" })).rejects.toThrow(/returned empty content/);
      expect(callCount).toBe(1);
    });
  });

  describe("token-split logging — visibility for this failure class", () => {
    it("logs the reasoning/content token split on every call", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      global.fetch = vi.fn().mockResolvedValue(
        mockResponse(togetherResult({ content: "ok", finishReason: "stop", completionTokens: 100, reasoningTokens: 40 })),
      ) as any;

      await chat([{ role: "user", content: "x" }], { task: "scoring" });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reasoning_tokens=40"));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("content_tokens=60"));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("finish_reason=stop"));
    });

    it("logs a warning specifically when retrying for reasoning exhaustion", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});
      let calls = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        calls++;
        if (calls === 1) return mockResponse(togetherResult({ content: "", finishReason: "length", completionTokens: 12000, reasoningTokens: 12000 }));
        return mockResponse(togetherResult({ content: "ok", finishReason: "stop" }));
      }) as any;

      await chat([{ role: "user", content: "x" }], { task: "scoring" });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Retrying once with max_tokens="));
    });
  });

  describe("non-Together providers ignore `task` entirely", () => {
    it("an Anthropic provider's own configured model is used regardless of task", async () => {
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        return mockResponse({ content: [{ text: "ok" }] });
      }) as any;

      await chat([{ role: "user", content: "x" }], { task: "scoring" }, { provider: "anthropic", model: "claude-x", apiKey: "k" });
      expect(capturedBody.model).toBe("claude-x");
    });
  });

  describe("failover", () => {
    const NOT_SERVERLESS = JSON.stringify({ id: "x", error: { message: "Unable to access non-serverless model deepseek-ai/DeepSeek-V4-Pro. Please visit https://api.together.ai/models/deepseek-ai/DeepSeek-V4-Pro to create and start a new dedicated endpoint for the model.", type: "invalid_request_error", param: null, code: "model_not_available" } });
    const errorResponse = (status: number, body: string) => ({ ok: false, status, text: async () => body, json: async () => JSON.parse(body) });

    it("a 400 or 404 with model_not_available / model_not_found triggers failover, like 401/402/403/429/5xx", () => {
      expect(isFailoverTrigger(400, providerErrorCode(NOT_SERVERLESS))).toBe(true);
      expect(isFailoverTrigger(404, "model_not_found")).toBe(true);
      expect(isFailoverTrigger(404, "model_not_available")).toBe(true);
      for (const s of [401, 402, 403, 429, 500, 502, 503]) expect(isFailoverTrigger(s, null), String(s)).toBe(true);
      // Any other bad request is the caller's fault: no failover.
      expect(isFailoverTrigger(400, "invalid_request_error")).toBe(false);
      expect(isFailoverTrigger(400, null)).toBe(false);
      expect(isFailoverTrigger(404, null)).toBe(false);
      expect(providerErrorCode('{"message":"model_not_found: no such model"}')).toBe("model_not_found");
    });

    it("the live failure: a stored DeepSeek-V4-Pro setting fails over to the serverless default and the call succeeds", async () => {
      const models: string[] = [];
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        models.push(body.model);
        if (body.model === "some/dedicated-only-model") return errorResponse(400, NOT_SERVERLESS);
        return mockResponse(togetherResult({ content: "ok" }));
      }) as any;
      const out = await chat([{ role: "user", content: "hi" }], { task: "form_answers" }, { provider: "together", model: "some/dedicated-only-model" });
      expect(out).toBe("ok");
      expect(models).toEqual(["some/dedicated-only-model", CHEAP_MODEL]);
    });

    it("a known dedicated-endpoint model is skipped without spending a request", async () => {
      const models: string[] = [];
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        models.push(JSON.parse(init.body).model);
        return mockResponse(togetherResult({ content: "ok" }));
      }) as any;
      await chat([{ role: "user", content: "hi" }], {}, { provider: "together", model: "deepseek-ai/DeepSeek-V4-Pro" });
      expect(models).toEqual([DEFAULT_MODEL]);
    });

    it("a 404 model_not_found fails over too", async () => {
      const models: string[] = [];
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        const m = JSON.parse(init.body).model;
        models.push(m);
        return m === "gone/model" ? errorResponse(404, JSON.stringify({ error: { code: "model_not_found" } })) : mockResponse(togetherResult({ content: "ok" }));
      }) as any;
      expect(await chat([{ role: "user", content: "hi" }], { model: "gone/model" })).toBe("ok");
      expect(models).toEqual(["gone/model", DEFAULT_MODEL]);
    });

    it("a BYO provider's 401/402/403 fails over to Together", async () => {
      const urls: string[] = [];
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        urls.push(url);
        return url.includes("anthropic") ? errorResponse(402, '{"error":{"type":"billing_error"}}') : mockResponse(togetherResult({ content: "ok" }));
      }) as any;
      const out = await chat([{ role: "user", content: "hi" }], { task: "scoring" }, { provider: "anthropic", model: "claude-x", apiKey: "k" });
      expect(out).toBe("ok");
      expect(urls[0]).toContain("anthropic");
      expect(urls[1]).toContain("together");
    });

    it("an ordinary 400 bad request does NOT fail over", async () => {
      let calls = 0;
      global.fetch = vi.fn().mockImplementation(async () => { calls++; return errorResponse(400, '{"error":{"code":"invalid_request_error","message":"bad"}}'); }) as any;
      await expect(chat([{ role: "user", content: "hi" }], { model: "a/b" })).rejects.toThrow(/400/);
      expect(calls).toBe(1);
    });

    it("when every model fails over, the last error is thrown", async () => {
      global.fetch = vi.fn().mockImplementation(async () => errorResponse(400, NOT_SERVERLESS)) as any;
      await expect(chat([{ role: "user", content: "hi" }], { model: "x/y" })).rejects.toThrow(/model_not_available/);
    });

    it("vision falls through to the next vision model on model_not_available", async () => {
      const models: string[] = [];
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        const m = JSON.parse(init.body).model;
        models.push(m);
        return models.length === 1 ? errorResponse(400, NOT_SERVERLESS) : mockResponse(togetherResult({ content: "text" }));
      }) as any;
      expect(await visionExtract("AAAA", "image/png", "read")).toBe("text");
      expect(models).toHaveLength(2);
      expect(models[1]).not.toBe(models[0]);
    });
  });

  describe("serverless health probe", () => {
    it("no configured default is a known dedicated-endpoint model", () => {
      for (const c of configuredTogetherModels()) expect(isKnownNonServerless(c.model), c.model).toBe(false);
    });

    it("flags a model Together refuses as non-serverless, by name", async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({ ok: false, status: 400, text: async () => '{"error":{"code":"model_not_available"}}' })) as any;
      expect(await probeTogetherModel("acme/big-model")).toMatchObject({ model: "acme/big-model", status: "not-serverless", code: "model_not_available" });
    });

    it("flags a known dedicated-endpoint model without a request", async () => {
      global.fetch = vi.fn() as any;
      expect((await probeTogetherModel("deepseek-ai/DeepSeek-V4-Pro")).status).toBe("not-serverless");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("a model that answers is serverless; an outage is 'error', not a false flag", async () => {
      global.fetch = vi.fn().mockImplementation(async () => mockResponse(togetherResult({ content: "O" }))) as any;
      expect((await probeTogetherModel(CHEAP_MODEL)).status).toBe("serverless");
      global.fetch = vi.fn().mockImplementation(async () => ({ ok: false, status: 503, text: async () => "down" })) as any;
      expect((await probeTogetherModel(CHEAP_MODEL)).status).toBe("error");
    });
  });
});
