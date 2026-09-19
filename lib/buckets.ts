// Target role buckets — ONE persisted source of truth, editable at /config,
// consumed by both the ingest flow (app/ingest/page.tsx) and batch scan
// (app/batch/page.tsx via lib/batch-runner.ts), plus the scheduled
// automation service server-side. DEFAULT_BUCKETS below is only the seed
// data a brand-new install starts from — get/save go through the same
// write-through cache + server-persisted settings pattern already used for
// company targets (lib/company-targets.ts), never a second hardcoded copy.

import { TargetBucket } from "./store";
import { getCache, updateCacheBuckets, wt_saveSettings } from "./data-cache";
import { showToast } from "./toast";

export const DEFAULT_BUCKETS: TargetBucket[] = [
  {
    id: "ai-product",
    name: "AI Product",
    description: "Senior AI/ML product roles",
    titlesMatch: ["ai product manager", "agentic", "ml product", "ai product"],
    titlesExclude: ["junior", "intern"],
    sectorsPreferred: ["saas", "fintech", "ai-frontier-tech"],
    geographies: ["India", "UAE", "Remote"],
    keywordsRequired: ["ai", "ml", "llm", "agentic", "product"],
    keywordsBoost: ["agentic workflow", "rag", "multi-agent"],
    targetCompanies: ["Anthropic", "talabat", "OpenAI"],
    seniority: ["senior", "lead", "principal"],
    weight: 0.3,
  },
  {
    id: "mbb-strategy",
    name: "MBB Strategy",
    description: "Top-tier consulting",
    titlesMatch: ["engagement manager", "project leader"],
    titlesExclude: ["associate"],
    sectorsPreferred: ["energy", "financial services"],
    geographies: ["India", "UAE", "Saudi Arabia", "UK"],
    keywordsRequired: ["strategy", "consulting"],
    keywordsBoost: ["due diligence", "financial modeling"],
    targetCompanies: ["Bain", "BCG", "McKinsey"],
    seniority: ["senior", "principal"],
    weight: 0.3,
  },
  {
    id: "big-tech-strategy",
    name: "Big Tech Strategy",
    description: "Strategy & Operations roles at large tech companies",
    titlesMatch: ["strategy", "biz ops", "chief of staff", "go-to-market"],
    titlesExclude: ["junior", "associate"],
    sectorsPreferred: ["saas", "consumer-tech", "marketplace"],
    geographies: ["India", "UAE", "Singapore", "UK", "Remote"],
    keywordsRequired: ["strategy", "operations"],
    keywordsBoost: ["growth", "expansion", "new market"],
    targetCompanies: ["Google", "Meta", "Stripe", "Uber", "Airbnb"],
    seniority: ["senior", "lead", "principal"],
    weight: 0.2,
  },
  {
    id: "emerging-ai",
    name: "Emerging AI / Frontier Tech",
    description: "Early-stage AI startups, frontier model companies, applied research labs",
    titlesMatch: ["forward deployed", "solutions architect", "ai engineer", "applied ai", "ai transformation"],
    titlesExclude: ["intern"],
    sectorsPreferred: ["ai-frontier-tech", "ai-applied"],
    geographies: ["UAE", "India", "Singapore", "UK", "Remote"],
    keywordsRequired: ["ai", "llm", "agent"],
    keywordsBoost: ["frontier", "research", "alignment", "rag", "evaluation"],
    targetCompanies: ["Anthropic", "OpenAI", "Cohere", "Mistral", "G42"],
    seniority: ["senior", "lead", "staff"],
    weight: 0.2,
  },
];

/** Falls back to DEFAULT_BUCKETS only when nothing has ever been saved (fresh install) — same convention as getCompanyTargets(). */
export function getBuckets(): TargetBucket[] {
  const cached = getCache().buckets;
  return cached.length > 0 ? cached : DEFAULT_BUCKETS;
}

export async function saveBuckets(buckets: TargetBucket[]): Promise<boolean> {
  updateCacheBuckets(buckets);
  try {
    await wt_saveSettings("buckets", buckets);
    return true;
  } catch (e: any) {
    console.error("[CareerOS] saveBuckets failed:", e);
    showToast(e?.message ?? "Failed to save target buckets", "error");
    return false;
  }
}

export function resetBuckets(): Promise<boolean> {
  return saveBuckets(DEFAULT_BUCKETS);
}
