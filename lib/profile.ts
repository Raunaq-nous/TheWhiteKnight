import { getCache, wt_saveProfile } from "./data-cache";

export type ExperienceEntry = {
  id: string;
  company: string;
  role: string;
  tenure: string;
  location: string;
  current: boolean;
  bullets: string; // newline-separated, free-form
};

export type EducationEntry = {
  id: string;
  institution: string;
  degree: string;
  field: string;
  years: string;
  gpa?: string;
  achievements?: string;
};

export type ProjectEntry = {
  id: string;
  name: string;
  description: string;
  stack: string;
  outcomes: string;
  repoUrl?: string;
};

export type Publication = {
  id: string;
  title: string;
  publication: string;
  year: string;
  url?: string;
};

export type Certification = {
  id: string;
  name: string;
  issuer: string;
  date: string;
  relevance?: string;
};

export type RoleType =
  | "strategy-consulting"
  | "ai-tech"
  | "product"
  | "engineering"
  | "design"
  | "marketing"
  | "sales"
  | "finance"
  | "operations"
  | "data"
  | "research"
  | "creative"
  | "other";

export const ROLE_TYPES: { id: RoleType; label: string; description: string }[] = [
  { id: "strategy-consulting", label: "Strategy / Consulting", description: "MBB, biz ops, chief of staff, GTM strategy" },
  { id: "ai-tech", label: "AI / ML / Tech", description: "AI engineer, ML, applied research, frontier tech" },
  { id: "product", label: "Product", description: "PM, product lead, growth product" },
  { id: "engineering", label: "Software Engineering", description: "Backend, frontend, fullstack, infra, mobile" },
  { id: "design", label: "Design", description: "Brand, UX, UI, visual, product design" },
  { id: "marketing", label: "Marketing", description: "Brand, growth, content, performance, lifecycle" },
  { id: "sales", label: "Sales / BD", description: "AE, BD, partnerships, customer success" },
  { id: "finance", label: "Finance", description: "FP&A, IB, PE/VC, corporate development" },
  { id: "operations", label: "Operations", description: "Ops manager, supply chain, expansion, COO" },
  { id: "data", label: "Data / Analytics", description: "Data analyst, data scientist, BI" },
  { id: "research", label: "Research", description: "Academic, industry research, R&D" },
  { id: "creative", label: "Creative / Content", description: "Writer, editor, video, creative direction" },
  { id: "other", label: "Other / Multidisciplinary", description: "Hybrid, founder, polymath" },
];

export type Profile = {
  name: string;
  headline: string;
  email: string;
  secondaryEmail?: string;
  phone: string;
  location: string;
  locationsOpenTo: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  yearsOfExperience: string;
  roleType?: RoleType;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: Record<string, string>;
  projects: ProjectEntry[];
  publications: Publication[];
  certifications: Certification[];
  voiceNotes: string;
  createdAt: string;
  updatedAt: string;
};

export function getProfile(): Profile | null {
  return getCache().profile;
}

export function saveProfile(profile: Profile): void {
  wt_saveProfile(profile).catch(e => console.error("[CareerOS] saveProfile failed:", e));
}

export function hasProfile(): boolean {
  return getCache().profile !== null;
}

// Real admin profile lives in private/admin-profile.json (gitignored).
// Phase 1 data layer seeds from that file on first run if present.
// New users start from this empty template.
export function getSeedProfile(): Profile {
  return {
    name: "",
    headline: "",
    email: "",
    secondaryEmail: "",
    phone: "",
    location: "",
    locationsOpenTo: "",
    linkedin: "",
    github: "",
    portfolio: "",
    yearsOfExperience: "",
    experience: [],
    education: [],
    skills: {},
    projects: [],
    publications: [],
    certifications: [],
    voiceNotes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
