export interface Application {
  slug: string;
  company: string;
  role: string;
  location: string;
  status: "sourced" | "reviewed" | "applied" | "interview" | "offer" | "rejected";
  score: number;
  days: number;
  bucket: string;
  remote: boolean;
  source: string;
  capturedAt: string;
  nextAction: string;
  contacts: string[];
}

export const STATUSES = ["sourced", "reviewed", "applied", "interview", "offer", "rejected"] as const;

export const BUCKETS = ["MBB Strategy", "AI Product", "Chief of Staff", "Strategy Ops"] as const;

export const applications: Application[] = [
  {
    slug: "bain-project-leader",
    company: "Bain & Company",
    role: "Project Leader",
    location: "Gurgaon",
    status: "interview",
    score: 9.2,
    days: 5,
    bucket: "MBB Strategy",
    remote: false,
    source: "linkedin.com/jobs/view/3847291",
    capturedAt: "2026-04-22",
    nextAction: "Second round, Tuesday 29 Apr",
    contacts: ["Priya Mehta, Recruiter"]
  },
  {
    slug: "talabat-senior-pm-ai",
    company: "Talabat",
    role: "Sr Product Manager, AI",
    location: "Dubai",
    status: "applied",
    score: 8.5,
    days: 12,
    bucket: "AI Product",
    remote: false,
    source: "greenhouse.io/talabat/jobs/4829",
    capturedAt: "2026-04-15",
    nextAction: "Awaiting response",
    contacts: []
  },
  {
    slug: "careem-chief-of-staff",
    company: "Careem",
    role: "Chief of Staff",
    location: "Dubai",
    status: "sourced",
    score: 7.8,
    days: 2,
    bucket: "Chief of Staff",
    remote: true,
    source: "careem.com/careers",
    capturedAt: "2026-04-25",
    nextAction: "Review JD, decide to tailor",
    contacts: []
  },
  {
    slug: "mckinsey-associate-partner",
    company: "McKinsey",
    role: "Associate Partner, Digital",
    location: "Riyadh",
    status: "reviewed",
    score: 8.9,
    days: 3,
    bucket: "MBB Strategy",
    remote: false,
    source: "mckinsey.com/careers",
    capturedAt: "2026-04-24",
    nextAction: "Tailor materials",
    contacts: ["Ahmed Al-Rashid, Partner"]
  },
  {
    slug: "noon-vp-strategy",
    company: "Noon",
    role: "VP Strategy & Operations",
    location: "Dubai",
    status: "applied",
    score: 7.2,
    days: 18,
    bucket: "Strategy Ops",
    remote: false,
    source: "noon.com/careers",
    capturedAt: "2026-04-09",
    nextAction: "Follow up if no response by 30 Apr",
    contacts: ["Faraz Khan, Talent"]
  },
  {
    slug: "bcg-principal-ai",
    company: "BCG",
    role: "Principal, AI & Analytics",
    location: "Mumbai",
    status: "interview",
    score: 9.0,
    days: 8,
    bucket: "MBB Strategy",
    remote: false,
    source: "linkedin.com/jobs/view/3851002",
    capturedAt: "2026-04-19",
    nextAction: "Case interview prep, 30 Apr",
    contacts: ["Siddharth Rao, Recruiter", "Ananya Verma, Principal"]
  },
  {
    slug: "swiggy-director-strategy",
    company: "Swiggy",
    role: "Director of Strategy",
    location: "Bangalore",
    status: "sourced",
    score: 6.5,
    days: 1,
    bucket: "Strategy Ops",
    remote: false,
    source: "linkedin.com/jobs/view/3855102",
    capturedAt: "2026-04-26",
    nextAction: "Review JD",
    contacts: []
  },
  {
    slug: "oyo-head-product-ai",
    company: "OYO",
    role: "Head of Product, AI",
    location: "Gurgaon",
    status: "rejected",
    score: 7.1,
    days: 30,
    bucket: "AI Product",
    remote: false,
    source: "oyo.com/careers",
    capturedAt: "2026-03-28",
    nextAction: "Request feedback email",
    contacts: ["Ritesh Agarwal, HR"]
  },
  {
    slug: "stripe-strategy-ops-apac",
    company: "Stripe",
    role: "Strategy & Ops Lead, APAC",
    location: "Singapore",
    status: "offer",
    score: 8.8,
    days: 22,
    bucket: "Strategy Ops",
    remote: true,
    source: "stripe.com/jobs/5291",
    capturedAt: "2026-04-05",
    nextAction: "Negotiation call 28 Apr",
    contacts: ["Julia Chen, Hiring Manager", "David Kim, Recruiter"]
  },
  {
    slug: "anthropic-pm-api",
    company: "Anthropic",
    role: "Product Manager, API",
    location: "SF Remote",
    status: "applied",
    score: 9.5,
    days: 6,
    bucket: "AI Product",
    remote: true,
    source: "anthropic.com/careers",
    capturedAt: "2026-04-21",
    nextAction: "Awaiting response",
    contacts: []
  }
];