// Settings for non-LLM integrations: contact discovery, email sending, job scanning.

export type IntegrationSettings = {
  exaApiKey?: string;
  apolloApiKey?: string;
  rocketreachApiKey?: string;
  hunterApiKey?: string;
  resendApiKey?: string;
  senderEmail?: string;
  senderName?: string;
};

const KEY = "careeros_integration_settings";
const DEFAULT: IntegrationSettings = {};

export function getIntegrationSettings(): IntegrationSettings {
  if (typeof window === "undefined") return DEFAULT;
  const raw = localStorage.getItem(KEY);
  if (!raw) return DEFAULT;
  try { return JSON.parse(raw); } catch { return DEFAULT; }
}

export function saveIntegrationSettings(s: IntegrationSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

export const INTEGRATION_OPTIONS = [
  {
    id: "exa",
    label: "Exa.ai (People & Job Search)",
    description: "Neural search for finding contacts on LinkedIn and jobs across all portals (Naukri, BAYT, NaukriGulf, company career pages).",
    pricing: "Free: 1,000 searches/month",
    keyField: "exaApiKey" as const,
    keyPlaceholder: "exa_...",
    keyLink: "https://dashboard.exa.ai/api-keys",
    required: false,
  },
  {
    id: "apollo",
    label: "Apollo.io (Contact Enrichment)",
    description: "Enriches a person's name + company → email, LinkedIn URL, role. Best free tier among all enrichment providers.",
    pricing: "Free: 50 mobile + unlimited email lookups/month",
    keyField: "apolloApiKey" as const,
    keyPlaceholder: "your-apollo-key",
    keyLink: "https://app.apollo.io/#/settings/integrations/api",
    required: false,
  },
  {
    id: "rocketreach",
    label: "RocketReach (Fallback Enrichment)",
    description: "Alternative contact enrichment if Apollo runs out of credits.",
    pricing: "Free: 5 lookups/month",
    keyField: "rocketreachApiKey" as const,
    keyPlaceholder: "your-rocketreach-key",
    keyLink: "https://rocketreach.co/api",
    required: false,
  },
  {
    id: "hunter",
    label: "Hunter.io (Email Verification)",
    description: "Verifies emails are deliverable before sending. Optional but recommended for cold email.",
    pricing: "Free: 25 verifications/month",
    keyField: "hunterApiKey" as const,
    keyPlaceholder: "your-hunter-key",
    keyLink: "https://hunter.io/api-keys",
    required: false,
  },
  {
    id: "resend",
    label: "Resend (Send Email)",
    description: "Required for one-click HM outreach and CEO cold email send. You'll need to verify your sender domain.",
    pricing: "Free: 3,000 emails/month, 100/day",
    keyField: "resendApiKey" as const,
    keyPlaceholder: "re_...",
    keyLink: "https://resend.com/api-keys",
    required: false,
  },
] as const;
