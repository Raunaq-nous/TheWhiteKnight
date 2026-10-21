import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// We Work Remotely public RSS feed (keyless). One GET of the all-jobs feed
// per collect(); query filter is client-side. Item titles are
// "Company: Job title". url is the WWR job page (attribution).
const USER_AGENT = "CareerOS/1.0 (personal job search tool)";

function toSnippet(html: unknown): string | undefined {
  if (typeof html !== "string" || !html) return undefined;
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || undefined;
}

const STOPWORDS = new Set(["and", "or", "the", "of", "in", "for", "a", "an", "to", "with", "at"]);

// Client-side filter: keep a job when its text contains any query word.
// No query means no filtering.
function matchesQuery(text: string, query: string | undefined): boolean {
  const words = (query ?? "").toLowerCase().split(/[^a-z0-9+#.]+/).filter(w => w.length > 1 && !STOPWORDS.has(w));
  if (words.length === 0) return true;
  const hay = text.toLowerCase();
  return words.some(w => hay.includes(w));
}

export const WWR_FEED_URL = "https://weworkremotely.com/remote-jobs.rss";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? m;
  });
}

// Text of the first <tag>...</tag> inside an item. CDATA sections are taken
// verbatim; everything outside CDATA is entity-decoded.
function readTag(item: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = re.exec(item);
  if (!m) return undefined;
  const out = m[1]
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map(part => (part.startsWith("<![CDATA[") ? part.slice(9, -3) : decodeEntities(part)))
    .join("")
    .trim();
  return out || undefined;
}

export type RssItem = { title?: string; link?: string; guid?: string; pubDate?: string; description?: string; region?: string };

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const re = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const body = m[1];
    items.push({
      title: readTag(body, "title"),
      link: readTag(body, "link"),
      guid: readTag(body, "guid"),
      pubDate: readTag(body, "pubDate"),
      description: readTag(body, "description"),
      region: readTag(body, "region"),
    });
  }
  return items;
}

function mapItem(it: RssItem): JobResult | null {
  const url = it.link ?? it.guid;
  if (!it.title || !url) return null;
  const idx = it.title.indexOf(": ");
  const company = idx > 0 ? it.title.slice(0, idx).trim() : undefined;
  const title = idx > 0 ? it.title.slice(idx + 2).trim() : it.title;
  const date = it.pubDate ? new Date(it.pubDate) : undefined;
  return {
    title,
    company,
    location: it.region,
    url,
    source: "weworkremotely",
    publishedDate: date && !Number.isNaN(date.getTime()) ? date.toISOString() : it.pubDate,
    snippet: toSnippet(it.description),
    descriptionHtml: it.description,
    externalId: it.guid,
    via: "We Work Remotely",
    remote: true,
  };
}

export const weWorkRemotelyCollector: JobCollector = {
  name: "weworkremotely",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    try {
      const res = await fetch(WWR_FEED_URL, {
        cache: "no-store",
        headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return { jobs: [], error: `We Work Remotely HTTP ${res.status}` };
      const xml = await res.text();
      if (!/<rss[\s>]|<channel[\s>]/i.test(xml)) return { jobs: [], error: "We Work Remotely: response is not an RSS feed" };
      const jobs = parseRssItems(xml)
        .map(mapItem)
        .filter((j): j is JobResult => j !== null && matchesQuery(j.title, input.query));
      return { jobs: input.numResults ? jobs.slice(0, input.numResults) : jobs };
    } catch (e: any) {
      return { jobs: [], error: `We Work Remotely fetch failed: ${e?.message ?? "unknown error"}` };
    }
  },
};
