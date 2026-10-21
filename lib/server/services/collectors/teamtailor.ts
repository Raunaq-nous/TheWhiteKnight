import "server-only";
import type { CollectorInput, CollectorResult, JobCollector, JobResult } from "./types";

// Public Teamtailor careers-site RSS feed. No key required. Parsed with a
// small regex-based reader: the feed is untrusted data, never executed.

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      try { return Number.isFinite(code) ? String.fromCodePoint(code) : m; } catch { return m; }
    }
    return NAMED[ent.toLowerCase()] ?? m;
  });
}

// Text content of an XML node: CDATA sections are taken verbatim, the rest
// is entity-decoded.
export function xmlText(raw: string): string {
  let out = "";
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out += decodeEntities(raw.slice(last, m.index)) + m[1];
    last = m.index + m[0].length;
  }
  out += decodeEntities(raw.slice(last));
  return out.trim();
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function xmlTagRaw(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${esc(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(tag)}>`, "i"));
  return m ? m[1] : undefined;
}

export function xmlTag(block: string, tag: string): string | undefined {
  const raw = xmlTagRaw(block, tag);
  if (raw === undefined) return undefined;
  const t = xmlText(raw);
  return t || undefined;
}

export function xmlAll(block: string, tag: string): string[] {
  const re = new RegExp(`<${esc(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(tag)}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}

function parseLocations(item: string): string | undefined {
  const container = xmlTagRaw(item, "tt:locations") ?? xmlTagRaw(item, "locations");
  const blocks = container !== undefined
    ? [...xmlAll(container, "tt:location"), ...xmlAll(container, "location")]
    : [...xmlAll(item, "tt:location"), ...xmlAll(item, "location")];
  const names: string[] = [];
  for (const b of blocks) {
    let name: string | undefined;
    if (/</.test(b.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, ""))) {
      const city = xmlTag(b, "tt:city") ?? xmlTag(b, "city");
      const country = xmlTag(b, "tt:country") ?? xmlTag(b, "country");
      name = [city, country].filter(Boolean).join(", ") || xmlTag(b, "tt:name") || xmlTag(b, "name");
    } else {
      name = xmlText(b) || undefined;
    }
    if (name && !names.includes(name)) names.push(name);
  }
  return names.length ? names.join("; ") : undefined;
}

export function parseTeamtailorRss(xml: string): Array<Omit<JobResult, "company" | "source">> | null {
  if (typeof xml !== "string" || !/<rss[\s>]|<channel[\s>]/i.test(xml)) return null;
  const items = xmlAll(xml, "item");
  const out: Array<Omit<JobResult, "company" | "source">> = [];
  for (const item of items) {
    const title = xmlTag(item, "title");
    const link = xmlTag(item, "link");
    if (!title || !link) continue;
    const job: Omit<JobResult, "company" | "source"> = { title, url: link };
    const guid = xmlTag(item, "guid");
    job.externalId = guid ?? link;
    const pub = xmlTag(item, "pubDate");
    if (pub) {
      const d = new Date(pub);
      job.publishedDate = Number.isNaN(d.getTime()) ? pub : d.toISOString();
    }
    const desc = xmlTag(item, "description");
    if (desc) job.descriptionHtml = desc;
    const loc = parseLocations(item);
    if (loc) job.location = loc;
    const remoteStatus = xmlTag(item, "tt:remote-status") ?? xmlTag(item, "remoteStatus") ?? xmlTag(item, "remote-status");
    if (remoteStatus) job.remote = /^(fully|remote)/i.test(remoteStatus);
    else if (loc && /remote/i.test(loc)) job.remote = true;
    out.push(job);
  }
  return out;
}

async function fetchTeamtailor(slug: string, company: string): Promise<CollectorResult> {
  try {
    const res = await fetch(`https://${encodeURIComponent(slug)}.teamtailor.com/jobs.rss`, { cache: "no-store" });
    if (!res.ok) return { jobs: [], error: `Teamtailor HTTP ${res.status ?? "error"}` };
    const parsed = parseTeamtailorRss(await res.text());
    if (!parsed) return { jobs: [], error: "Teamtailor: malformed RSS" };
    return {
      jobs: parsed.map((j) => ({ ...j, company, source: "teamtailor" as const })),
    };
  } catch (e: any) {
    return { jobs: [], error: e?.message ?? "Teamtailor fetch failed" };
  }
}

export const teamtailorCollector: JobCollector = {
  name: "teamtailor",
  async collect(input: CollectorInput): Promise<CollectorResult> {
    if (!input.tenant) return { jobs: [] };
    return fetchTeamtailor(input.tenant, input.companyName ?? input.tenant);
  },
};
