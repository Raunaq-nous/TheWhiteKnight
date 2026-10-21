import "server-only";
// JOB-ALERT INBOX. Reads alert emails from the user's IMAP mailbox
// (read-only: the folder is opened read-only and nothing is marked seen),
// parses them (lib/alert-email.ts) and resolves each job:
//   - lookup-only portals (LinkedIn, Naukri and similar): the portal page is
//     never fetched; the job is looked up on the company's own careers board
//     (its ATS feed) by company and title;
//   - a company-direct ATS link in the email is ingested as is.
// Email content is inert data throughout.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getDb } from "../db";
import { ALERT_PORTALS, parseAlertEmail, titleSimilarity, type AlertEmail, type AlertJob } from "../../alert-email";
import { namesMatch } from "../../profile-merge";
import type { CompanyTarget } from "../../company-targets";
import type { IntegrationSettings } from "../../integration-settings";
import type { JobCollector, JobResult } from "./collectors/types";

export const ALERT_LOOKBACK_DAYS = 7;
const MAX_MESSAGES = 200;
const SEEN_KEPT = 2000;
const TITLE_MATCH = 0.5;

export type ImapLike = {
  connect(): Promise<void>;
  getMailboxLock(path: string, opts?: { readOnly?: boolean }): Promise<{ release(): void }>;
  search(query: Record<string, unknown>, opts?: { uid?: boolean }): Promise<number[] | false>;
  fetch(range: number[] | string, query: Record<string, unknown>, opts?: { uid?: boolean }): AsyncIterable<{ uid: number; source?: Buffer; envelope?: { from?: { address?: string }[]; messageId?: string; date?: Date } }>;
  logout(): Promise<void>;
};

export function imapConfigured(s: IntegrationSettings): boolean {
  return !!(s.imapHost && s.imapUser && s.imapPassword);
}

function defaultClient(s: IntegrationSettings): ImapLike {
  return new ImapFlow({
    host: s.imapHost!, port: s.imapPort ?? 993, secure: s.imapSecure ?? true,
    auth: { user: s.imapUser!, pass: s.imapPassword! },
    logger: false,
  }) as unknown as ImapLike;
}

const ALERT_DOMAINS = ALERT_PORTALS.flatMap(p => p.senderDomains);

/** Alert emails from the last ALERT_LOOKBACK_DAYS not processed before. Never throws. */
export async function readAlertEmails(s: IntegrationSettings, seenIds: Set<string>, opts: { now?: Date; client?: ImapLike } = {}): Promise<{ emails: AlertEmail[]; error?: string }> {
  if (!imapConfigured(s)) return { emails: [], error: "IMAP is not configured" };
  const client = opts.client ?? defaultClient(s);
  const since = new Date((opts.now ?? new Date()).getTime() - ALERT_LOOKBACK_DAYS * 86_400_000);
  const emails: AlertEmail[] = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock(s.imapFolder || "INBOX", { readOnly: true });
    try {
      const uids = (await client.search({ since }, { uid: true })) || [];
      for await (const msg of client.fetch(uids.slice(-MAX_MESSAGES), { uid: true, envelope: true, source: true }, { uid: true })) {
        const fromAddr = (msg.envelope?.from?.[0]?.address ?? "").toLowerCase();
        if (!ALERT_DOMAINS.some(d => fromAddr.endsWith(`@${d}`) || fromAddr.endsWith(`.${d}`))) continue;
        const id = msg.envelope?.messageId ?? `uid:${msg.uid}`;
        if (seenIds.has(id) || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        emails.push({
          from: fromAddr, subject: parsed.subject ?? "", html: typeof parsed.html === "string" ? parsed.html : undefined,
          text: parsed.text ?? undefined, receivedAt: (parsed.date ?? msg.envelope?.date)?.toISOString(), messageId: id,
        });
      }
    } finally {
      lock.release();
    }
    await client.logout().catch(() => {});
    return { emails };
  } catch (e) {
    // Never echo credentials: only the error message.
    return { emails, error: `IMAP: ${(e as Error).message}` };
  }
}

