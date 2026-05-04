// Exa.ai neural search client. Used for both contact discovery and job discovery.
// Docs: https://docs.exa.ai

export type ExaResult = {
  id: string;
  url: string;
  title: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  score?: number;
};

export type ExaSearchOptions = {
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  category?: "company" | "research paper" | "news" | "linkedin profile" | "github" | "tweet" | "movie" | "song" | "personal site" | "pdf";
  type?: "neural" | "keyword" | "auto";
  contents?: { text?: boolean; highlights?: boolean | { numSentences?: number; query?: string } };
};

const EXA_BASE = "https://api.exa.ai";

export async function exaSearch(
  query: string,
  apiKey: string,
  opts: ExaSearchOptions = {}
): Promise<ExaResult[]> {
  if (!apiKey) throw new Error("Exa API key missing. Add it in Settings → Integrations.");

  const body: any = {
    query,
    numResults: opts.numResults ?? 10,
    type: opts.type ?? "neural",
    contents: opts.contents ?? { text: true, highlights: { numSentences: 2 } },
  };
  if (opts.includeDomains?.length) body.includeDomains = opts.includeDomains;
  if (opts.excludeDomains?.length) body.excludeDomains = opts.excludeDomains;
  if (opts.startPublishedDate) body.startPublishedDate = opts.startPublishedDate;
  if (opts.category) body.category = opts.category;

  const res = await fetch(`${EXA_BASE}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Exa search failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.results ?? [];
}

// Search for people on LinkedIn matching company + role keywords
export async function exaPeopleSearch(
  apiKey: string,
  company: string,
  titleKeywords: string[],
  location?: string,
  numResults = 10
): Promise<ExaResult[]> {
  const titleQuery = titleKeywords.join(" OR ");
  const locClause = location ? ` ${location}` : "";
  const query = `LinkedIn profile of ${titleQuery} at ${company}${locClause}`;
  return exaSearch(query, apiKey, {
    numResults,
    includeDomains: ["linkedin.com"],
    category: "linkedin profile",
    type: "neural",
  });
}

// Search for jobs across multiple portals
export async function exaJobSearch(
  apiKey: string,
  query: string,
  domains?: string[],
  numResults = 20
): Promise<ExaResult[]> {
  return exaSearch(query, apiKey, {
    numResults,
    includeDomains: domains,
    type: "neural",
    startPublishedDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  });
}
