// Client-side batch evaluation runner. Processes a queue of JDs through
// A-F scoring → saves to applications, with bounded concurrency
// and localStorage-persisted state so progress survives page refresh.

import { Profile } from "./profile";
import { TargetBucket, Application, generateId, generateSlug, saveApplication } from "./store";
import { getModelSettings } from "./model-settings";
import { AFScoreResult } from "./prompts";

export type BatchInput = {
  company: string;
  role: string;
  location: string;
  jdText: string;
  jdUrl?: string;
  remote?: boolean;
  seniority?: string;
  sector?: string;
};

export type BatchItem = BatchInput & {
  id: string;
  status: "queued" | "scoring" | "done" | "error";
  error?: string;
  score?: number;          // global 1-5
  recommendation?: string;
  applicationSlug?: string;
};

export type BatchState = {
  id: string;
  items: BatchItem[];
  startedAt: string;
  finishedAt?: string;
  concurrency: number;
};

const KEY = "careeros_batch_state";

export function loadBatchState(): BatchState | null {
  if (typeof window === "undefined") return null;
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function saveBatchState(s: BatchState | null) {
  if (typeof window === "undefined") return;
  if (s === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event("careeros-batch-change"));
}

export function clearBatchState() { saveBatchState(null); }

function providerSettings() {
  const s = getModelSettings();
  return s.provider !== "together" ? { provider: s.provider, model: s.model, apiKey: s.apiKey } : undefined;
}

async function scoreOne(input: BatchInput, profile: Profile, buckets: TargetBucket[]): Promise<AFScoreResult & { totalScore: number }> {
  const res = await fetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jdText: input.jdText,
      company: input.company,
      role: input.role,
      location: input.location,
      seniority: input.seniority ?? "senior",
      sector: input.sector ?? "",
      remote: input.remote ?? /remote/i.test(input.location ?? ""),
      buckets,
      profile,
      providerSettings: providerSettings(),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Scoring failed");
  return data;
}

async function processItem(item: BatchItem, profile: Profile, buckets: TargetBucket[], onChange: (next: BatchItem) => void): Promise<BatchItem> {
  try {
    onChange({ ...item, status: "scoring" });
    const scored = await scoreOne(item, profile, buckets);

    const slug = generateSlug(item.company, item.role);
    const now = new Date().toISOString();
    const appRecord: Application = {
      id: generateId(),
      slug,
      company: item.company,
      role: item.role,
      location: item.location,
      remote: item.remote ?? /remote/i.test(item.location ?? ""),
      status: "sourced",
      score: scored.totalScore ?? scored.global * 2,
      bucket: scored.bucket,
      bucketName: scored.bucketName,
      sector: item.sector ?? "",
      seniority: item.seniority ?? "senior",
      sourceUrl: item.jdUrl ?? "",
      capturedAt: now.split("T")[0],
      jdRaw: item.jdText,
      jdParsed: scored.jdParsed,
      afScore: {
        archetype: scored.archetype,
        scores: scored.scores,
        global: scored.global,
        recommendation: scored.recommendation,
        legitimacy: scored.legitimacy,
      },
      nextAction: scored.recommendation === "apply_immediately" || scored.recommendation === "apply" ? "Tailor resume and apply" : "Review and decide",
      contacts: [],
      interviews: [],
      reminders: [],
      resumeVersions: [],
      notes: "",
      emailEvents: [],
      createdAt: now,
      updatedAt: now,
    };
    saveApplication(appRecord);

    const done: BatchItem = {
      ...item,
      status: "done",
      score: scored.global,
      recommendation: scored.recommendation,
      applicationSlug: slug,
    };
    onChange(done);
    return done;
  } catch (e: any) {
    const err: BatchItem = { ...item, status: "error", error: e.message };
    onChange(err);
    return err;
  }
}

export async function runBatch(
  inputs: BatchInput[],
  profile: Profile,
  buckets: TargetBucket[],
  concurrency = 2
): Promise<BatchState> {
  const state: BatchState = {
    id: Math.random().toString(36).slice(2, 10),
    items: inputs.map(i => ({ ...i, id: Math.random().toString(36).slice(2, 10), status: "queued" as const })),
    startedAt: new Date().toISOString(),
    concurrency,
  };
  saveBatchState(state);

  const updateItem = (next: BatchItem) => {
    const idx = state.items.findIndex(it => it.id === next.id);
    if (idx >= 0) state.items[idx] = next;
    saveBatchState({ ...state });
  };

  const queue = [...state.items];
  const workers: Promise<void>[] = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) break;
        await processItem(next, profile, buckets, updateItem);
      }
    })());
  }
  await Promise.all(workers);

  state.finishedAt = new Date().toISOString();
  saveBatchState({ ...state });
  return state;
}
