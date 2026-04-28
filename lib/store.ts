export type Application = {
  id: string;
  slug: string;
  company: string;
  role: string;
  location: string;
  remote: boolean;
  status: "sourced" | "reviewed" | "applied" | "interview" | "offer" | "rejected";
  score: number;
  bucket: string;
  sector: string;
  seniority: string;
  sourceUrl: string;
  capturedAt: string;
  jdRaw: string;
  jdParsed: any;
  nextAction: string;
  contacts: any[];
  interviews: any[];
  reminders: any[];
  resumeVersions: any[];
  notes: string;
  emailEvents: any[];
  createdAt: string;
  updatedAt: string;
  days?: number;
};

export type TargetBucket = {
  id: string;
  name: string;
  description: string;
  titlesMatch: string[];
  titlesExclude: string[];
  sectorsPreferred: string[];
  geographies: string[];
  keywordsRequired: string[];
  keywordsBoost: string[];
  targetCompanies: string[];
  seniority: string[];
  weight: number;
};

export function getApplications(): Application[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem("careeros_apps");
  if (!data) return [];
  try {
    const apps = JSON.parse(data);
    return apps.map((app: any) => ({
      ...app,
      days: Math.floor((Date.now() - new Date(app.capturedAt).getTime()) / (1000 * 60 * 60 * 24))
    }));
  } catch {
    return [];
  }
}

export function saveApplication(app: Application) {
  if (typeof window === "undefined") return;
  const apps = getApplications();
  const existingIndex = apps.findIndex(a => a.id === app.id);
  if (existingIndex >= 0) {
    apps[existingIndex] = app;
  } else {
    apps.push(app);
  }
  localStorage.setItem("careeros_apps", JSON.stringify(apps));
  window.dispatchEvent(new Event("careeros-data-change"));
}

export function generateSlug(company: string, role: string) {
  return `${company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${role.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

export function getApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("careeros_openai_key") || "";
}

export function setApiKey(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("careeros_openai_key", key);
}