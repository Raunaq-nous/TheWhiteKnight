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
import { workdayCollector } from "./workday";
import { workableCollector } from "./workable";
import { recruiteeCollector } from "./recruitee";
import { personioCollector } from "./personio";
import { teamtailorCollector } from "./teamtailor";
import { ripplingCollector } from "./rippling";
import { serpApiCollector } from "./serpapi";
import { jsearchCollector } from "./jsearch";
import { theirStackCollector } from "./theirstack";
import { jobsPipeCollector } from "./jobspipe";
import { remotiveCollector } from "./remotive";
import { arbeitnowCollector } from "./arbeitnow";
import { theMuseCollector } from "./themuse";
import { remoteOkCollector } from "./remoteok";
import { weWorkRemotelyCollector } from "./weworkremotely";
import { himalayasCollector } from "./himalayas";
import { jobicyCollector } from "./jobicy";
import { isRestrictedJobHost } from "../jd-fetch-service";

export type { JobResult, CollectorInput, CollectorResult, JobCollector, CompanyDomainHint } from "./types";
export { greenhouseCollector, ashbyCollector, leverCollector, smartRecruitersCollector, naukriCollector, adzunaCollector, exaPortalCollector, exaCompanyCollector };
export {
  workdayCollector, workableCollector, recruiteeCollector, personioCollector, teamtailorCollector, ripplingCollector,
  serpApiCollector, jsearchCollector, theirStackCollector, jobsPipeCollector,
  remotiveCollector, arbeitnowCollector, theMuseCollector, remoteOkCollector, weWorkRemotelyCollector, himalayasCollector, jobicyCollector,
};

// Per-company ATS platforms that have a dedicated collector implementing the
// same public-API pattern (fetch tenant's postings, map to JobResult).
// CompanyTargets whose `ats` isn't in this map (custom/workday, or naukri —
// see naukri.ts for why) fall through to the Exa company-domain search.
export const ATS_COLLECTORS: Partial<Record<string, JobCollector>> = {
  greenhouse: greenhouseCollector,
  ashby: ashbyCollector,
  lever: leverCollector,
  smartrecruiters: smartRecruitersCollector,
  workday: workdayCollector,
  workable: workableCollector,
  recruitee: recruiteeCollector,
  personio: personioCollector,
  teamtailor: teamtailorCollector,
  rippling: ripplingCollector,
};

// Google Jobs aggregators: they route to the employer's own form, so they
// rank right after company-direct boards. Keyed, budgeted.
export const GOOGLE_JOBS_COLLECTORS: { source: "serpapi" | "jsearch"; envKey: string; collector: JobCollector }[] = [
  { source: "serpapi", envKey: "SERPAPI_API_KEY", collector: serpApiCollector },
  { source: "jsearch", envKey: "JSEARCH_API_KEY", collector: jsearchCollector },
];

// Other keyed aggregators (budgeted). Adzuna is separate: it uses the
// user's own app id and key from integration settings.
export const KEYED_AGGREGATORS: { source: "theirstack" | "jobspipe"; envKey: string; collector: JobCollector }[] = [
  { source: "theirstack", envKey: "THEIRSTACK_API_KEY", collector: theirStackCollector },
  { source: "jobspipe", envKey: "JOBSPIPE_API_KEY", collector: jobsPipeCollector },
];

// Keyless remote boards: one public API/RSS call each per scan.
export const REMOTE_BOARD_COLLECTORS: JobCollector[] = [
  remotiveCollector, arbeitnowCollector, theMuseCollector, remoteOkCollector, weWorkRemotelyCollector, himalayasCollector, jobicyCollector,
];

// Portal domains Exa's neural search is scoped to per region, when scanning
// generic job portals rather than a specific company's ATS/career site.
// Naukri (naukri.com) is listed for "india" — this is currently the only
// way Naukri postings surface in scan results (see naukri.ts).
// Portals whose terms forbid automated access (LinkedIn, Naukri, Indeed,
// Glassdoor and similar) are filtered out: job-alert emails cover them.
const RAW_REGION_PORTAL_DOMAINS: Record<Region, string[]> = {
  "middle-east": ["bayt.com", "naukrigulf.com", "linkedin.com/jobs", "gulftalent.com"],
  "india": ["naukri.com", "linkedin.com/jobs", "instahyre.com", "iimjobs.com"],
  "apac": ["jobstreet.com", "seek.com", "linkedin.com/jobs", "glassdoor.sg"],
  "north-america": ["linkedin.com/jobs", "indeed.com", "glassdoor.com"],
  "europe": ["linkedin.com/jobs", "indeed.co.uk"],
  "global": ["linkedin.com/jobs"],
};

export const REGION_PORTAL_DOMAINS: Record<Region, string[]> = Object.fromEntries(
  Object.entries(RAW_REGION_PORTAL_DOMAINS).map(([r, domains]) => [r, domains.filter(d => !isRestrictedJobHost(`https://${d}`))]),
) as Record<Region, string[]>;
