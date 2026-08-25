import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chat, getModelForTask, CHEAP_MODEL } from "../ai-client";

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

    it("resolves the reasoning model for the drafting tier", () => {
      expect(getModelForTask("drafting")).toBe("deepseek-ai/DeepSeek-V4-Pro");
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

    it("falls back to the reasoning DEFAULT_MODEL when no task and no model are given (unchanged legacy behavior)", async () => {
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        return mockResponse(togetherResult({ content: "ok" }));
      }) as any;

      await chat([{ role: "user", content: "hi" }], {});
      expect(capturedBody.model).toBe("deepseek-ai/DeepSeek-V4-Pro");
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
});
