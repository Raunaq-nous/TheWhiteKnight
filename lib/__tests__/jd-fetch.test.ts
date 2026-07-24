import { describe, it, expect } from "vitest";
import { htmlToText, extractJobPostingFromLdJson } from "../jd-fetch";

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
