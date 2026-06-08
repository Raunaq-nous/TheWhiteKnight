/**
 * scripts/verify-runtime.ts — Phase 3 runtime verification checkpoint.
 *
 * Run:  npx tsx scripts/verify-runtime.ts
 *
 * No Upstash, no LLM, no browser required.
 * Uses a fresh temp dir for the DB; never touches the real private/ data.
 * Exits non-zero if any check fails.
 */

import os from "os";
import fs from "fs";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ---------------------------------------------------------------------------
// Pass/fail harness
// ---------------------------------------------------------------------------
let allPassed = true;
const results: { label: string; passed: boolean; detail?: string }[] = [];

function pass(label: string) {
  results.push({ label, passed: true });
  console.log(`  PASS  ${label}`);
}

function fail(label: string, detail: string) {
  allPassed = false;
  results.push({ label, passed: false, detail });
  console.log(`  FAIL  ${label}`);
  console.log(`        ${detail}`);
}

function check(label: string, condition: boolean, failDetail: string) {
  condition ? pass(label) : fail(label, failDetail);
}

async function main() {
  // -------------------------------------------------------------------------
  // Temp dir — set env vars before any lazy getDb() call.
  // -------------------------------------------------------------------------
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "careeros-verify-"));
  const tmpDb = path.join(tmpDir, "verify.db");
  const ADMIN_EMAIL = "admin@verify.local";

  process.env.CAREEROS_DB_PATH = tmpDb;
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.CAREEROS_PRIVATE_DIR = tmpDir;
  // Prevent mcp/server.ts from calling main() if it were imported directly.
  process.env.NODE_ENV = "test";

  // Lazy imports — after env vars are set so getDb() picks up the right path.
  const { _resetDbForTesting } = await import("../lib/server/db");
  const { applicationRepo } = await import("../lib/server/repositories/application-repo");
  const { approvalRepo } = await import("../lib/server/repositories/approval-repo");
  const { profileRepo } = await import("../lib/server/repositories/profile-repo");
  const { resolveApproval } = await import("../lib/server/approval-gate");

  // -------------------------------------------------------------------------
  // SECTION 1 — MCP gate over the real stdio transport
  // -------------------------------------------------------------------------
  console.log("\n=== Section 1: MCP gate over stdio transport ===\n");

  // Seed a minimal application so recordSend has something to write emailEvents onto.
  const testApp = {
    id: "test-app-1",
    slug: "acme-engineer",
    company: "Acme",
    role: "Engineer",
    location: "Remote",
    remote: true,
    status: "sourced" as const,
    score: 0,
    bucket: "",
    sector: "tech",
    seniority: "mid",
    sourceUrl: "",
    capturedAt: new Date().toISOString(),
    jdRaw: "test jd",
    jdParsed: null,
    nextAction: "",
    contacts: [],
    interviews: [],
    reminders: [],
    resumeVersions: [],
    notes: "",
    emailEvents: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  applicationRepo.save(ADMIN_EMAIL, testApp);

  // Spawn the MCP server — NODE_ENV intentionally absent so main() fires.
  const projectRoot = path.resolve(__dirname, "..");
  const tsxBin = path.join(projectRoot, "node_modules", ".bin", "tsx");
  const transport = new StdioClientTransport({
    command: tsxBin,
    args: ["--tsconfig", "mcp/tsconfig.json", "mcp/server.ts"],
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      CAREEROS_DB_PATH: tmpDb,
      ADMIN_EMAIL,
    },
    cwd: projectRoot,
    stderr: "pipe",
  });

  const client = new Client({ name: "verify-client", version: "0.0.1" }, {});

  try {
    await client.connect(transport);

    // 1a. listTools — 9 expected tools, none forbidden
    const { tools } = await client.listTools();
    const toolNames = tools.map((t: any) => t.name);
    const expectedTools = [
      "listPipeline", "findJobs", "updateStatus", "scoreApplication",
      "draftMaterials", "queueApproval", "getApprovals", "recordSend", "scheduleFollowUp",
    ];
    check(
      "listTools: all 9 expected tools present",
      expectedTools.every(n => toolNames.includes(n)),
      `Missing: ${expectedTools.filter(n => !toolNames.includes(n)).join(", ")}. Got: ${toolNames.join(", ")}`,
    );
    const forbidden = toolNames.filter((n: string) =>
      n.toLowerCase().includes("resolve") ||
      n.toLowerCase().includes("approve") ||
      n.toLowerCase().includes("token") ||
      n.toLowerCase().includes("mint"),
    );
    check(
      "listTools: no resolve/approve/token/mint tool exposed",
      forbidden.length === 0,
      `Forbidden tools found: ${forbidden.join(", ")}`,
    );

    // 1b. queueApproval — stages, returns approvalId, row is pending
    const queueResult = await client.callTool({
      name: "queueApproval",
      arguments: { kind: "recordSend", applicationId: "test-app-1", payload: { channel: "email" } },
    });
    const queueText = (queueResult.content as any[])[0]?.text ?? "";
    const queueJson = JSON.parse(queueText) as { staged: boolean; approvalId: string };
    check("queueApproval: returns staged:true", queueJson.staged === true, `Got: ${queueText}`);
    check(
      "queueApproval: approvalId is a non-empty string",
      typeof queueJson.approvalId === "string" && queueJson.approvalId.length > 0,
      `Got approvalId: ${queueJson.approvalId}`,
    );
    const pendingRow = approvalRepo.get(ADMIN_EMAIL, queueJson.approvalId);
    check(
      "queueApproval: pending row exists in DB with status=pending",
      pendingRow?.status === "pending",
      `Row: ${JSON.stringify(pendingRow)}`,
    );

    // 1c. recordSend WITHOUT token — staged, no emailEvent written
    const noTokenResult = await client.callTool({
      name: "recordSend",
      arguments: { applicationId: "test-app-1", channel: "email", payload: { to: "recruiter@acme.com" } },
    });
    const noTokenText = (noTokenResult.content as any[])[0]?.text ?? "";
    const noTokenJson = JSON.parse(noTokenText) as { staged: boolean };
    check("recordSend without token: returns staged:true", noTokenJson.staged === true, `Got: ${noTokenText}`);
    const appAfterNoToken = applicationRepo.getById(ADMIN_EMAIL, "test-app-1");
    check(
      "recordSend without token: no emailEvent written",
      (appAfterNoToken?.emailEvents ?? []).length === 0,
      `emailEvents: ${JSON.stringify(appAfterNoToken?.emailEvents)}`,
    );

    // 1d. Mint a token directly — simulates the human-only JWT route.
    //     resolveApproval runs in-process against the same SQLite file (WAL allows concurrent access).
    const stagedId = approvalRepo.create(ADMIN_EMAIL, { kind: "recordSend", applicationId: "test-app-1" });
    const resolved = resolveApproval(ADMIN_EMAIL, stagedId, "approve");
    check(
      "resolveApproval (direct, simulating JWT route): returns a token",
      typeof resolved?.token === "string" && (resolved?.token?.length ?? 0) > 0,
      `resolved: ${JSON.stringify(resolved)}`,
    );
    const token = resolved!.token!;

    // 1e. recordSend WITH valid token — executed, emailEvent written
    const withTokenResult = await client.callTool({
      name: "recordSend",
      arguments: {
        applicationId: "test-app-1",
        channel: "email",
        payload: { to: "recruiter@acme.com" },
        approvalToken: token,
      },
    });
    const withTokenText = (withTokenResult.content as any[])[0]?.text ?? "";
    const withTokenJson = JSON.parse(withTokenText) as { executed?: boolean; staged?: boolean };
    check("recordSend with valid token: returns executed:true", withTokenJson.executed === true, `Got: ${withTokenText}`);

    // Give WAL checkpoint a moment to flush so our read sees the write.
    await new Promise(r => setTimeout(r, 100));
    _resetDbForTesting(); // force fresh DB handle so we read the MCP server's committed write
    const appAfterSend = applicationRepo.getById(ADMIN_EMAIL, "test-app-1");
    check(
      "recordSend with valid token: emailEvent written to DB",
      (appAfterSend?.emailEvents ?? []).length > 0,
      `emailEvents: ${JSON.stringify(appAfterSend?.emailEvents)}`,
    );

    // 1f. Replay same token — single-use enforced
    const replayResult = await client.callTool({
      name: "recordSend",
      arguments: {
        applicationId: "test-app-1",
        channel: "email",
        payload: { to: "recruiter@acme.com" },
        approvalToken: token,
      },
    });
    const replayText = (replayResult.content as any[])[0]?.text ?? "";
    const replayJson = JSON.parse(replayText) as { staged?: boolean; executed?: boolean };
    check(
      "recordSend with replayed token: staged:true (single-use enforced)",
      replayJson.staged === true,
      `Got: ${replayText}`,
    );

  } catch (e: any) {
    fail("MCP section: unexpected error", e?.message ?? String(e));
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }

  // -------------------------------------------------------------------------
  // SECTION 2 — SQLite durability across a process restart
  // -------------------------------------------------------------------------
  console.log("\n=== Section 2: SQLite durability across connection restart ===\n");

  try {
    // Switch to a fresh DB file so this section is independent of section 1.
    const durDb = path.join(tmpDir, "dur.db");
    process.env.CAREEROS_DB_PATH = durDb;
    _resetDbForTesting();

    const durApp = {
      id: "dur-app-1",
      slug: "durability-test",
      company: "DurCo",
      role: "Tester",
      location: "On-site",
      remote: false,
      status: "applied" as const,
      score: 7.5,
      bucket: "consulting",
      sector: "tech",
      seniority: "senior",
      sourceUrl: "https://example.com",
      capturedAt: new Date().toISOString(),
      jdRaw: "durability jd text",
      jdParsed: { keyRequirements: ["resilience"] },
      nextAction: "wait",
      contacts: [],
      interviews: [],
      reminders: [],
      resumeVersions: [],
      notes: "durable",
      emailEvents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    applicationRepo.save(ADMIN_EMAIL, durApp);

    // Close the DB connection entirely.
    _resetDbForTesting();

    // Re-open by making a new DB call (getDb() is lazy — next call reopens).
    const retrieved = applicationRepo.getById(ADMIN_EMAIL, "dur-app-1");

    check("Durability: application survives connection close+reopen", retrieved?.id === "dur-app-1", `Retrieved: ${JSON.stringify(retrieved)}`);
    check("Durability: score field preserved", retrieved?.score === 7.5, `score: ${retrieved?.score}`);
    check(
      "Durability: jdParsed JSON preserved",
      JSON.stringify(retrieved?.jdParsed) === JSON.stringify({ keyRequirements: ["resilience"] }),
      `jdParsed: ${JSON.stringify(retrieved?.jdParsed)}`,
    );
    check("Durability: notes field preserved", retrieved?.notes === "durable", `notes: ${retrieved?.notes}`);
  } catch (e: any) {
    fail("Durability section: unexpected error", e?.message ?? String(e));
  }

  // -------------------------------------------------------------------------
  // SECTION 3 — Admin seed
  // -------------------------------------------------------------------------
  console.log("\n=== Section 3: Admin seed ===\n");

  try {
    const seedDb = path.join(tmpDir, "seed.db");
    process.env.CAREEROS_DB_PATH = seedDb;
    process.env.CAREEROS_PRIVATE_DIR = tmpDir; // admin-profile.json is in tmpDir
    _resetDbForTesting();

    const seedProfile = {
      name: "Admin Tester",
      email: ADMIN_EMAIL,
      phone: "+1-555-0000",
      location: "Dubai",
      linkedin: "",
      website: "",
      tagline: "Verifying things",
      northStar: "Consult",
      targetRoles: ["Analyst"],
      targetSectors: [],
      targetRegions: [],
      experience: [],
      education: [],
      projects: [],
      publications: [],
      certifications: [],
      languages: [],
      skills: [],
      toolsAndPlatforms: [],
      keywords: [],
      honorsAwards: [],
      volunteerWork: [],
      references: [],
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(tmpDir, "admin-profile.json"), JSON.stringify(seedProfile, null, 2));

    // ADMIN_EMAIL user — seedIfEmpty should populate from admin-profile.json.
    profileRepo.seedIfEmpty(ADMIN_EMAIL, ADMIN_EMAIL);
    const adminProfile = profileRepo.get(ADMIN_EMAIL);
    check(
      "Admin seed: ADMIN_EMAIL user gets populated profile",
      adminProfile?.name === "Admin Tester",
      `Got: ${JSON.stringify(adminProfile)}`,
    );

    // Different user — seedIfEmpty does nothing (not admin).
    profileRepo.seedIfEmpty("other@verify.local", ADMIN_EMAIL);
    const otherProfile = profileRepo.get("other@verify.local");
    check(
      "Admin seed: different user gets blank (null) profile",
      otherProfile === null,
      `Got: ${JSON.stringify(otherProfile)}`,
    );
  } catch (e: any) {
    fail("Seed section: unexpected error", e?.message ?? String(e));
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n${"=".repeat(52)}`);
  console.log(`${allPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"} — ${passed}/${total}`);
  console.log("=".repeat(52));

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error("Verify script fatal error:", err);
  process.exit(1);
});
