// Validates every configured model id on the server (needs network):
//   - each OpenRouter chain id (defaults or the Settings edits) against
//     https://openrouter.ai/api/v1/models
//   - each Together model with a 1-token serverless probe
// Exits 1 when any id is unknown or any Together model is not serverless.
// Prints key presence only, never key values.
//
// USAGE: npm run check:models
import "../lib/server/gateway-store";
import { probeModels } from "../lib/server/services/model-health";

async function main() {
  const r = await probeModels({ force: true });
  console.log(`keys: OPENROUTER_API_KEY ${r.keys.openrouter ? "set" : "MISSING"}, TOGETHER_API_KEY ${r.keys.together ? "set" : "MISSING"}`);
  console.log(`\nOpenRouter model list reachable: ${r.openrouter.listReachable}${r.openrouter.listError ? ` (${r.openrouter.listError})` : ""}`);
  for (const c of r.openrouter.chains) console.log(`  [${c.chain}] ${c.model}: ${c.listed === null ? "UNCHECKED" : c.listed ? "ok" : "UNKNOWN ID"}`);
  console.log(`\nTogether:`);
  for (const m of r.together.models) console.log(`  ${m.model}: ${m.status}${m.httpStatus ? ` (HTTP ${m.httpStatus}${m.code ? ` ${m.code}` : ""})` : ""} used for ${m.usedFor.join(", ")}`);
  if (r.openrouter.unknownIds.length) console.log(`\nUNKNOWN OpenRouter ids (fix in Settings > Model gateway or config/model-chains.json): ${r.openrouter.unknownIds.join(", ")}`);
  if (r.together.nonServerlessModels.length) console.log(`\nNOT SERVERLESS on Together: ${r.together.nonServerlessModels.join(", ")}`);
  console.log(`\n${r.ok ? "OK" : "PROBLEMS FOUND"}`);
  process.exit(r.ok ? 0 : 1);
}

main();
