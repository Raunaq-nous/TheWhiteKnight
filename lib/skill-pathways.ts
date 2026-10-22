// Pathway progress (client-safe types and pure helpers). Seeded pathways
// come from config; drafts are model-generated for a demanded skill with no
// seed and stay "draft" until the user accepts or edits them. Steps can be
// marked done; a finished proof artifact can be offered as a profile bullet
// (only with the user's approval, through the existing write-back).
// Pathways are learning plans: they never appear on a resume as claims.

import type { SeedPathway } from "./career-tracks";

export type PathwayState = {
  trackId: string;
  skill: string;
  origin: "seed" | "draft";
  status: "draft" | "accepted";
  steps: string[];
  proof: string;
  estimate: string;
  stepsDone: number[];
  proofDone: boolean;
  bulletAdded?: boolean;
  updatedAt: string;
};

export type PathwayStore = Record<string, PathwayState>;

export function pathwayKey(trackId: string, skill: string): string {
  return `${trackId}::${skill.toLowerCase()}`;
}

/** The effective pathway for a gap: stored state, else the seed (accepted by definition), else null. */
export function effectivePathway(store: PathwayStore, trackId: string, skill: string, seed: SeedPathway | null): PathwayState | null {
  const saved = store[pathwayKey(trackId, skill)];
  if (saved) return saved;
  if (!seed) return null;
  return { trackId, skill, origin: "seed", status: "accepted", steps: seed.steps, proof: seed.proof, estimate: seed.estimate, stepsDone: [], proofDone: false, updatedAt: "" };
}

export type PathwayUpdate =
  | { kind: "draft"; steps: string[]; proof: string; estimate: string }
  | { kind: "accept" }
  | { kind: "edit"; steps: string[]; proof: string; estimate: string }
  | { kind: "step"; index: number; done: boolean }
  | { kind: "proof"; done: boolean }
  | { kind: "bulletAdded" };

/** Applies one user action to a pathway (pure). */
export function applyPathwayUpdate(current: PathwayState | null, trackId: string, skill: string, u: PathwayUpdate, now: string): PathwayState {
  const base: PathwayState = current ?? { trackId, skill, origin: "draft", status: "draft", steps: [], proof: "", estimate: "", stepsDone: [], proofDone: false, updatedAt: now };
  const clip = (xs: string[]) => xs.map(x => String(x).trim()).filter(Boolean).slice(0, 8).map(x => x.slice(0, 240));
  switch (u.kind) {
    case "draft": return { ...base, origin: "draft", status: "draft", steps: clip(u.steps), proof: u.proof.slice(0, 240), estimate: u.estimate.slice(0, 60), stepsDone: [], proofDone: false, updatedAt: now };
    case "accept": return { ...base, status: "accepted", updatedAt: now };
    case "edit": return { ...base, status: "accepted", steps: clip(u.steps), proof: u.proof.slice(0, 240), estimate: u.estimate.slice(0, 60), stepsDone: base.stepsDone.filter(i => i < u.steps.length), updatedAt: now };
    case "step": {
      if (u.index < 0 || u.index >= base.steps.length) return base;
      const done = new Set(base.stepsDone);
      if (u.done) done.add(u.index); else done.delete(u.index);
      return { ...base, stepsDone: [...done].sort((a, b) => a - b), updatedAt: now };
    }
    case "proof": return { ...base, proofDone: u.done, updatedAt: now };
    case "bulletAdded": return { ...base, bulletAdded: true, updatedAt: now };
  }
}

/** A finished proof artifact can be offered as a profile bullet (never automatically). */
export function canOfferBullet(p: PathwayState | null): boolean {
  return !!p && p.status === "accepted" && p.proofDone && !p.bulletAdded;
}
