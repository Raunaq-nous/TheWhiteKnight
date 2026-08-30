/**
 * Structural regression guard for the "selection, not rewriting" invariant
 * (lib/resume-selection.ts): a rendered resume's experience/project/key-win
 * text must always trace back to a real profile bullet id, NEVER raw
 * model-authored prose. That invariant was silently broken once already —
 * lib/server/services/draft-service.ts's "resume" branch called resumePrompt
 * + chatJSON directly and forgot resolveResumeSelections, so the automation
 * autopilot's drafted resumes rendered whatever text the model wrote,
 * unresolved. Fixed by extracting the ONE resume-generation pipeline
 * (lib/server/services/resume-generation-service.ts) and routing every
 * caller through it.
 *
 * This test enforces that structurally, not just for today's two callers:
 * ANY file that imports resumePrompt or resumeRefinePrompt (the two prompts
 * that produce a raw, model-authored ResumeContent) MUST also import
 * resolveResumeSelections in the same file — a future path that builds a
 * resume without resolving selections fails this test immediately, even if
 * nobody remembers to add it to a hardcoded list of "known" files. Modeled
 * on the existing whitelist-by-exclusion source scan in
 * automation-service.test.ts ("imports no send/submit/approve-executing
 * function").
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const REPO_ROOT = path.join(__dirname, "..", "..");
const SOURCE_DIRS = ["app", "lib", "mcp"];
const EXCLUDE_DIR_NAMES = new Set(["node_modules", ".next", "__tests__"]);
const RESUME_BUILDING_IMPORTS = ["resumePrompt", "resumeRefinePrompt"];

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out = out.concat(walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Names bound by any `import { A, B as C, ... } from "..."` statement in the file — ignores default/namespace imports, which none of the relevant modules use. */
function importedNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const line of source.split("\n")) {
    if (!/^\s*import\b/.test(line)) continue;
    const match = line.match(/import\s+(?:type\s+)?\{([^}]+)\}/);
    if (!match) continue;
    for (const raw of match[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function allSourceFiles(): string[] {
  return SOURCE_DIRS.flatMap(d => {
    const dir = path.join(REPO_ROOT, d);
    return fs.existsSync(dir) ? walk(dir) : [];
  });
}

describe("resume generation invariant: every path resolves selections (no raw model-authored resume content)", () => {
  it("every module importing resumePrompt or resumeRefinePrompt also imports resolveResumeSelections in the same file", () => {
    const offenders: string[] = [];
    for (const file of allSourceFiles()) {
      const source = fs.readFileSync(file, "utf-8");
      const names = importedNames(source);
      const buildsRawResume = RESUME_BUILDING_IMPORTS.some(n => names.has(n));
      if (!buildsRawResume) continue;
      if (!names.has("resolveResumeSelections")) {
        offenders.push(path.relative(REPO_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("sanity check: the check isn't vacuous — resumePrompt is genuinely imported somewhere (the resume-generation service)", () => {
    const importers = allSourceFiles().filter(f => importedNames(fs.readFileSync(f, "utf-8")).has("resumePrompt"));
    expect(importers.length).toBeGreaterThan(0);
  });

  it("resumePrompt is imported by exactly ONE module — the shared pipeline — proving there is only one place a resume gets built from a fresh model call", () => {
    const importers = allSourceFiles()
      .filter(f => importedNames(fs.readFileSync(f, "utf-8")).has("resumePrompt"))
      .map(f => path.relative(REPO_ROOT, f));
    expect(importers).toEqual(["lib/server/services/resume-generation-service.ts"]);
  });

  it("the shared resume-generation service itself imports both resumePrompt and resolveResumeSelections", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "lib/server/services/resume-generation-service.ts"), "utf-8");
    const names = importedNames(source);
    expect(names.has("resumePrompt")).toBe(true);
    expect(names.has("resolveResumeSelections")).toBe(true);
  });

  it("draft-service.ts (the automation autopilot path) no longer builds a resume directly — it calls the shared pipeline", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "lib/server/services/draft-service.ts"), "utf-8");
    const names = importedNames(source);
    expect(names.has("resumePrompt")).toBe(false);
    expect(names.has("generateResumeContent")).toBe(true);
  });
});
