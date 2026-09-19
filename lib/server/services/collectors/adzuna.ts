import "server-only";
import { adzunaSearch, REGION_TO_ADZUNA_COUNTRIES, AdzunaCountry } from "../../../adzuna-client";
import type { CollectorInput, CollectorResult, JobCollector } from "./types";

async function fetchAdzuna(input: CollectorInput): Promise<CollectorResult> {
  const { appId, appKey, query, regions = [] } = input;
  if (!appId || !appKey || !query) return { jobs: [] };

  const countries: AdzunaCountry[] = Array.from(new Set(
    regions.flatMap(r => REGION_TO_ADZUNA_COUNTRIES[r] ?? []),
  ));
  if (countries.length === 0) return { jobs: [] };

  const jobs: CollectorResult["jobs"] = [];
  for (const country of countries.slice(0, 3)) {
    try {
      const results = await adzunaSearch(appId, appKey, {
        country,
        what: query,
        resultsPerPage: 20,
        sortBy: "relevance",
        maxDaysOld: 30,
      });
      for (const j of results) {
        jobs.push({
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
          source: "adzuna",
          publishedDate: j.created,
          snippet: j.description?.slice(0, 240),
        });
      }
    } catch {
      // Skip country on failure; other countries continue.
    }
  }
  return { jobs };
}

export const adzunaCollector: JobCollector = {
  name: "adzuna",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    try {
      return await fetchAdzuna(input);
    } catch (e: any) {
      return { jobs: [], error: e?.message ?? "Adzuna fetch failed" };
    }
  },
};
