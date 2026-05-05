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

const PROFILE_KEY = "careeros_profile";

export function getProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function saveProfile(profile: Profile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }));
  window.dispatchEvent(new Event("careeros-profile-change"));
}

export function hasProfile(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(PROFILE_KEY);
}

export function getSeedProfile(): Profile {
  return {
    name: "Raunaq Rakesh",
    headline: "Strategy consultant and AI builder — 7+ years across MBB consulting, growth advisory, and entrepreneurship, with a working portfolio of agentic AI systems shipped into real engagements.",
    email: "raunaq1509@gmail.com",
    secondaryEmail: "raunaq6655@gmail.com",
    phone: "+91-7982271861",
    location: "Gurgaon, India",
    locationsOpenTo: "Mumbai, Bangalore, Dubai, Abu Dhabi, Doha, Remote",
    linkedin: "linkedin.com/in/raunaqrakesh",
    github: "github.com/Raunaq-nous",
    portfolio: "raunaq-nous.github.io/raunaq-portfolio/builds",
    yearsOfExperience: "7+",
    experience: [
      {
        id: "bain-2025",
        company: "Bain & Company",
        role: "Project Leader, Capital Projects & Infrastructure",
        tenure: "Jun 2025 – Present",
        location: "Gurgaon",
        current: true,
        bullets: `Led concept selection study for South American national O&G company: designed AI-augmented evaluation framework across financial, technical, and regulatory dimensions; structured C-suite decision document enabling investment commitment on a previously non-feasible project
Delivered multi-plant capital program strategy for North American nuclear utility: built decision model for running successful capital programs, designed governance and contractor selection framework, delivered board-level recommendation for a multi-billion-dollar program
Identified CapEx and OpEx optimization levers for utility-scale solar project: built investment-committee-ready P&L case for capital reallocation, produced IRR improvement roadmap and schedule interventions
Built and shipped integrated agentic AI platform: RAG-based document intelligence engine for contract and regulatory libraries, multi-agent automated workplan generator, AI financial and cost modeling engine, knowledge graph-linked schedule optimization platform, capital allocation opportunity trigger system. Stack: Python, LangChain, Streamlit.`
      },
      {
        id: "aranca-2022",
        company: "Aranca",
        role: "Engagement Lead, Growth Advisory",
        tenure: "Mar 2022 – Jun 2025",
        location: "Mumbai",
        current: false,
        bullets: `Primary client interface across 12+ mandates for Fortune 500 and PE-backed clients across EMEA and North America
Built Series A financial model for EMEA B2B marketplace facilitating multi-million-dollar raise; structured revenue projections, unit economics, and growth thesis across market segments
Developed multi-year long-range business plan for EMEA waste management firm covering infrastructure capex, supply chain transformation, and return profile
Designed tier-based carbon credits pricing model and GTM framework for North American tech firm using replacement-cost and market-benchmarking methodology
Structured commercial framework and return analysis for global port operator across APAC, Europe, and Africa bid advisory
Formulated M&A roadmap and transaction advisory enabling PE investment in global IT services firm
Full marketing strategy and RTD product launch plan for global alcohol beverage provider: consumer positioning, channel architecture, pricing, distributor model, market-by-market launch sequencing
Published in Economic Times and Dataquest`
      },
      {
        id: "evalueserve-2020",
        company: "Evalueserve",
        role: "Business Analyst, Insights & Intelligence",
        tenure: "Oct 2020 – Nov 2021",
        location: "Gurgaon",
        current: false,
        bullets: `Competitive intelligence for Fortune 1000 technology firms
EV charging infrastructure analysis and cloud compliance competitive intelligence
CPaaS/CCaaS GTM and product launch strategy for Indian telco
GSI partner digital readiness assessment for hyperscale cloud provider entering India: evaluated 10+ system integrators, produced tiered engagement model
Canadian public sector IT spend mapping using structured spend taxonomy`
      },
      {
        id: "tecnova-2019",
        company: "Tecnova India",
        role: "Strategy Analyst",
        tenure: "Jul 2019 – Oct 2020",
        location: "Gurgaon",
        current: false,
        bullets: `India market entry and operational strategy for global clients
$10B French conglomerate: India market entry across automotive, pharma, and consumer electronics simultaneously
US Metal Industry Association: market sizing using import-export data and demand-supply analysis
German automotive parts manufacturer: turnaround strategy and Voice of Customer research
Europe-based primary cell manufacturer: contract manufacturing partnership sourcing in India
Startup cosmetic brand: full business plan, financial model, and digital GTM strategy from zero`
      },
      {
        id: "delbomblr-2018",
        company: "Delbomblr Inc",
        role: "Business Consultant",
        tenure: "Feb 2018 – Jun 2019",
        location: "Delhi",
        current: false,
        bullets: ""
      },
      {
        id: "madcue-2015",
        company: "Madcue",
        role: "Co-founder",
        tenure: "Jun 2015 – Jan 2018",
        location: "Bangalore",
        current: false,
        bullets: `Founded digital media and creator economy platform; scaled to 150+ creators and 70K monthly viewers
3x social following growth in 8 months via PPC campaigns across Facebook and Google
Exclusive interviews with globally recognized creators including Gavin Aung Than, Abhilash Tomy, Tashi Malik
Owned product, technology, operations, and growth in full-founder capacity; built and managed creator GTM and audience monetization model`
      }
    ],
    education: [
      {
        id: "mit-2016",
        institution: "Manipal Institute of Technology",
        degree: "B.Tech",
        field: "Mechanical Engineering",
        years: "2012 – 2016",
        gpa: "8.0 / 10.0",
        achievements: `ADCS Subsystem Head, Parikshit Student Satellite Team (ISRO-guided): developed control mechanism for nano-satellite at 28,800 km/hr
Presented at IEEE Aerospace Conference, Big Sky, Montana, USA`
      }
    ],
    skills: {
      "AI & Machine Learning": "AI Agents, Vector Databases, Retrieval-Augmented Generation (RAG), Agentic AI, Multi-agent LLMs, Knowledge Graphs, LangChain, Prompt Engineering",
      "Strategy & Consulting": "Market Research, GTM Strategy, Financial Modeling, Data Analysis, Business Development, Strategic Initiatives, Commercial Due Diligence, M&A Advisory, Capital Strategy, Pricing Strategy",
      "Technical": "Python, TypeScript, JavaScript, SQL, Next.js, React, FastAPI, Streamlit, D3.js, Tableau, Advanced Excel",
      "Infrastructure": "GitHub, GitHub Actions, GitHub Pages, Vercel, Anthropic API, Claude Code"
    },
    projects: [
      {
        id: "careeros",
        name: "CareerOS (TheWhiteKnight)",
        description: "Personal AI command center that ingests job descriptions, scores them against target profiles, generates tailored materials in my voice, drafts founder and colleague outreach, tracks the entire pipeline, and learns preferences over time.",
        stack: "Next.js, TypeScript, GitHub Pages, GitHub Actions, Anthropic API",
        outcomes: "Live at raunaq-nous.github.io/TheWhiteKnight",
        repoUrl: "github.com/Raunaq-nous/TheWhiteKnight"
      },
      {
        id: "rag-engine",
        name: "Document Intelligence Engine",
        description: "RAG-based document intelligence engine for natural language retrieval across large contract and regulatory libraries; replaces manual document search with structured, source-cited query responses.",
        stack: "Python, LangChain, Vector Databases, Streamlit",
        outcomes: "Deployed in live consulting engagements at Bain & Company",
        repoUrl: "github.com/Raunaq-nous/Universal-RAG"
      },
      {
        id: "workplan-gen",
        name: "Multi-agent Workplan Generator",
        description: "Multi-agent LLM workplan generator that automates project schedule logic from a brief; uses chained LLM reasoning to build structured workplans with tasks, dependencies, owners, and milestones, then checks outputs for consistency across agents.",
        stack: "Python, LangChain, Multi-agent orchestration",
        outcomes: "Used in first week of consulting engagements to accelerate project kickoff",
        repoUrl: ""
      },
      {
        id: "financial-modeling",
        name: "AI Financial Modeling and Scenario Engine",
        description: "AI financial modeling and scenario comparison engine enabling real-time CapEx, OpEx, and IRR analysis across multiple project concepts simultaneously; applied in live client engagements to accelerate commercial decision-making.",
        stack: "Python, LangChain, Agentic financial modeling",
        outcomes: "Applied in O&G concept selection and solar performance improvement engagements",
        repoUrl: "github.com/Raunaq-nous/Financial_Modelling_Final_Version1"
      },
      {
        id: "schedule-opt",
        name: "Knowledge Graph-linked Schedule Optimization Platform",
        description: "Knowledge graph-linked schedule optimization platform for EPC and construction projects; integrates schedule, cost, and dependency data into a single optimization layer with visual exploration.",
        stack: "React, FastAPI, D3.js, Knowledge Graphs",
        outcomes: "Used for large capital program optimization at Bain & Company",
        repoUrl: "github.com/Raunaq-nous/Schedule_Optimization_Version_1"
      },
      {
        id: "capital-watcher",
        name: "Capital Allocation Opportunity Trigger System",
        description: "Capital allocation opportunity trigger mapping tool that analyzes capital allocation portfolios to identify reallocation signals and account growth opportunities.",
        stack: "Python, LangChain, Monitoring frameworks",
        outcomes: "Enables continuous portfolio monitoring vs traditional quarterly review cycles",
        repoUrl: "github.com/Raunaq-nous/Capital-Projects-Watcher"
      },
      {
        id: "ai-consulting-platform",
        name: "AI-first Strategy Consulting Platform",
        description: "AI-first strategy consulting platform with 12+ purpose-built tools across Strategy, Operations, Finance, Analytics, and Innovation; features a natural language console for business problem-solving, agentic tool orchestration, and an AI-enhanced consulting framework library.",
        stack: "Next.js 14+, TypeScript, Tailwind CSS, Anthropic API, Multi-agent orchestration",
        outcomes: "12+ AI-powered tools built and operational for internal consulting use",
        repoUrl: ""
      },
      {
        id: "survey-intelligence",
        name: "AI Survey Intelligence Platform",
        description: "End-to-end survey lifecycle automation: questionnaire design, distribution, response analysis, and insight synthesis. Automates the full research lifecycle from question design through executive-ready analysis.",
        stack: "Python, AI agents, LLM integrations, Research automation",
        outcomes: "Full research lifecycle automated from design to synthesis",
        repoUrl: "github.com/Raunaq-nous/Survey-Tool"
      },
      {
        id: "solar-benchmarking",
        name: "Solar Project Benchmarking Tool",
        description: "Benchmarks solar project performance — generation, costs, equipment degradation, O&M — against comparable projects for utility-scale project diagnostics.",
        stack: "Python, Data analysis, Energy modeling",
        outcomes: "Cross-project benchmarking for utility-scale solar project performance",
        repoUrl: "github.com/Raunaq-nous/Solar-Project-Benchmarking"
      },
      {
        id: "proposal-builder",
        name: "AI Proposal Builder",
        description: "Generates structured commercial proposals — executive summary, scope, methodology, timeline, pricing terms — from a brief. Automates the structured generation of consulting proposals from engagement context.",
        stack: "Python, LangChain, Document generation",
        outcomes: "Consulting proposal authoring time cut from days to hours",
        repoUrl: "github.com/Raunaq-nous/Proposal-Builder"
      },
      {
        id: "solar-cost-modeling",
        name: "Solar PV Cost Modeling System",
        description: "Multi-agent solar PV cost modeling system for utility-scale project economics; interactive real-time UI for CapEx and OpEx analysis across project scenarios.",
        stack: "Python, Multi-agent frameworks, Interactive UI",
        outcomes: "Domain-specific cost modeling for solar project CapEx and OpEx analysis",
        repoUrl: "github.com/Raunaq-nous/Solar-Cost-Modelling"
      }
    ],
    publications: [
      {
        id: "pub-1",
        title: "Mechanism, Ensuing Dynamics and Control of a Polar Low-Earth Orbit Tethered Nano-Satellite",
        publication: "IEEE",
        year: "2016",
        url: ""
      },
      {
        id: "pub-2",
        title: "Dynamics and Control System Design of a Polar Low-Earth Orbit Nano-Satellite 'Parikshit'",
        publication: "IEEE",
        year: "2015",
        url: ""
      },
      {
        id: "pub-3",
        title: "Software in Loop Test Setup for a Tethered Satellite",
        publication: "IEEE",
        year: "2015",
        url: ""
      },
      {
        id: "pub-4",
        title: "Control System Design to Counter the Effect of Tether Ejection System on a Nano-satellite",
        publication: "IEEE",
        year: "2015",
        url: ""
      },
      {
        id: "pub-5",
        title: "Earthquake Stabilization Using Active Control — Structural Dynamics",
        publication: "IJERT",
        year: "2014",
        url: ""
      }
    ],
    certifications: [
      { id: "c1",  name: "Agent Skills with Anthropic", issuer: "Anthropic",           date: "Mar 2026", relevance: "AI/agentic roles" },
      { id: "c2",  name: "AI Engineering",               issuer: "IBM",                 date: "",         relevance: "AI/product roles" },
      { id: "c3",  name: "Vector Databases for RAG",     issuer: "LinkedIn Learning",   date: "",         relevance: "AI/data roles" },
      { id: "c4",  name: "Build RAG Applications",       issuer: "LinkedIn Learning",   date: "",         relevance: "AI/data roles" },
      { id: "c5",  name: "Agentic AI",                   issuer: "",                    date: "",         relevance: "AI/agentic roles" },
      { id: "c6",  name: "Intro to Large Language Models",issuer: "",                   date: "",         relevance: "AI/data roles" },
      { id: "c7",  name: "Business & Financial Modeling", issuer: "Wharton (Coursera)", date: "",         relevance: "Strategy and finance roles" },
      { id: "c8",  name: "Business Strategy",            issuer: "Wharton (Coursera)",  date: "",         relevance: "Strategy roles" },
      { id: "c9",  name: "CS50 Python",                  issuer: "Harvard (edX)",       date: "",         relevance: "Technical roles" },
      { id: "c10", name: "Introduction to Git and GitHub",issuer: "Google",             date: "",         relevance: "Technical roles" },
      { id: "c11", name: "Tableau Business Intelligence", issuer: "Tableau",            date: "",         relevance: "Data and analytics roles" },
      { id: "c12", name: "Venture Capital Analyst Fundamentals", issuer: "",            date: "",         relevance: "VC, investment, fintech roles" },
      { id: "c13", name: "Introduction to IT & Cybersecurity", issuer: "",              date: "",         relevance: "Technical roles" }
    ],
    voiceNotes: `WRITING STYLE: Direct, specific, non-corporate. Short declarative openers, longer connective middles. Lead with the substantive claim, then the evidence.

OPENING PATTERNS:
- "[X] years of [domain] work across [companies] have been spent doing exactly what this role asks for: [specific behavior]"
- "What makes this role interesting specifically is [the hard part of the job]"
- "The AI builds are live and working. [Concrete enumeration]."

FIRST PRINCIPLES: Woven naturally as "Approaches every engagement from first principles, breaking each problem back to its economic fundamentals before reaching for frameworks"

NEVER USE: em dashes, "excited to apply", "passionate about", "synergy", "leverage" as verb, "cutting-edge", "innovative solutions", "self-starter", "proven track record", "consumer-facing"

TONE BY AUDIENCE:
- MBB/strategy roles: more formal, structured, less first-person
- AI/product roles: direct, confident about builds, lead with concrete proof
- Chief of Staff: warmer, more about partnership and trust
- VC/fintech: acknowledge domain gap honestly, lead with transferable mechanics`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
