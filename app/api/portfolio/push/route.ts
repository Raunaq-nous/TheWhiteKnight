import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { chatJSON, ProviderSettings } from "../../../../lib/ai-client";
import { PortfolioBuildDraftSchema, PortfolioBuildDraft } from "../../../../lib/schemas";
import { draftPortfolioBuildPrompt } from "../../../../lib/prompts";
import { insertBuildIntoSource } from "../../../../lib/portfolio-sync";
import { getFileContent, createBranch, updateFile, createPullRequest } from "../../../../lib/server/github-client";
import { PORTFOLIO_REPO } from "../../../../lib/portfolio-config";

export const runtime = "nodejs";
export const maxDuration = 60;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "entry";
}

// PUSH: draft a portfolio-shaped Build entry from CareerOS content, open a
// NEW branch, commit the change there, and open a PR against main — NEVER
// commits to main directly (see lib/server/github-client.ts). The user
// reviews and merges the PR themselves; nothing here touches the live site.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`portfolio-push:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) },
    });
  }

  try {
    const { githubToken, name, description, outcomes, stack, repoUrl, providerSettings } = await req.json() as {
      githubToken?: string;
      name: string;
      description: string;
      outcomes?: string;
      stack?: string;
      repoUrl?: string;
      providerSettings?: ProviderSettings;
    };

    if (!githubToken) return NextResponse.json({ error: "No portfolio GitHub token configured — add one in Settings." }, { status: 400 });
    if (!name || !description) return NextResponse.json({ error: "Missing name or description" }, { status: 400 });

    const draft = await chatJSON<PortfolioBuildDraft>(
      [{ role: "user", content: draftPortfolioBuildPrompt(name, description, outcomes ?? "", stack ?? "") }],
      { temperature: 0.6, maxTokens: 1200 },
      providerSettings,
      PortfolioBuildDraftSchema,
    );

    const { owner, repo, branch: base, paths } = PORTFOLIO_REPO;
    const current = await getFileContent(githubToken, owner, repo, paths.builds, base);
    const newBranch = `careeros-sync/${slugify(name)}-${Date.now().toString(36)}`;
    await createBranch(githubToken, owner, repo, newBranch, base);

    const updatedSource = insertBuildIntoSource(current.content, { ...draft, github: repoUrl ?? "" });
    await updateFile(githubToken, owner, repo, paths.builds, updatedSource, `Add: ${draft.name}`, newBranch, current.sha);

    const pr = await createPullRequest(githubToken, owner, repo, {
      title: `Add: ${draft.name}`,
      head: newBranch,
      base,
      body: `Drafted from CareerOS by the portfolio sync feature. Review the copy before merging — nothing here has touched \`${base}\` directly.\n\n**punchline:** ${draft.punchline}`,
    });

    return NextResponse.json({ pr, draft });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Portfolio push failed" }, { status: 500 });
  }
}