export type UnresolvedAlert = { job: AlertJob; reason: string };

/**
 * Resolves alert jobs to company-direct postings. Each company board is
 * fetched at most once per call.
 */
export async function resolveAlertJobs(
  jobs: AlertJob[],
  targets: CompanyTarget[],
  collectors: Partial<Record<string, JobCollector>>,
): Promise<{ resolved: JobResult[]; unresolved: UnresolvedAlert[] }> {
  const resolved: JobResult[] = [];
  const unresolved: UnresolvedAlert[] = [];
  const boards = new Map<string, Promise<JobResult[]>>();
  for (const job of jobs) {
    if (job.directUrl) {
      resolved.push({ title: job.title, company: job.company, location: job.location, url: job.directUrl, source: "alert-email", via: job.portal, publishedDate: job.receivedAt });
      continue;
    }
    const target = targets.find(t => namesMatch(t.name, job.company));
    if (!target) { unresolved.push({ job, reason: "company is not in your targets: add it with the ATS detector to look this job up on its own board" }); continue; }
    const collector = collectors[target.ats];
    const tenant = target.atsTenant ?? (target.ats === "smartrecruiters" ? target.id : undefined);
    if (!collector || (!tenant && target.ats !== "workday")) { unresolved.push({ job, reason: `${target.name} has no public ATS feed configured` }); continue; }
    if (!boards.has(target.id)) {
      boards.set(target.id, collector.collect({ tenant, companyName: target.name, careersUrl: target.careersUrl }).then(r => r.jobs).catch(() => []));
    }
    const postings = await boards.get(target.id)!;
    const best = postings
      .map(p => ({ p, sim: titleSimilarity(p.title, job.title) }))
      .sort((a, b) => b.sim - a.sim)[0];
    if (!best || best.sim < TITLE_MATCH) { unresolved.push({ job, reason: `no matching posting on ${target.name}'s own board` }); continue; }
    resolved.push({ ...best.p, via: job.portal, source: best.p.source });
  }
  return { resolved, unresolved };
}

function readState(userEmail: string): { seen: string[] } {
  const row = getDb().prepare("SELECT data FROM singletons WHERE user_email = ? AND key = 'alert_inbox_state'").get(userEmail) as { data: string } | undefined;
  try { return row ? JSON.parse(row.data) : { seen: [] }; } catch { return { seen: [] }; }
}

function writeState(userEmail: string, state: { seen: string[] }): void {
  getDb().prepare(`
    INSERT INTO singletons (user_email, key, data, updated_at) VALUES (?, 'alert_inbox_state', ?, ?)
    ON CONFLICT (user_email, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(userEmail, JSON.stringify({ seen: state.seen.slice(-SEEN_KEPT) }), new Date().toISOString());
}

/** One inbox pass for a user: read new alerts, resolve them, remember what was read. */
export async function collectFromAlertInbox(
  userEmail: string,
  settings: IntegrationSettings,
  targets: CompanyTarget[],
  collectors: Partial<Record<string, JobCollector>>,
  opts: { now?: Date; client?: ImapLike } = {},
): Promise<{ jobs: JobResult[]; unresolved: UnresolvedAlert[]; emailsRead: number; error?: string }> {
  if (!imapConfigured(settings)) return { jobs: [], unresolved: [], emailsRead: 0 };
  const state = readState(userEmail);
  const { emails, error } = await readAlertEmails(settings, new Set(state.seen), opts);
  const parsed = emails.flatMap(parseAlertEmail);
  const { resolved, unresolved } = await resolveAlertJobs(parsed, targets, collectors);
  writeState(userEmail, { seen: [...state.seen, ...emails.map(e => e.messageId!).filter(Boolean)] });
  return { jobs: resolved, unresolved, emailsRead: emails.length, ...(error ? { error } : {}) };
}
