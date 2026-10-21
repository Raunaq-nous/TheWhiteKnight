// JOB-ALERT EMAILS. Parses alert emails from LinkedIn, Naukri, iimjobs,
// Instahyre, Cutshort, Wellfound, Bayt, GulfTalent and Naukrigulf into
// {title, company, location, portal URL}. Pure and deterministic: email
// content is inert data, only scanned with regexes, never interpreted, never
// sent to a model, and never able to change behaviour.
//
// Fetch policy per portal (ASSUMPTION, safest default): every listed portal
// is "lookup-only" because their terms forbid automated access. The portal
// URL is never fetched; the job is looked up on the company's own careers
// board instead. A link in the email that already points at a company ATS
// (greenhouse, lever, workday...) is ingested directly.

import { isCompanyDirectUrl } from "./job-dedupe";

export type AlertPortal = {
  id: string;
  label: string;
  senderDomains: string[];
  jobUrl: RegExp;
  policy: "lookup-only" | "ingest-url";
};

export const ALERT_PORTALS: AlertPortal[] = [
  { id: "linkedin", label: "LinkedIn", senderDomains: ["linkedin.com"], jobUrl: /linkedin\.com\/(?:comm\/)?jobs\/view\/\d+/i, policy: "lookup-only" },
  { id: "naukri", label: "Naukri", senderDomains: ["naukri.com"], jobUrl: /naukri\.com\/(?:job-listings-|.*?-jobs?-)[^\s"'<>]+/i, policy: "lookup-only" },
  { id: "iimjobs", label: "iimjobs", senderDomains: ["iimjobs.com"], jobUrl: /iimjobs\.com\/j\/[^\s"'<>]+/i, policy: "lookup-only" },
  { id: "instahyre", label: "Instahyre", senderDomains: ["instahyre.com"], jobUrl: /instahyre\.com\/job-[^\s"'<>]+/i, policy: "lookup-only" },
  { id: "cutshort", label: "Cutshort", senderDomains: ["cutshort.io"], jobUrl: /cutshort\.io\/job\/[^\s"'<>]+/i, policy: "lookup-only" },
  { id: "wellfound", label: "Wellfound", senderDomains: ["wellfound.com", "angel.co"], jobUrl: /(?:wellfound\.com|angel\.co)\/(?:company\/[^/\s"'<>]+\/)?jobs\/[^\s"'<>]+/i, policy: "lookup-only" },
  { id: "bayt", label: "Bayt", senderDomains: ["bayt.com"], jobUrl: /bayt\.com\/[a-z]{2}\/[^\s"'<>]*\/jobs\/[^\s"'<>]+/i, policy: "lookup-only" },
  { id: "gulftalent", label: "GulfTalent", senderDomains: ["gulftalent.com"], jobUrl: /gulftalent\.com\/[^\s"'<>]*jobs?\/[^\s"'<>]+/i, policy: "lookup-only" },
  { id: "naukrigulf", label: "Naukrigulf", senderDomains: ["naukrigulf.com"], jobUrl: /naukrigulf\.com\/[^\s"'<>]*-jid-\d+[^\s"'<>]*/i, policy: "lookup-only" },
];

export type AlertEmail = { from: string; subject?: string; html?: string; text?: string; receivedAt?: string; messageId?: string };

export type AlertJob = {
  portal: string;
  title: string;
  company: string;
  location?: string;
  // The portal's job URL: recorded, never fetched for lookup-only portals.
  portalUrl?: string;
  // A company-direct URL found in the email, ingested directly.
  directUrl?: string;
  receivedAt?: string;
};

export function portalForSender(from: string): AlertPortal | null {
  const addr = (from.match(/<([^>]+)>/)?.[1] ?? from).toLowerCase();
  const domain = addr.split("@")[1] ?? addr;
  return ALERT_PORTALS.find(p => p.senderDomains.some(d => domain === d || domain.endsWith(`.${d}`))) ?? null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", bull: "•", ndash: "-", mdash: "-", rsquo: "'", lsquo: "'" };
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Inert, bounded text: no control characters, collapsed whitespace, max 200 chars. */
function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return decodeEntities(s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

type Token = { kind: "a"; href: string; text: string } | { kind: "text"; text: string };

/** HTML to an ordered list of anchors and text runs. Scripts and styles are dropped, nothing is executed. */
export function tokenizeHtml(html: string): Token[] {
  const body = html.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const tokens: Token[] = [];
  const re = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>|<[^>]+>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[2] !== undefined) {
      tokens.push({ kind: "a", href: decodeEntities(m[2]), text: clean(m[3].replace(/<[^>]+>/g, " ")) });
    } else if (m[4] !== undefined) {
      const t = clean(m[4]);
      if (t) tokens.push({ kind: "text", text: t });
    } else if (/^<(br|\/p|\/div|\/td|\/tr|\/li|\/h\d)/i.test(m[0])) {
      tokens.push({ kind: "text", text: "" }); // a line break
    }
  }
  return tokens;
}

const GENERIC_LINK = /^(view( job| details)?|apply( now)?|see (all|more)( jobs)?|easy apply|more jobs|unsubscribe|manage alerts?|\s*)$/i;
const SEPARATORS = /\s+(?:·|•|\||-|–)\s+/;

function companyAndLocation(lines: string[]): { company: string; location?: string } | null {
  const first = lines[0];
  if (!first) return null;
  if (SEPARATORS.test(first)) {
    const [company, ...rest] = first.split(SEPARATORS);
    return { company: company.trim(), location: rest.join(", ").trim() || lines[1] };
  }
  return { company: first, location: lines[1] };
}

/** The jobs in one alert email. Non-alert senders return []. */
export function parseAlertEmail(email: AlertEmail): AlertJob[] {
  const portal = portalForSender(email.from);
  if (!portal) return [];
  const out: AlertJob[] = [];
  const seen = new Set<string>();

  if (email.html) {
    const tokens = tokenizeHtml(email.html);
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.kind !== "a") continue;
      const portalMatch = t.href.match(portal.jobUrl);
      const direct = !portalMatch && /^https?:/i.test(t.href) && isCompanyDirectUrl(t.href) && /greenhouse|lever|ashbyhq|myworkdayjobs|smartrecruiters|workable|recruitee|personio|teamtailor|rippling/i.test(t.href);
      if (!portalMatch && !direct) continue;
      // Title: the link text, or (for "View job" links) the text just before it.
      let title = t.text;
      if (GENERIC_LINK.test(title)) {
        const prev = [...tokens.slice(Math.max(0, i - 4), i)].reverse().find(x => x.kind === "text" && x.text);
        title = prev?.text ?? "";
      }
      if (!title || GENERIC_LINK.test(title)) continue;
      // Company and location: the next non-empty text runs before the next link.
      const following: string[] = [];
      for (let k = i + 1; k < tokens.length && following.length < 3; k++) {
        const n = tokens[k];
        if (n.kind === "a" && (n.href.match(portal.jobUrl) || !GENERIC_LINK.test(n.text))) break;
        if (n.kind === "text" && n.text && n.text !== title) following.push(n.text);
      }
      const cl = companyAndLocation(following);
      if (!cl?.company) continue;
      const key = `${title}|${cl.company}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        portal: portal.id, title: clean(title), company: clean(cl.company), ...(cl.location ? { location: clean(cl.location) } : {}),
        ...(portalMatch ? { portalUrl: `https://${portalMatch[0].replace(/^https?:\/\//i, "")}` } : { directUrl: t.href }),
        ...(email.receivedAt ? { receivedAt: email.receivedAt } : {}),
      });
    }
  }

  // Plain-text alerts: "Title at Company - Location" lines.
  if (!out.length && email.text) {
    for (const line of email.text.split(/\r?\n/)) {
      const m = line.match(/^\s*(.{3,120}?)\s+at\s+(.{2,80}?)(?:\s+(?:-|–|\||·)\s+(.{2,80}))?\s*$/);
      if (!m) continue;
      const key = `${m[1]}|${m[2]}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ portal: portal.id, title: clean(m[1]), company: clean(m[2]), ...(m[3] ? { location: clean(m[3]) } : {}) });
    }
  }
  return out;
}

const tokensOf = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(w => w.length > 1));

/** Title similarity for matching an alert to a company board posting. */
export function titleSimilarity(a: string, b: string): number {
  const A = tokensOf(a), B = tokensOf(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
