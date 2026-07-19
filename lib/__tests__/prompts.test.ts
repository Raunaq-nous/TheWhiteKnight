import { describe, it, expect } from "vitest";
import type { Profile } from "../profile";
import type { Application } from "../store";
import { afScoringPrompt, resumePrompt, coverLetterPrompt } from "../prompts";

// Minimal deterministic mocks — stable inputs make stable snapshots.

const MOCK_PROFILE: Profile = {
  name: "Alex Chen",
  headline: "AI Product Manager with 7 years building ML-powered products",
  email: "alex@example.com",
  phone: "+1 555 0100",
  location: "San Francisco, CA",
  locationsOpenTo: "Remote, NYC",
  linkedin: "https://linkedin.com/in/alexchen",
  github: "https://github.com/alexchen",
  portfolio: undefined,
  yearsOfExperience: "7",
  roleType: "product",
  experience: [
    {
      id: "e1",
      company: "Acme AI",
      role: "Senior Product Manager",
      tenure: "2021 - Present",
      location: "San Francisco, CA",
      current: true,
      bullets: "Led 0-to-1 launch of AI recommendation engine, increasing user engagement by 32%\nManaged 3 cross-functional teams across eng, design, and data",
    },
    {
      id: "e2",
      company: "DataCo",
      role: "Product Manager",
      tenure: "2018 - 2021",
      location: "New York, NY",
      current: false,
      bullets: "Shipped data pipeline product serving 200+ enterprise customers\nReduced churn by 18% through targeted onboarding improvements",
    },
  ],
  education: [
    {
      id: "ed1",
      institution: "MIT",
      degree: "B.S.",
      field: "Computer Science",
      years: "2014 - 2018",
    },
  ],
  skills: {
    "Product": "Roadmapping, PRD writing, A/B testing, user research",
    "Technical": "SQL, Python, LLM APIs, data pipelines",
  },
  projects: [
    {
      id: "p1",
      name: "AutoEval",
      description: "Open-source LLM evaluation harness",
      stack: "Python, OpenAI API",
      outcomes: "500+ GitHub stars",
      repoUrl: "https://github.com/alexchen/autoeval",
    },
    {
      id: "p2",
      name: "ResumeAI",
      description: "AI resume tailoring tool",
      stack: "Next.js, Claude API",
      outcomes: "1000+ users",
    },
  ],
  publications: [],
  certifications: [],
  voiceNotes: "Direct, data-driven tone. Lead with numbers. No buzzwords.",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const MOCK_APP: Application = {
  id: "app1",
  slug: "openai-product-manager",
  company: "OpenAI",
  role: "Product Manager, API Platform",
  location: "San Francisco, CA",
  remote: false,
  status: "sourced",
  score: 0,
  bucket: "ai-tech-pm",
  bucketName: "AI / Technical PM",
  sector: "ai-emerging",
  seniority: "senior",
  sourceUrl: "https://openai.com/careers",
  capturedAt: "2025-01-01T00:00:00.000Z",
  jdRaw: "We are looking for a Senior PM to lead our API Platform...",
  jdParsed: {
    keyRequirements: ["5+ years PM experience", "Technical background", "API product experience"],
    technicalSkills: ["REST APIs", "Python", "LLMs"],
    softSkills: ["Communication", "Cross-functional leadership"],
    yearsExperienceRequired: 5,
    redFlags: [],
    keywords: ["API", "platform", "LLM", "product management", "technical PM"],
  },
  nextAction: "",
  contacts: [],
  interviews: [],
  reminders: [],
  resumeVersions: [],
  notes: "",
  emailEvents: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const MOCK_BUCKETS = [
  { id: "ai-tech-pm", name: "AI / Technical PM", description: "Product roles at AI-first companies requiring technical depth" },
  { id: "strategy", name: "Strategy / Consulting", description: "Strategy and operations roles at top firms" },
];

const MOCK_META = {
  company: "OpenAI",
  role: "Product Manager, API Platform",
  location: "San Francisco, CA",
  seniority: "senior",
  sector: "ai-emerging",
  remote: false,
};

describe("prompt builder snapshots", () => {
  it("afScoringPrompt matches snapshot", () => {
    const output = afScoringPrompt(MOCK_PROFILE, MOCK_APP.jdRaw, MOCK_META, MOCK_BUCKETS);
    expect(output).toMatchSnapshot();
  });

  it("resumePrompt matches snapshot", () => {
    const output = resumePrompt(MOCK_PROFILE, MOCK_APP, "product");
    expect(output).toMatchSnapshot();
  });

  it("coverLetterPrompt matches snapshot", () => {
    const output = coverLetterPrompt(MOCK_PROFILE, MOCK_APP);
    expect(output).toMatchSnapshot();
  });

  // Sanity checks — verify prompts contain the expected content
  it("afScoringPrompt includes candidate name and company", () => {
    const output = afScoringPrompt(MOCK_PROFILE, MOCK_APP.jdRaw, MOCK_META, MOCK_BUCKETS);
    expect(output).toContain("Alex Chen");
    expect(output).toContain("OpenAI");
  });

  it("afScoringPrompt includes bucket names", () => {
    const output = afScoringPrompt(MOCK_PROFILE, MOCK_APP.jdRaw, MOCK_META, MOCK_BUCKETS);
    expect(output).toContain("AI / Technical PM");
    expect(output).toContain("Strategy / Consulting");
  });

  it("resumePrompt includes all experience entries", () => {
    const output = resumePrompt(MOCK_PROFILE, MOCK_APP, "product");
    expect(output).toContain("Acme AI");
    expect(output).toContain("DataCo");
  });

  it("resumePrompt includes anti-hallucination rules", () => {
    const output = resumePrompt(MOCK_PROFILE, MOCK_APP, "product");
    expect(output).toContain("ANTI-HALLUCINATION RULES");
  });

  it("resumePrompt applies archetype-specific section order and rules", () => {
    const consulting = resumePrompt(MOCK_PROFILE, MOCK_APP, "consulting");
    expect(consulting).toContain("summary -> keyWins -> projects -> experience -> education -> skills");
    expect(consulting).toContain("KEY WINS");
    expect(consulting).toContain("role-specific elevator pitch");

    const ib = resumePrompt(MOCK_PROFILE, MOCK_APP, "finance_ib");
    expect(ib).toContain("Do NOT include a summary for this archetype");
    expect(ib).toContain("education -> experience -> skills");
    expect(ib).not.toContain("KEY WINS");
  });

  it("resumePrompt requires JD priority extraction before writing", () => {
    const output = resumePrompt(MOCK_PROFILE, MOCK_APP, "consulting");
    expect(output).toContain("TARGET PRIORITIES");
    expect(output).toContain("targetPriorities");
    expect(output).toContain("SELECT AND FOREGROUND");
  });

  it("resumePrompt puts links in a links array, not the contact line", () => {
    const output = resumePrompt(MOCK_PROFILE, MOCK_APP, "consulting");
    expect(output).toContain('"links"');
    expect(output).toContain("email | phone | location");
  });

  it("resumePrompt instructs JSON output with bullet priority ranking", () => {
    const output = resumePrompt(MOCK_PROFILE, MOCK_APP, "ai_ml_engineering");
    expect(output).toContain("BULLET PRIORITY");
    expect(output).toContain('"priority": number');
  });

  it("coverLetterPrompt includes no em dashes rule", () => {
    const output = coverLetterPrompt(MOCK_PROFILE, MOCK_APP);
    expect(output).toContain("No em dashes");
  });
});
