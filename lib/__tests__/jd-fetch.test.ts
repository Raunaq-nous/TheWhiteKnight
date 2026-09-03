import { describe, it, expect } from "vitest";
import { htmlToText, extractJobPostingFromLdJson, extractLinkedInMetadataFromText } from "../jd-fetch";

describe("htmlToText", () => {
  it("strips tags and collapses whitespace while preserving line breaks", () => {
    const html = "<div>Hello <b>world</b></div><p>Second line</p>";
    expect(htmlToText(html)).toBe("Hello world\nSecond line");
  });

  it("removes script/style/nav/footer/header blocks entirely", () => {
    const html = "<header>Nav stuff</header><script>var x=1;</script><div>Real content</div><footer>Copyright</footer>";
    const text = htmlToText(html);
    expect(text).toBe("Real content");
  });

  it("decodes common HTML entities", () => {
    expect(htmlToText("<p>Tom &amp; Jerry</p>")).toBe("Tom & Jerry");
  });
});

describe("extractJobPostingFromLdJson — BUG: title/company/location missing from auto-populated ingest form", () => {
  function ldScript(obj: any): string {
    return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
  }

  it("root cause: description alone (old behavior) never contained title/company/location — this now folds them into the returned text as a header", () => {
    const html = ldScript({
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      title: "Senior Product Manager",
      description: "<p>We are looking for a PM to own our platform.</p>",
      hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
      jobLocation: { "@type": "Place", address: { addressLocality: "San Francisco", addressRegion: "CA", addressCountry: "US" } },
    });

    const result = extractJobPostingFromLdJson(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Senior Product Manager");
    expect(result!.company).toBe("Acme Corp");
    expect(result!.location).toBe("San Francisco, CA, US");
    // The header is folded into the text so parse-jd's LLM extraction has
    // something to find these fields in — this is the actual fix.
    expect(result!.text).toContain("Job Title: Senior Product Manager");
    expect(result!.text).toContain("Company: Acme Corp");
    expect(result!.text).toContain("Location: San Francisco, CA, US");
    expect(result!.text).toContain("We are looking for a PM to own our platform.");
  });

  it("scans ALL ld+json blocks, not just the first (a page can have Organization/BreadcrumbList before JobPosting)", () => {
    const html = [
      ldScript({ "@context": "https://schema.org/", "@type": "Organization", name: "Acme Corp" }),
      ldScript({ "@context": "https://schema.org/", "@type": "BreadcrumbList", itemListElement: [] }),
      ldScript({
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        title: "Staff Engineer",
        description: "Build things.",
        hiringOrganization: { name: "Acme Corp" },
      }),
    ].join("\n");

    const result = extractJobPostingFromLdJson(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Staff Engineer");
    expect(result!.company).toBe("Acme Corp");
  });

  it("handles a JobPosting nested under a jobPosting key", () => {
    const html = ldScript({
      "@context": "https://schema.org/",
      "@type": "SomeWrapper",
      jobPosting: { title: "Analyst", description: "Do analysis.", hiringOrganization: { name: "Beta Inc" } },
    });
    const result = extractJobPostingFromLdJson(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Analyst");
    expect(result!.company).toBe("Beta Inc");
  });

  it("still returns a usable result when title/company/location are missing — just no header lines for those", () => {
    const html = ldScript({ "@type": "JobPosting", description: "Just a description, nothing else." });
    const result = extractJobPostingFromLdJson(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("");
    expect(result!.company).toBe("");
    expect(result!.text).not.toContain("Job Title:");
    expect(result!.text).not.toContain("Company:");
    expect(result!.text).toContain("Just a description, nothing else.");
  });

  it("returns null when no block has a JobPosting with a description", () => {
    const html = ldScript({ "@type": "Organization", name: "Acme Corp" });
    expect(extractJobPostingFromLdJson(html)).toBeNull();
  });

  it("returns null for malformed JSON without throwing", () => {
    const html = `<script type="application/ld+json">{ not valid json </script>`;
    expect(() => extractJobPostingFromLdJson(html)).not.toThrow();
    expect(extractJobPostingFromLdJson(html)).toBeNull();
  });

  it("strips HTML from the description while keeping the header as plain lines", () => {
    const html = ldScript({
      "@type": "JobPosting",
      title: "PM",
      description: "<ul><li>Own the roadmap</li><li>Ship features</li></ul>",
      hiringOrganization: { name: "Acme" },
    });
    const result = extractJobPostingFromLdJson(html);
    expect(result!.text).toContain("Own the roadmap");
    expect(result!.text).toContain("Ship features");
    expect(result!.text).not.toContain("<li>");
  });
});

// BUG: LinkedIn ingest fetches JD text successfully (via Exa's "text: true"
// mode, which returns rendered page text, never raw HTML) but auto-populate
// left company/role/location empty, because extractJobPostingFromLdJson
// only ever runs against raw HTML — it never gets a chance to fire on this
// path at all, regardless of whether LinkedIn's JobPosting ld+json block
// still exists. This is the deterministic text-metadata fallback for
// exactly that case.
describe("extractLinkedInMetadataFromText — text fallback when JSON-LD never had a chance to run", () => {
  // The exact real reported case.
  const REAL_TITLE_LINE =
    "Accenture in India hiring S&C GN - TS&T –Enterprise AI Value Strategy - Manager in Pune Division, Maharashtra, India | LinkedIn";

  it("parses the exact reported LinkedIn title line, preserving the en-dash inside the role untouched", () => {
    const result = extractLinkedInMetadataFromText(REAL_TITLE_LINE);
    expect(result).toEqual({
      company: "Accenture in India",
      role: "S&C GN - TS&T –Enterprise AI Value Strategy - Manager",
      location: "Pune Division, Maharashtra, India",
    });
    // The en-dash must survive character-for-character, not get stripped
    // or treated as a field delimiter.
    expect(result!.role).toContain("–Enterprise");
  });

  it("works when the title line is preceded by other lines (freshness label, etc.) — checks the first several lines, not just line 1", () => {
    const text = `1 day ago\n${REAL_TITLE_LINE}\n\nFull job description follows...`;
    const result = extractLinkedInMetadataFromText(text);
    expect(result).toEqual({
      company: "Accenture in India",
      role: "S&C GN - TS&T –Enterprise AI Value Strategy - Manager",
      location: "Pune Division, Maharashtra, India",
    });
  });

  it("handles a company name that does NOT contain \" in \" (the common case)", () => {
    const result = extractLinkedInMetadataFromText("Anthropic hiring Product Manager in San Francisco, CA | LinkedIn");
    expect(result).toEqual({ company: "Anthropic", role: "Product Manager", location: "San Francisco, CA" });
  });

  it("falls back to the heading-block pattern when the title line isn't present", () => {
    const text = [
      "# Senior Product Manager",
      "Acme Corp",
      "San Francisco, CA, United States",
      "3 days ago · 200 applicants",
      "",
      "About the role...",
    ].join("\n");
    const result = extractLinkedInMetadataFromText(text);
    expect(result).toEqual({ role: "Senior Product Manager", company: "Acme Corp", location: "San Francisco, CA, United States" });
  });

  it("heading-block fallback also handles a single combined \"Company · Location\" line", () => {
    const text = ["# Staff Engineer", "Acme Corp · Remote", "Posted 1 week ago"].join("\n");
    const result = extractLinkedInMetadataFromText(text);
    expect(result).toEqual({ role: "Staff Engineer", company: "Acme Corp", location: "Remote" });
  });

  it("heading-block fallback skips relative-timestamp and applicant-count noise lines", () => {
    const text = ["# Data Analyst", "2 days ago", "50 applicants", "Beta Inc", "Austin, TX"].join("\n");
    const result = extractLinkedInMetadataFromText(text);
    expect(result).toEqual({ role: "Data Analyst", company: "Beta Inc", location: "Austin, TX" });
  });

  it("returns null when neither pattern matches", () => {
    expect(extractLinkedInMetadataFromText("Just some ordinary paragraph text with no structure at all.")).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(extractLinkedInMetadataFromText("")).toBeNull();
  });
});
