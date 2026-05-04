// Server-only. Upstash Redis client for user accounts and invite codes.
import { Redis } from "@upstash/redis";

function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set. Provision an Upstash Redis database in Vercel → Integrations → Upstash.");
  }
  return new Redis({ url, token });
}

// ─── User types ────────────────────────────────────────────────────────────

export type StoredUser = {
  email: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: string;
};

// ─── User operations ───────────────────────────────────────────────────────

export async function getUser(email: string): Promise<StoredUser | null> {
  const redis = getRedis();
  return redis.get<StoredUser>(`user:${email.toLowerCase()}`);
}

export async function createUser(email: string, passwordHash: string, isAdmin = false): Promise<void> {
  const redis = getRedis();
  const user: StoredUser = { email: email.toLowerCase(), passwordHash, isAdmin, createdAt: new Date().toISOString() };
  await redis.set(`user:${email.toLowerCase()}`, user);
  await redis.sadd("users_index", email.toLowerCase());
}

export async function userExists(email: string): Promise<boolean> {
  const redis = getRedis();
  return (await redis.exists(`user:${email.toLowerCase()}`)) === 1;
}

// ─── Invite code operations ────────────────────────────────────────────────

export type InviteCode = {
  code: string;
  used: boolean;
  usedBy: string | null;
  createdAt: string;
};

export async function createInviteCode(code: string): Promise<void> {
  const redis = getRedis();
  const invite: InviteCode = { code, used: false, usedBy: null, createdAt: new Date().toISOString() };
  await redis.set(`invite:${code}`, invite);
  await redis.sadd("invites_index", code);
}

export async function getInviteCode(code: string): Promise<InviteCode | null> {
  const redis = getRedis();
  return redis.get<InviteCode>(`invite:${code}`);
}

export async function markInviteUsed(code: string, email: string): Promise<void> {
  const redis = getRedis();
  const invite = await getInviteCode(code);
  if (invite) {
    await redis.set(`invite:${code}`, { ...invite, used: true, usedBy: email.toLowerCase() });
  }
}

export async function listInviteCodes(): Promise<InviteCode[]> {
  const redis = getRedis();
  const codes = await redis.smembers("invites_index") as string[];
  if (!codes.length) return [];
  const entries = await Promise.all(codes.map(c => getInviteCode(c)));
  return entries.filter(Boolean) as InviteCode[];
}
