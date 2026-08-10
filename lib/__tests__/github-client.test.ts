import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getFileContent, createBranch, updateFile, createPullRequest } from "../server/github-client";

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  });
}

describe("github-client", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it("getFileContent decodes base64 content and returns the file's sha", async () => {
    const content = Buffer.from("export const builds = [];").toString("base64");
    global.fetch = mockFetchOnce(200, { content, encoding: "base64", sha: "abc123" }) as any;
    const file = await getFileContent("tok", "owner", "repo", "src/data/builds.ts", "main");
    expect(file.content).toBe("export const builds = [];");
    expect(file.sha).toBe("abc123");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/repos/owner/repo/contents/src%2Fdata%2Fbuilds.ts?ref=main"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer tok" }) }),
    );
  });

  it("getFileContent throws a clear error on a non-2xx response", async () => {
    global.fetch = mockFetchOnce(404, { message: "Not Found" }) as any;
    await expect(getFileContent("tok", "owner", "repo", "missing.ts", "main")).rejects.toThrow(/404/);
  });

  it("createBranch reads the base branch's head sha then creates a new ref pointing at it", async () => {
    const calls: any[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      calls.push({ url, init });
      if (url.includes("/git/ref/heads/main")) {
        return { ok: true, json: async () => ({ object: { sha: "base-sha" } }) };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const branch = await createBranch("tok", "owner", "repo", "careeros-sync/new-project", "main");
    expect(branch).toBe("careeros-sync/new-project");
    const createRefCall = calls.find(c => c.url.endsWith("/git/refs"));
    expect(createRefCall).toBeDefined();
    const body = JSON.parse(createRefCall.init.body);
    expect(body).toEqual({ ref: "refs/heads/careeros-sync/new-project", sha: "base-sha" });
  });

  it("updateFile PUTs base64-encoded content to the given branch with the required sha", async () => {
    let capturedBody: any;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({}) };
    }) as any;

    await updateFile("tok", "owner", "repo", "src/data/builds.ts", "new content", "Add: X", "careeros-sync/x", "old-sha");
    expect(capturedBody.branch).toBe("careeros-sync/x");
    expect(capturedBody.sha).toBe("old-sha");
    expect(capturedBody.message).toBe("Add: X");
    expect(Buffer.from(capturedBody.content, "base64").toString("utf-8")).toBe("new content");
  });

  it("createPullRequest posts to /pulls and returns the PR url and number", async () => {
    global.fetch = mockFetchOnce(201, { html_url: "https://github.com/owner/repo/pull/42", number: 42 }) as any;
    const pr = await createPullRequest("tok", "owner", "repo", { title: "Add: X", head: "careeros-sync/x", base: "main", body: "..." });
    expect(pr).toEqual({ url: "https://github.com/owner/repo/pull/42", number: 42 });
  });

  it("never targets a base branch as the PUT target for updateFile — branch param is always the caller-supplied working branch", async () => {
    // Structural guard against a regression where push accidentally commits
    // to main: updateFile has no special-case for any branch name, it just
    // writes whatever branch it's given — the actual "never main" guarantee
    // lives in the push route always creating a fresh branch first
    // (createBranch) and passing THAT branch here, never PORTFOLIO_REPO.branch.
    let capturedBody: any;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({}) };
    }) as any;
    await updateFile("tok", "owner", "repo", "f.ts", "c", "m", "careeros-sync/branch", "sha");
    expect(capturedBody.branch).not.toBe("main");
  });
});
