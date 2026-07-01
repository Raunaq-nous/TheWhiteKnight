import { describe, it, expect } from "vitest";

// Pure data-layer tests for the export/import schema.
// These do not require HTTP or SQLite — they verify data shapes and
// the merge-dedup rules that the import route implements.

type MinimalApp = { id: string; company: string; role: string; status: string };
type MinimalContact = { id: string; name: string; email?: string; linkedinUrl?: string };

type ExportPayload = {
  exportedAt: string;
  exportedBy: string;
  version: number;
  applications: MinimalApp[];
  profile: Record<string, unknown> | null;
  contacts: MinimalContact[];
  skillPlan: unknown;
  skillStatus: Record<string, unknown>;
  notifications: unknown[];
  modelSettings: unknown;
  integrationSettings: unknown;
  companyTargets: unknown;
  batchState: unknown;
};

function makeExportPayload(overrides: Partial<ExportPayload> = {}): ExportPayload {
  return {
    exportedAt: "2025-01-01T00:00:00.000Z",
    exportedBy: "test@example.com",
    version: 1,
    applications: [],
    profile: null,
    contacts: [],
    skillPlan: null,
    skillStatus: {},
    notifications: [],
    modelSettings: null,
    integrationSettings: null,
    companyTargets: null,
    batchState: null,
    ...overrides,
  };
}

describe("export/import data shape", () => {
  it("all top-level fields survive a JSON round-trip", () => {
    const payload = makeExportPayload({
      applications: [{ id: "app1", company: "Stripe", role: "Engineer", status: "applied" }],
      contacts: [{ id: "c1", name: "Jane", email: "jane@example.com" }],
      profile: { name: "Alice", email: "alice@example.com" },
    });

    const serialized = JSON.stringify(payload);
    const restored = JSON.parse(serialized) as ExportPayload;

    expect(restored.exportedAt).toBe(payload.exportedAt);
    expect(restored.version).toBe(1);
    expect(restored.applications).toHaveLength(1);
    expect(restored.applications[0].id).toBe("app1");
    expect(restored.contacts).toHaveLength(1);
    expect(restored.contacts[0].email).toBe("jane@example.com");
    expect((restored.profile as any).name).toBe("Alice");
  });

  it("a null profile survives the round-trip", () => {
    const payload = makeExportPayload({ profile: null });
    const restored = JSON.parse(JSON.stringify(payload)) as ExportPayload;
    expect(restored.profile).toBeNull();
  });

  it("empty collections survive the round-trip", () => {
    const payload = makeExportPayload();
    const restored = JSON.parse(JSON.stringify(payload)) as ExportPayload;
    expect(restored.applications).toEqual([]);
    expect(restored.contacts).toEqual([]);
    expect(restored.notifications).toEqual([]);
  });
});

// Simulate the merge-dedup logic used by the import route without SQLite.
function mergeApplications(existing: MinimalApp[], incoming: MinimalApp[]): MinimalApp[] {
  const byId = new Map(existing.map(a => [a.id, a]));
  for (const app of incoming) {
    byId.set(app.id, app); // upsert: replace on match, add on new id
  }
  return Array.from(byId.values());
}

function mergeContacts(existing: MinimalContact[], incoming: MinimalContact[]): MinimalContact[] {
  const byEmail = new Map(existing.filter(c => c.email).map(c => [c.email!, c]));
  const byLinkedin = new Map(existing.filter(c => c.linkedinUrl).map(c => [c.linkedinUrl!, c]));
  const result = [...existing];

  for (const c of incoming) {
    const isDupe =
      (c.email && byEmail.has(c.email)) ||
      (c.linkedinUrl && byLinkedin.has(c.linkedinUrl));
    if (!isDupe) {
      result.push(c);
      if (c.email) byEmail.set(c.email, c);
      if (c.linkedinUrl) byLinkedin.set(c.linkedinUrl, c);
    }
  }
  return result;
}

describe("merge dedup rules", () => {
  it("duplicate application by id is not doubled", () => {
    const app: MinimalApp = { id: "a1", company: "Stripe", role: "Engineer", status: "applied" };
    const result = mergeApplications([app], [app]);
    expect(result).toHaveLength(1);
  });

  it("re-importing updates the existing application record", () => {
    const original: MinimalApp = { id: "a1", company: "Stripe", role: "Engineer", status: "applied" };
    const updated: MinimalApp = { ...original, status: "interview" };
    const result = mergeApplications([original], [updated]);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("interview");
  });

  it("new application with different id is added", () => {
    const a1: MinimalApp = { id: "a1", company: "Stripe", role: "Engineer", status: "applied" };
    const a2: MinimalApp = { id: "a2", company: "Plaid", role: "PM", status: "sourced" };
    const result = mergeApplications([a1], [a2]);
    expect(result).toHaveLength(2);
  });

  it("duplicate contact by email is not doubled", () => {
    const c: MinimalContact = { id: "c1", name: "Jane", email: "jane@example.com" };
    const result = mergeContacts([c], [{ ...c, id: "c1-copy" }]);
    expect(result).toHaveLength(1);
  });

  it("duplicate contact by linkedinUrl is not doubled", () => {
    const c: MinimalContact = { id: "c1", name: "Jane", linkedinUrl: "linkedin.com/in/jane" };
    const result = mergeContacts([c], [{ ...c, id: "c1-copy" }]);
    expect(result).toHaveLength(1);
  });

  it("contact with different email is added", () => {
    const c1: MinimalContact = { id: "c1", name: "Jane", email: "jane@example.com" };
    const c2: MinimalContact = { id: "c2", name: "Bob", email: "bob@example.com" };
    const result = mergeContacts([c1], [c2]);
    expect(result).toHaveLength(2);
  });
});
