import "server-only";
import { exaJobSearch } from "../../../exa-client";
import type { CollectorInput, CollectorResult, JobCollector } from "./types";

// Exa neural search across job portal domains (e.g. LinkedIn, Naukri,
// Bayt, Indeed...) — not tied to a single company.
export const exaPortalCollector: JobCollector = {
  name: "exa-portal",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    const { apiKey, query, domains, numResults = 30 } = input;
    if (!apiKey || !query) return { jobs: [] };
    try {
      const results = await exaJobSearch(apiKey, query, domains, Math.min(numResults, 30));
      return {
        jobs: results.map(r => ({
          title: r.title,
          url: r.url,
          source: "exa-portal" as const,
          publishedDate: r.publishedDate,
          snippet: r.highlights?.[0] ?? r.text?.slice(0, 200),
        })),
      };
    } catch (e: any) {
      return { jobs: [], error: e?.message ?? "Exa portal search failed" };
    }
  },
};

// Exa neural search scoped to specific company career-site domains (used
// for CompanyTargets whose ATS isn't one we have a dedicated collector for,
// e.g. "custom" or "workday").
export const exaCompanyCollector: JobCollector = {
  name: "exa-company",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    const { apiKey, query, domains, numResults = 30, companyLookup = [] } = input;
    if (!apiKey || !query || !domains || domains.length === 0) return { jobs: [] };
    try {
      const results = await exaJobSearch(apiKey, query, domains, Math.min(numResults, 30));
      return {
        jobs: results.map(r => {
          const matched = companyLookup.find(c => r.url.includes(c.hostname));
          return {
            title: r.title,
            company: matched?.name,
            url: r.url,
            source: "exa-company" as const,
            publishedDate: r.publishedDate,
            snippet: r.highlights?.[0] ?? r.text?.slice(0, 200),
          };
        }),
      };
    } catch (e: any) {
      return { jobs: [], error: e?.message ?? "Exa company search failed" };
    }
  },
};
