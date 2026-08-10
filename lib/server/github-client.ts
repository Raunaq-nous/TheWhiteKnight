import "server-only";
// Thin GitHub REST API wrapper for the portfolio sync feature. PULL only
// ever needs Contents:read. PUSH needs to create a branch, commit a file
// change, and open a PR — that genuinely requires Contents:write and Pull
// requests:write, so a purely "read-only" token (as specified for PULL)
// cannot drive PUSH; the token the user configures needs write access if
// they want the push half to work at all (documented in
// lib/integration-settings.ts's INTEGRATION_OPTIONS entry).
//
// Never commits to a base branch directly — createPullRequest always opens
// against a NEW branch created by createBranch, never main.

const GITHUB_API = "https://api.github.com";

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function githubFetch(path: string, token: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${GITHUB_API}${path}`, { ...init, headers: { ...authHeaders(token), ...(init.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GitHub API ${init.method ?? "GET"} ${path} failed (${res.status}): ${data.message ?? res.statusText}`);
  }
  return data;
}

export type GithubFile = { path: string; content: string; sha: string };

export async function getFileContent(token: string, owner: string, repo: string, path: string, ref: string): Promise<GithubFile> {
  const data = await githubFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`, token);
  if (data.encoding !== "base64" || typeof data.content !== "string") {
    throw new Error(`Unexpected content encoding for ${path}`);
  }
  return { path, content: Buffer.from(data.content, "base64").toString("utf-8"), sha: data.sha };
}

async function getBranchHeadSha(token: string, owner: string, repo: string, branch: string): Promise<string> {
  const data = await githubFetch(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  return data.object.sha as string;
}

/** Creates a new branch pointing at the current head of `fromBranch`. Returns the new branch's name. */
export async function createBranch(token: string, owner: string, repo: string, newBranch: string, fromBranch: string): Promise<string> {
  const sha = await getBranchHeadSha(token, owner, repo, fromBranch);
  await githubFetch(`/repos/${owner}/${repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
  });
  return newBranch;
}

/** Commits an updated file to `branch` (which must already exist — see createBranch). Never targets a base branch directly by convention of how this is called (see push route). */
export async function updateFile(
  token: string, owner: string, repo: string, path: string, content: string, message: string, branch: string, sha: string,
): Promise<void> {
  await githubFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, token, {
    method: "PUT",
    body: JSON.stringify({ message, content: Buffer.from(content, "utf-8").toString("base64"), branch, sha }),
  });
}

export async function createPullRequest(
  token: string, owner: string, repo: string, opts: { title: string; head: string; base: string; body: string },
): Promise<{ url: string; number: number }> {
  const data = await githubFetch(`/repos/${owner}/${repo}/pulls`, token, {
    method: "POST",
    body: JSON.stringify(opts),
  });
  return { url: data.html_url, number: data.number };
}
