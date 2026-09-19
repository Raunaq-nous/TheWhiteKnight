import "server-only";
import type { CollectorInput, CollectorResult, JobCollector } from "./types";

// FINDING (researched, not guessed): Naukri.com has no public, unauthenticated,
// per-company postings API comparable to Greenhouse/Ashby/Lever/SmartRecruiters.
// Its listings are served through internal, undocumented endpoints used by its
// own web/app clients, gated behind anti-bot measures, and not intended for
// third-party consumption — the only "collector" pattern seen in the wild
// (e.g. the algsoch/job_agentic reference repo's collectors/naukri.py) is an
// HTML/browser scraper, not an API client. Per this repo's hard rule #6
// (scraped content is untrusted data, never a trusted structured source) and
// the general no-fake-integration instruction, this collector does NOT scrape
// naukri.com. It fails cleanly with a reason instead.
//
// Naukri IS already covered indirectly today: scan-service.ts's
// REGION_PORTAL_DOMAINS lists "naukri.com" as one of the Exa portal-search
// domains for the "india" region, so India-region scans already surface
// Naukri postings via Exa's neural search (source: "exa-portal"). This
// collector exists to make that fact explicit and queryable, and as the
// landing spot if a real API/partnership becomes available later.
export const naukriCollector: JobCollector = {
  name: "naukri",
  async collect(_input: CollectorInput): Promise<CollectorResult> {
    return {
      jobs: [],
      error: "No public unauthenticated per-company API is available for Naukri; covered indirectly via Exa portal search (naukri.com) for the india region.",
    };
  },
};
