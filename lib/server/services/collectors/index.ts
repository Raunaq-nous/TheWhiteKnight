import "server-only";
import type { Region } from "../../../company-targets";
import type { JobCollector } from "./types";
import { greenhouseCollector } from "./greenhouse";
import { ashbyCollector } from "./ashby";
import { leverCollector } from "./lever";
import { smartRecruitersCollector } from "./smartrecruiters";
import { naukriCollector } from "./naukri";
import { adzunaCollector } from "./adzuna";
import { exaPortalCollector, exaCompanyCollector } from "./exa";

export type { JobResult, CollectorInput, CollectorResult, JobCollector, CompanyDomainHint } from "./types";
export { greenhouseCollector, ashbyCollector, leverCollector, smartRecruitersCollector, naukriCollector, adzunaCollector, exaPortalCollector, exaCompanyCollector };

// Per-company ATS platforms that have a dedicated collector implementing the
// same public-API pattern (fetch tenant's postings, map to JobResult).
// CompanyTargets whose `ats` isn't in this map (custom/workday, or naukri —
// see naukri.ts for why) fall through to the Exa company-domain search.
export const ATS_COLLECTORS: Partial<Record<string, JobCollector>> = {
  greenhouse: greenhouseCollector,
  ashby: ashbyCollector,
  lever: leverCollector,
  smartrecruiters: smartRecruitersCollector,
};

// Portal domains Exa's neural search is scoped to per region, when scanning
// generic job portals rather than a specific company's ATS/career site.
// Naukri (naukri.com) is listed for "india" — this is currently the only
// way Naukri postings surface in scan results (see naukri.ts).
export const REGION_PORTAL_DOMAINS: Record<Region, string[]> = {
  "middle-east": ["bayt.com", "naukrigulf.com", "linkedin.com/jobs", "gulftalent.com"],
  "india": ["naukri.com", "linkedin.com/jobs", "instahyre.com", "iimjobs.com"],
  "apac": ["jobstreet.com", "seek.com", "linkedin.com/jobs", "glassdoor.sg"],
  "north-america": ["linkedin.com/jobs", "indeed.com", "glassdoor.com"],
  "europe": ["linkedin.com/jobs", "indeed.co.uk"],
  "global": ["linkedin.com/jobs"],
};
