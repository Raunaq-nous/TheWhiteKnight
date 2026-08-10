import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { getFileContent } from "../../../../lib/server/github-client";
import { parseExportedArray, parseExportedObject } from "../../../../lib/portfolio-parser";
import { buildPortfolioCandidates } from "../../../../lib/portfolio-sync";
import { diffExtractionAgainstProfile } from "../../../../lib/profile-merge";
import { PORTFOLIO_REPO } from "../../../../lib/portfolio-config";
import type { Profile } from "../../../../lib/profile";

export const runtime = "nodejs";
export const maxDuration = 30;

// PULL: fetch builds.ts/battles.ts from the portfolio repo's main branch
// (read-only token is enough for this half — see lib/server/github-client.ts),
// parse them deterministically (no code execution — lib/portfolio-parser.ts),
// map per the mapping table (lib/portfolio-sync.ts, including the "never
// overwrite an already-quantified field" guard), and diff against the
// current profile through the SAME non-destructive merge engine Features
// 1/3 already use. The client reviews the result with the existing
// ProfileMergeReview UI — nothing here applies anything.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`portfolio-pull:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSecs) },
    });
  }

  try {
    const { profile, githubToken } = await req.json() as { profile: Profile; githubToken?: string };
    if (!profile) return NextResponse.json({ error: "Missing profile" }, { status: 400 });
    if (!githubToken) return NextResponse.json({ error: "No portfolio GitHub token configured — add one in Settings." }, { status: 400 });

    const { owner, repo, branch, paths } = PORTFOLIO_REPO;
    const [buildsFile, battlesFile] = await Promise.all([
      getFileContent(githubToken, owner, repo, paths.builds, branch),
      getFileContent(githubToken, owner, repo, paths.battles, branch),
    ]);

    const builds = parseExportedArray(buildsFile.content, "builds");
    const battles = parseExportedArray(battlesFile.content, "battles");
    const education = parseExportedObject(battlesFile.content, "education") ?? parseExportedArray(battlesFile.content, "education");

    const candidates = buildPortfolioCandidates(builds, battles, education, profile);
    const items = diffExtractionAgainstProfile(
      { experience: candidates.experience, education: candidates.education, projects: candidates.projects },
      profile,
    );

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Portfolio pull failed" }, { status: 500 });
  }
}
