// ROLE BALANCE — one rule for both the generation fill (lib/resume-fill.ts)
// and export's measure-and-fill (lib/resume-measure-fill.ts):
//   1. The current role carries the most bullets, counting its Key Projects
//      items. No earlier role may exceed it, unless the current role has
//      run out of usable bullets.
//   2. No role carries more than about a third of the Experience section.
//   3. Among allowed roles, additions are spread: a role's next bullet is
//      discounted by how many it already has, so page two fills across
//      roles with remaining relevant bullets instead of stacking one.

import { FILL_TARGETS } from "./resume-budget";
import { namesMatch } from "./profile-merge";

export type BalanceState = {
  // Experience bullets per role (company), as currently selected.
  counts: Map<string, number>;
  // The current (most recent) role, or null when there is none.
  currentRole: string | null;
  // Key Projects items drawn from the current role.
  currentBandItems: number;
  // True once the current role has no usable bullets left to add.
  currentExhausted: boolean;
  // The Experience section size the share cap is measured against.
  sectionSize: number;
};

/** Per-role ceiling: about a third of the Experience section, never below the per-employer floor. */
export function roleShareCap(sectionSize: number): number {
  return Math.max(FILL_TARGETS.perEmployerMin, Math.ceil(sectionSize * FILL_TARGETS.maxRoleShare));
}

/** Whether one more experience bullet may go to `role`. */
export function canAddToRole(role: string, s: BalanceState): boolean {
  const n = countFor(s.counts, role);
  if (n + 1 > roleShareCap(s.sectionSize)) return false;
  if (!s.currentRole || namesMatch(role, s.currentRole) || s.currentExhausted) return true;
  const currentTotal = countFor(s.counts, s.currentRole) + s.currentBandItems;
  return n + 1 <= currentTotal;
}

/** Ordering weight for spreading: each bullet a role already has discounts its next one. */
export function spreadWeight(role: string, counts: Map<string, number>): number {
  return Math.pow(0.85, countFor(counts, role));
}

export function countFor(counts: Map<string, number>, role: string): number {
  if (counts.has(role)) return counts.get(role)!;
  for (const [k, v] of counts) if (namesMatch(k, role)) return v;
  return 0;
}

export function bandItemsFor(role: string | null, bandCompanies: (string | null | undefined)[] | null | undefined): number {
  if (!role) return 0;
  return (bandCompanies ?? []).filter(c => c && namesMatch(c, role)).length;
}

/** Human-readable balance violations, for tests and the verify script. Empty means balanced. */
export function balanceViolations(
  experience: { company: string; bullets: unknown[] }[],
  bandCompanies: (string | null | undefined)[] | null | undefined,
  currentExhausted: boolean,
): string[] {
  const out: string[] = [];
  const total = experience.reduce((n, e) => n + e.bullets.length, 0);
  // Same basis as the fill: a section is never sized below totalMin.
  const cap = roleShareCap(Math.max(total, FILL_TARGETS.totalMin));
  for (const e of experience) {
    if (e.bullets.length > cap) out.push(`${e.company} has ${e.bullets.length} of ${total} experience bullets (cap ${cap}, about a third)`);
  }
  const current = experience[0];
  if (current && !currentExhausted) {
    const currentTotal = current.bullets.length + bandItemsFor(current.company, bandCompanies);
    for (const e of experience.slice(1)) {
      if (e.bullets.length > currentTotal) out.push(`${e.company} (${e.bullets.length}) exceeds the current role ${current.company} (${currentTotal} incl. Key Projects)`);
    }
  }
  return out;
}
