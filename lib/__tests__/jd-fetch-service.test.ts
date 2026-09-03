import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchJdText } from "../server/services/jd-fetch-service";

describe("fetchJdText", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an error for an invalid URL", async () => {
    const result = await fetchJdText("::not a url::");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("uses Exa when an exaApiKey is supplied for a LinkedIn URL", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ text: "Full LinkedIn job text" }] }),
    });

    const result = await fetchJdText("https://www.linkedin.com/jobs/view/123", "exa-key");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("exa");
      expect(result.text).toBe("Full LinkedIn job text");
    }
    expect(fetchMock).toHaveBeenCalledWith("https://api.exa.ai/contents", expect.anything());
  });

  // BUG regression: Exa's "text: true" mode returns rendered page text, not
  // raw HTML, so extractJobPostingFromLdJson (which needs a
  // <script type="application/ld+json"> block to scan) never runs on this
  // path at all — the real reported failure. Company/role/location must
  // come from the deterministic text-metadata fallback instead.
  it("extracts company/role/location from Exa-sourced LinkedIn text via the text-metadata fallback (the real reported bug)", async () => {
    const exaText =
      "1 day ago\nAccenture in India hiring S&C GN - TS&T –Enterprise AI Value Strategy - Manager in Pune Division, Maharashtra, India | LinkedIn\n\nFull JD body...";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [{ text: exaText }] }) });

    const result = await fetchJdText("https://www.linkedin.com/jobs/view/4450769484/", "exa-key");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("exa");
      expect(result.company).toBe("Accenture in India");
      expect(result.role).toBe("S&C GN - TS&T –Enterprise AI Value Strategy - Manager");
      expect(result.location).toBe("Pune Division, Maharashtra, India");
    }
  });

  it("does not attempt LinkedIn metadata extraction for a non-LinkedIn URL (Exa is LinkedIn-only, so this falls straight through to a direct fetch)", async () => {
    const html = "<div>Some company hiring Some Role in Some City | LinkedIn" + " Long enough job description text.".repeat(10) + "</div>";
    fetchMock.mockResolvedValue({ ok: true, text: async () => html });
    const result = await fetchJdText("https://example.com/careers/job-1", "exa-key");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("direct");
      expect(result.company).toBeUndefined();
    }
  });

  it("falls back to direct fetch + ld+json extraction for LinkedIn without a key, and forwards title/company/location (previously silently dropped)", async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting", title: "PM", description: "Own the roadmap.",
      hiringOrganization: { name: "Acme" },
      jobLocation: { address: { addressLocality: "Remote" } },
    })}</script>`;
    fetchMock.mockResolvedValue({ ok: true, text: async () => html });

    const result = await fetchJdText("https://www.linkedin.com/jobs/view/456");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("direct");
      expect(result.text).toContain("Job Title: PM");
      expect(result.text).toContain("Company: Acme");
      expect(result.company).toBe("Acme");
      expect(result.role).toBe("PM");
      expect(result.location).toBe("Remote");
    }
  });

  it("falls back to text-metadata extraction on a direct LinkedIn fetch with no ld+json block", async () => {
    const html = "<div>Accenture in India hiring S&C GN Manager in Pune, India | LinkedIn</div><div>" + "Full JD body text here. ".repeat(10) + "</div>";
    fetchMock.mockResolvedValue({ ok: true, text: async () => html });

    const result = await fetchJdText("https://www.linkedin.com/jobs/view/789");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("direct");
      expect(result.company).toBe("Accenture in India");
      expect(result.role).toBe("S&C GN Manager");
      expect(result.location).toBe("Pune, India");
    }
  });

  it("returns a friendly error for a 401/403 LinkedIn response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    const result = await fetchJdText("https://www.linkedin.com/jobs/view/789");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.error).toContain("LinkedIn requires login");
    }
  });

  it("returns generic HTML text for a non-LinkedIn page", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "<div>" + "Long enough job description text. ".repeat(10) + "</div>" });
    const result = await fetchJdText("https://example.com/careers/job-1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.source).toBe("direct");
  });

  it("errors when the page content is too short", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "<div>short</div>" });
    const result = await fetchJdText("https://example.com/careers/job-2");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("too short");
  });
});
