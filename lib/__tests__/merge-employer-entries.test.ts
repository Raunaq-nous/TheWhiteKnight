import { describe, it, expect } from "vitest";
import { mergeEmployerEntries } from "../../scripts/merge-employer-entries";
import { getSeedProfile } from "../profile";
import type { Profile } from "../profile";

function splitBainProfile(): Profile {
  return {
    ...getSeedProfile(),
    experience: [
      { id: "legacy", company: "Bain & Company", role: "Consultant", tenure: "2025 - Present", location: "Gurgaon", current: true, bullets: "Legacy bullet one.\nShared bullet." },
      { id: "aranca", company: "Aranca", role: "Lead", tenure: "2022 - 2025", location: "Mumbai", current: false, bullets: "Aranca bullet." },
      {
        id: "imported", company: "Bain and Company", role: "Project Leader", tenure: "Jun 2025 - Present", location: "Delhi", current: false,
        bullets: "Imported AI build.\nShared bullet.\nImported engagement.",
        bulletTags: { "Imported AI build.": "ai_build", "Imported engagement.": "consulting_engagement" },
      },
    ],
  };
}

describe("mergeEmployerEntries", () => {
  it("keeps the --keep entry's title, dates, location and current flag untouched", () => {
    const { profile } = mergeEmployerEntries(splitBainProfile(), "Bain & Company", "Bain and Company");
    const bain = profile.experience.find(e => e.id === "legacy")!;
    expect(bain).toMatchObject({ company: "Bain & Company", role: "Consultant", tenure: "2025 - Present", location: "Gurgaon", current: true });
  });

  it("folds every non-duplicate bullet from the --from entry, with its category tag, and deletes that entry", () => {
    const { profile, preview } = mergeEmployerEntries(splitBainProfile(), "Bain & Company", "Bain and Company");
    expect(profile.experience.map(e => e.id)).toEqual(["legacy", "aranca"]);
    const bain = profile.experience[0];
    expect(bain.bullets.split("\n")).toEqual(["Legacy bullet one.", "Shared bullet.", "Imported AI build.", "Imported engagement."]);
    expect(bain.bulletTags).toEqual({ "Imported AI build.": "ai_build", "Imported engagement.": "consulting_engagement" });
    expect(preview.alreadyPresent).toEqual(["Shared bullet."]);
    expect(preview.folded.map(f => f.text)).toEqual(["Imported AI build.", "Imported engagement."]);
  });

  it("leaves other employers untouched and never mutates the input", () => {
    const input = splitBainProfile();
    const snapshot = JSON.stringify(input);
    const { profile } = mergeEmployerEntries(input, "Bain & Company", "Bain and Company");
    expect(profile.experience.find(e => e.id === "aranca")).toEqual(input.experience[1]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("refuses to merge two different employers", () => {
    expect(() => mergeEmployerEntries(splitBainProfile(), "Bain & Company", "Aranca")).toThrow(/not the same employer/);
  });

  it("refuses when a named entry doesn't exist exactly", () => {
    expect(() => mergeEmployerEntries(splitBainProfile(), "Bain & Co", "Bain and Company")).toThrow(/Expected exactly one/);
  });
});
