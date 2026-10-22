// Live smoke test + fixture capture for the keyless job sources (run on the
// server, which has network access; the build sandbox does not).
// For each source it makes ONE public request, reports how many jobs the
// collector mapped, and saves the raw response under
// lib/__tests__/fixtures/collectors/live/ so tests can be pointed at real
// captures. The reconstructed fixtures are left untouched.
//
// USAGE:
//   npm run capture:fixtures
//   npm run capture:fixtures -- --workday=https://acme.wd5.myworkdayjobs.com/External --workable=acme --recruitee=acme \
//     --personio=acme --teamtailor=acme --rippling=acme --greenhouse=stripe --lever=netflix --ashby=openai
// ATS boards without a slug are skipped; default slugs come from your
// default company targets where one exists.
import fs from "node:fs";
import path from "node:path";
import { ATS_COLLECTORS, REMOTE_BOARD_COLLECTORS } from "../lib/server/services/collectors";
import { DEFAULT_COMPANY_TARGETS } from "../lib/company-targets";

const OUT = path.join(process.cwd(), "lib/__tests__/fixtures/collectors/live");
const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith("--")).map(a => a.slice(2).split("=")) as [string, string][]);

// Record the raw body of every response the collectors receive.
const realFetch = globalThis.fetch;
let lastBody = "";
let lastType = "";
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await realFetch(input, init);
  lastBody = await res.clone().text();
  lastType = res.headers.get("content-type") ?? "";
  return res;
}) as typeof fetch;

function save(name: string): string {
  fs.mkdirSync(OUT, { recursive: true });
  const ext = /xml|rss/.test(lastType) || lastBody.trimStart().startsWith("<") ? (lastBody.includes("<rss") ? "rss" : "xml") : "json";
  const file = path.join(OUT, `${name}.${ext}`);
  fs.writeFileSync(file, lastBody.slice(0, 200_000));
  return path.relative(process.cwd(), file);
}

async function main() {
  const rows: string[] = [];
  for (const [ats, collector] of Object.entries(ATS_COLLECTORS)) {
    if (!collector) continue;
    const slug = args[ats] ?? DEFAULT_COMPANY_TARGETS.find(t => t.ats === ats && (t.atsTenant || ats === "workday"))?.[ats === "workday" ? "careersUrl" : "atsTenant"];
    if (!slug) { rows.push(`${ats}: SKIPPED (pass --${ats}=<slug>)`); continue; }
    lastBody = "";
    const r = await collector.collect(ats === "workday" ? { careersUrl: slug, maxPages: 1 } : { tenant: slug, companyName: slug });
    rows.push(`${ats} (${slug}): ${r.error ? `ERROR ${r.error}` : `${r.jobs.length} jobs mapped`}${lastBody ? ` -> ${save(ats)}` : ""}`);
  }
  for (const board of REMOTE_BOARD_COLLECTORS) {
    lastBody = "";
    const r = await board.collect({ query: args.query ?? "strategy" });
    rows.push(`${board.name}: ${r.error ? `ERROR ${r.error}` : `${r.jobs.length} jobs mapped`}${lastBody ? ` -> ${save(board.name)}` : ""}`);
  }
  console.log(rows.join("\n"));
  console.log("\nKeyed aggregators (SerpApi, JSearch, TheirStack, JobsPipe) are not called here: they spend budget. Check them with a manual scan.");
}

main();
