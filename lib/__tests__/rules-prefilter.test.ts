import { describe, it, expect } from "vitest";
import { applyRecencyFilter, applyLocationFilter, runRulesPreFilter, MAX_POSTING_AGE_DAYS } from "../server/services/rules-prefilter";
import type { JobResult } from "../server/services/scan-service";
import type { Profile } from "../profile";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function job(overrides: Partial<JobResult> = {}): JobResult {
  return { title: "Product Manager", company: "Acme", location: "", url: "https://x.com/1", source: "greenhouse", ...overrides };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Jordan Lee", headline: "", email: "j@example.com", phone: "", location: "Mumbai, India",
    locationsOpenTo: "Mumbai, Bangalore, Remote", yearsOfExperience: "5",
    experience: [], education: [], skills: {}, projects: [], publications: [], certifications: [],
    voiceNotes: "", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  } as Profile;
}

describe("applyRecencyFilter — zero-token staleness rejection", () => {
  it("drops a posting older than the cutoff", () => {
    const old = job({ publishedDate: new Date(NOW.getTime() - (MAX_POSTING_AGE_DAYS + 5) * 86400000).toISOString() });
    const result = applyRecencyFilter([old], NOW);
    expect(result.survivors).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].stage).toBe("recency");
    expect(result.rejected[0].reason).toMatch(/days ago/);
  });

  it("keeps a recent posting", () => {
    const recent = job({ publishedDate: new Date(NOW.getTime() - 5 * 86400000).toISOString() });
    const result = applyRecencyFilter([recent], NOW);
    expect(result.survivors).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it("never rejects a posting with no publish date at all", () => {
    const result = applyRecencyFilter([job({ publishedDate: undefined })], NOW);
    expect(result.survivors).toHaveLength(1);
  });

  it("never rejects a posting with an unparseable date", () => {
    const result = applyRecencyFilter([job({ publishedDate: "not-a-date" })], NOW);
    expect(result.survivors).toHaveLength(1);
  });
});

describe("applyLocationFilter — zero-token location mismatch rejection", () => {
  it("drops a job in a clearly different location", () => {
    const result = applyLocationFilter([job({ location: "London, UK" })], profile());
    expect(result.survivors).toHaveLength(0);
    expect(result.rejected[0].stage).toBe("location");
    expect(result.rejected[0].reason).toContain("London, UK");
  });

  it("keeps a job matching an open-to location", () => {
    const result = applyLocationFilter([job({ location: "Bangalore, India" })], profile());
    expect(result.survivors).toHaveLength(1);
  });

  it("always keeps a remote job regardless of open-to locations", () => {
    const result = applyLocationFilter([job({ location: "Remote (US)" })], profile());
    expect(result.survivors).toHaveLength(1);
  });

  it("always keeps a job with a blank location", () => {
    const result = applyLocationFilter([job({ location: "" })], profile());
    expect(result.survivors).toHaveLength(1);
  });

  it("keeps everything when the candidate is open to anywhere", () => {
    const result = applyLocationFilter([job({ location: "Lagos, Nigeria" })], profile({ locationsOpenTo: "Open to relocation, anywhere" }));
    expect(result.survivors).toHaveLength(1);
  });

  it("keeps everything when the candidate has no location signal at all", () => {
    const result = applyLocationFilter([job({ location: "Lagos, Nigeria" })], profile({ location: "", locationsOpenTo: "" }));
    expect(result.survivors).toHaveLength(1);
  });
});

describe("runRulesPreFilter — combined pipeline, recency then location", () => {
  it("applies both stages and reports rejections tagged by stage", () => {
    const stale = job({ title: "Stale Role", publishedDate: new Date(NOW.getTime() - 100 * 86400000).toISOString() });
    const wrongLocation = job({ title: "Wrong Location Role", location: "Berlin, Germany" });
    const good = job({ title: "Good Role", location: "Mumbai, India", publishedDate: NOW.toISOString() });

    const result = runRulesPreFilter([stale, wrongLocation, good], profile(), NOW);
    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0].title).toBe("Good Role");
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.map(r => r.stage).sort()).toEqual(["location", "recency"]);
  });

  it("never rejects anything when nothing is stale or mismatched", () => {
    const result = runRulesPreFilter([job({ location: "Remote" })], profile(), NOW);
    expect(result.survivors).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });
});
