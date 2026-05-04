// Default company target list. Tagged by region, sector, and ATS platform.
// Users can toggle, remove, or add custom companies via /config.

export type Region = "global" | "middle-east" | "apac" | "india" | "north-america" | "europe";
export type Sector = "consulting" | "big-tech-strategy" | "ai-emerging" | "fintech" | "ecommerce" | "investment" | "industry";
export type ATSPlatform = "greenhouse" | "ashby" | "lever" | "workday" | "smartrecruiters" | "custom";

export type CompanyTarget = {
  id: string;
  name: string;
  region: Region[];
  sector: Sector;
  ats: ATSPlatform;
  atsTenant?: string;
  careersUrl: string;
  enabled: boolean;
};

// Tier 1: Top global consulting (MBB + adjacent)
const CONSULTING_GLOBAL: CompanyTarget[] = [
  { id: "mckinsey", name: "McKinsey & Company", region: ["global", "middle-east", "apac", "india"], sector: "consulting", ats: "workday", careersUrl: "https://www.mckinsey.com/careers", enabled: true },
  { id: "bcg", name: "Boston Consulting Group", region: ["global", "middle-east", "apac", "india"], sector: "consulting", ats: "custom", careersUrl: "https://careers.bcg.com", enabled: true },
  { id: "bain", name: "Bain & Company", region: ["global", "middle-east", "apac", "india"], sector: "consulting", ats: "workday", careersUrl: "https://www.bain.com/careers", enabled: true },
  { id: "kearney", name: "Kearney", region: ["global", "middle-east", "apac", "india"], sector: "consulting", ats: "workday", careersUrl: "https://www.kearney.com/careers", enabled: true },
  { id: "oliver-wyman", name: "Oliver Wyman", region: ["global", "middle-east", "apac"], sector: "consulting", ats: "workday", careersUrl: "https://www.oliverwyman.com/careers.html", enabled: true },
  { id: "strategy-and", name: "Strategy& (PwC)", region: ["global", "middle-east", "apac", "india"], sector: "consulting", ats: "workday", careersUrl: "https://www.strategyand.pwc.com/careers", enabled: true },
  { id: "roland-berger", name: "Roland Berger", region: ["global", "middle-east", "apac"], sector: "consulting", ats: "smartrecruiters", careersUrl: "https://www.rolandberger.com/en/Careers", enabled: true },
  { id: "lek", name: "L.E.K. Consulting", region: ["global", "apac", "india"], sector: "consulting", ats: "workday", careersUrl: "https://www.lek.com/careers", enabled: true },
  { id: "accenture-strategy", name: "Accenture Strategy", region: ["global", "middle-east", "apac", "india"], sector: "consulting", ats: "workday", careersUrl: "https://www.accenture.com/us-en/careers", enabled: true },
  { id: "deloitte-monitor", name: "Deloitte Monitor / S&O", region: ["global", "middle-east", "apac", "india"], sector: "consulting", ats: "workday", careersUrl: "https://www2.deloitte.com/us/en/pages/careers/topics/careers.html", enabled: true },
  { id: "ey-parthenon", name: "EY-Parthenon", region: ["global", "middle-east", "apac", "india"], sector: "consulting", ats: "workday", careersUrl: "https://www.ey.com/en_us/careers", enabled: true },
  { id: "kpmg-strategy", name: "KPMG Strategy", region: ["global", "middle-east", "apac", "india"], sector: "consulting", ats: "workday", careersUrl: "https://home.kpmg/xx/en/home/careers.html", enabled: true },
  { id: "alvarez-marsal", name: "Alvarez & Marsal", region: ["global", "middle-east", "apac"], sector: "consulting", ats: "workday", careersUrl: "https://www.alvarezandmarsal.com/careers", enabled: true },
  { id: "fti-consulting", name: "FTI Consulting", region: ["global", "middle-east"], sector: "consulting", ats: "workday", careersUrl: "https://www.fticonsulting.com/careers", enabled: true },
  { id: "zs-associates", name: "ZS Associates", region: ["global", "india"], sector: "consulting", ats: "workday", careersUrl: "https://www.zs.com/careers", enabled: true },
];

// Middle East regional
const CONSULTING_ME: CompanyTarget[] = [
  { id: "elixirr", name: "Elixirr", region: ["middle-east", "europe"], sector: "consulting", ats: "custom", careersUrl: "https://elixirr.com/careers", enabled: true },
  { id: "redseer-me", name: "Redseer Strategy Consultants", region: ["middle-east", "india"], sector: "consulting", ats: "custom", careersUrl: "https://redseer.com/careers", enabled: true },
  { id: "tamayyaz", name: "Tamayyaz Advisory", region: ["middle-east"], sector: "consulting", ats: "custom", careersUrl: "https://www.tamayyaz.com", enabled: true },
  { id: "arthur-d-little-me", name: "Arthur D. Little ME", region: ["middle-east"], sector: "consulting", ats: "custom", careersUrl: "https://www.adlittle.com/en/careers", enabled: true },
  { id: "bcg-x-me", name: "BCG X (Middle East)", region: ["middle-east"], sector: "consulting", ats: "custom", careersUrl: "https://www.bcg.com/x", enabled: true },
];

// APAC regional consulting
const CONSULTING_APAC: CompanyTarget[] = [
  { id: "drshac-apac", name: "Dr. Schar APAC", region: ["apac"], sector: "consulting", ats: "custom", careersUrl: "https://www.dr-schar.com/careers", enabled: false },
  { id: "monitor-deloitte-apac", name: "Monitor Deloitte APAC", region: ["apac"], sector: "consulting", ats: "workday", careersUrl: "https://www2.deloitte.com/sg/en/pages/careers", enabled: true },
  { id: "yamasa-apac", name: "Frost & Sullivan APAC", region: ["apac"], sector: "consulting", ats: "custom", careersUrl: "https://www.frost.com/careers", enabled: true },
];

// India regional consulting
const CONSULTING_INDIA: CompanyTarget[] = [
  { id: "redseer", name: "Redseer Strategy Consultants", region: ["india"], sector: "consulting", ats: "custom", careersUrl: "https://redseer.com/careers", enabled: true },
  { id: "praxis-india", name: "Praxis Global Alliance", region: ["india"], sector: "consulting", ats: "custom", careersUrl: "https://www.praxisga.com/careers", enabled: true },
  { id: "avalon-consulting", name: "Avalon Consulting", region: ["india"], sector: "consulting", ats: "custom", careersUrl: "https://www.consultavalon.com/careers", enabled: true },
  { id: "frost-sullivan-in", name: "Frost & Sullivan India", region: ["india"], sector: "consulting", ats: "custom", careersUrl: "https://www.frost.com/careers", enabled: true },
  { id: "everest-group", name: "Everest Group", region: ["india", "global"], sector: "consulting", ats: "custom", careersUrl: "https://www.everestgrp.com/careers", enabled: true },
];

// Big Tech with Strategy / S&O / BizOps roles
const BIG_TECH: CompanyTarget[] = [
  { id: "google", name: "Google (Strategy & Ops)", region: ["global", "middle-east", "apac", "india"], sector: "big-tech-strategy", ats: "custom", careersUrl: "https://careers.google.com", enabled: true },
  { id: "meta", name: "Meta", region: ["global", "apac", "india"], sector: "big-tech-strategy", ats: "custom", careersUrl: "https://www.metacareers.com", enabled: true },
  { id: "amazon", name: "Amazon (WW Strategy)", region: ["global", "middle-east", "apac", "india"], sector: "big-tech-strategy", ats: "custom", careersUrl: "https://www.amazon.jobs", enabled: true },
  { id: "microsoft", name: "Microsoft", region: ["global", "middle-east", "apac", "india"], sector: "big-tech-strategy", ats: "custom", careersUrl: "https://careers.microsoft.com", enabled: true },
  { id: "apple", name: "Apple", region: ["global", "apac", "india"], sector: "big-tech-strategy", ats: "custom", careersUrl: "https://www.apple.com/careers", enabled: true },
  { id: "salesforce", name: "Salesforce", region: ["global", "apac", "india"], sector: "big-tech-strategy", ats: "workday", careersUrl: "https://salesforce.wd1.myworkdayjobs.com/External_Career_Site", enabled: true },
  { id: "stripe", name: "Stripe", region: ["global", "apac"], sector: "big-tech-strategy", ats: "greenhouse", atsTenant: "stripe", careersUrl: "https://stripe.com/jobs", enabled: true },
  { id: "uber", name: "Uber", region: ["global", "middle-east", "apac", "india"], sector: "big-tech-strategy", ats: "greenhouse", atsTenant: "uber", careersUrl: "https://www.uber.com/careers", enabled: true },
  { id: "airbnb", name: "Airbnb", region: ["global", "apac"], sector: "big-tech-strategy", ats: "greenhouse", atsTenant: "airbnb", careersUrl: "https://careers.airbnb.com", enabled: true },
  { id: "netflix", name: "Netflix", region: ["global", "apac", "india"], sector: "big-tech-strategy", ats: "lever", atsTenant: "netflix", careersUrl: "https://jobs.netflix.com", enabled: true },
  { id: "spotify", name: "Spotify", region: ["global"], sector: "big-tech-strategy", ats: "lever", atsTenant: "spotify", careersUrl: "https://www.lifeatspotify.com", enabled: true },
];

// AI / Emerging Tech (global)
const AI_EMERGING: CompanyTarget[] = [
  { id: "openai", name: "OpenAI", region: ["global"], sector: "ai-emerging", ats: "ashby", atsTenant: "openai", careersUrl: "https://openai.com/careers", enabled: true },
  { id: "anthropic", name: "Anthropic", region: ["global"], sector: "ai-emerging", ats: "greenhouse", atsTenant: "anthropic", careersUrl: "https://www.anthropic.com/careers", enabled: true },
  { id: "cohere", name: "Cohere", region: ["global"], sector: "ai-emerging", ats: "lever", atsTenant: "cohere", careersUrl: "https://cohere.com/careers", enabled: true },
  { id: "mistral", name: "Mistral AI", region: ["global", "europe"], sector: "ai-emerging", ats: "ashby", atsTenant: "mistral", careersUrl: "https://mistral.ai/careers", enabled: true },
  { id: "scale-ai", name: "Scale AI", region: ["global"], sector: "ai-emerging", ats: "greenhouse", atsTenant: "scaleai", careersUrl: "https://scale.com/careers", enabled: true },
  { id: "together-ai", name: "Together AI", region: ["global"], sector: "ai-emerging", ats: "ashby", atsTenant: "together", careersUrl: "https://together.ai/careers", enabled: true },
  { id: "perplexity", name: "Perplexity", region: ["global"], sector: "ai-emerging", ats: "ashby", atsTenant: "perplexity", careersUrl: "https://www.perplexity.ai/careers", enabled: true },
  { id: "character", name: "Character.AI", region: ["global"], sector: "ai-emerging", ats: "ashby", atsTenant: "characterai", careersUrl: "https://character.ai/jobs", enabled: true },
  { id: "glean", name: "Glean", region: ["global", "india"], sector: "ai-emerging", ats: "greenhouse", atsTenant: "gleanwork", careersUrl: "https://www.glean.com/careers", enabled: true },
  { id: "harvey", name: "Harvey AI", region: ["global"], sector: "ai-emerging", ats: "ashby", atsTenant: "harvey", careersUrl: "https://www.harvey.ai/careers", enabled: true },
  { id: "inflection", name: "Inflection AI", region: ["global"], sector: "ai-emerging", ats: "ashby", atsTenant: "inflection", careersUrl: "https://inflection.ai/careers", enabled: true },
  { id: "runway", name: "Runway", region: ["global"], sector: "ai-emerging", ats: "ashby", atsTenant: "runwayml", careersUrl: "https://runwayml.com/careers", enabled: true },
  { id: "elevenlabs", name: "ElevenLabs", region: ["global"], sector: "ai-emerging", ats: "ashby", atsTenant: "elevenlabs", careersUrl: "https://elevenlabs.io/careers", enabled: true },
  { id: "writer", name: "Writer", region: ["global"], sector: "ai-emerging", ats: "ashby", atsTenant: "writer", careersUrl: "https://writer.com/careers", enabled: true },
  { id: "decagon", name: "Decagon", region: ["global"], sector: "ai-emerging", ats: "ashby", atsTenant: "decagon", careersUrl: "https://decagon.ai/careers", enabled: true },
  { id: "sierra", name: "Sierra", region: ["global"], sector: "ai-emerging", ats: "ashby", atsTenant: "sierra", careersUrl: "https://sierra.ai/careers", enabled: true },
];

// Middle East tech & investment (UAE/KSA/Qatar focus)
const ME_REGIONAL: CompanyTarget[] = [
  { id: "g42", name: "G42", region: ["middle-east"], sector: "ai-emerging", ats: "workday", careersUrl: "https://g42.ai/careers", enabled: true },
  { id: "inception-g42", name: "Inception (G42)", region: ["middle-east"], sector: "ai-emerging", ats: "custom", careersUrl: "https://www.inceptioniai.org/careers", enabled: true },
  { id: "core42", name: "Core42", region: ["middle-east"], sector: "ai-emerging", ats: "custom", careersUrl: "https://core42.ai/careers", enabled: true },
  { id: "mbzuai", name: "MBZUAI", region: ["middle-east"], sector: "ai-emerging", ats: "custom", careersUrl: "https://mbzuai.ac.ae/careers", enabled: true },
  { id: "careem", name: "Careem", region: ["middle-east"], sector: "big-tech-strategy", ats: "greenhouse", atsTenant: "careem", careersUrl: "https://careers.careem.com", enabled: true },
  { id: "talabat", name: "Talabat", region: ["middle-east"], sector: "big-tech-strategy", ats: "smartrecruiters", careersUrl: "https://www.talabat.com/careers", enabled: true },
  { id: "noon", name: "Noon", region: ["middle-east"], sector: "ecommerce", ats: "custom", careersUrl: "https://noon.com/careers", enabled: true },
  { id: "property-finder", name: "Property Finder", region: ["middle-east"], sector: "big-tech-strategy", ats: "greenhouse", atsTenant: "propertyfinder", careersUrl: "https://www.propertyfinder.com/careers", enabled: true },
  { id: "kitopi", name: "Kitopi", region: ["middle-east"], sector: "ecommerce", ats: "greenhouse", atsTenant: "kitopi", careersUrl: "https://www.kitopi.com/careers", enabled: true },
  { id: "tabby", name: "Tabby", region: ["middle-east"], sector: "fintech", ats: "ashby", atsTenant: "tabby", careersUrl: "https://tabby.ai/careers", enabled: true },
  { id: "tamara", name: "Tamara", region: ["middle-east"], sector: "fintech", ats: "ashby", atsTenant: "tamara", careersUrl: "https://tamara.co/careers", enabled: true },
  { id: "rain-financial", name: "Rain Financial", region: ["middle-east"], sector: "fintech", ats: "lever", atsTenant: "rain", careersUrl: "https://rainhq.com/careers", enabled: true },
  { id: "stc-pay", name: "STC Pay", region: ["middle-east"], sector: "fintech", ats: "custom", careersUrl: "https://stcpay.com.sa/careers", enabled: true },
  { id: "pif", name: "PIF (Public Investment Fund)", region: ["middle-east"], sector: "investment", ats: "workday", careersUrl: "https://www.pif.gov.sa/careers", enabled: true },
  { id: "mubadala", name: "Mubadala", region: ["middle-east"], sector: "investment", ats: "workday", careersUrl: "https://www.mubadala.com/careers", enabled: true },
  { id: "adq", name: "ADQ", region: ["middle-east"], sector: "investment", ats: "workday", careersUrl: "https://www.adq.ae/careers", enabled: true },
  { id: "neom", name: "NEOM", region: ["middle-east"], sector: "industry", ats: "workday", careersUrl: "https://careers.neom.com", enabled: true },
  { id: "the-line", name: "THE LINE / NEOM Tech & Digital", region: ["middle-east"], sector: "ai-emerging", ats: "workday", careersUrl: "https://careers.neom.com", enabled: true },
  { id: "aramco-digital", name: "Aramco Digital", region: ["middle-east"], sector: "ai-emerging", ats: "workday", careersUrl: "https://www.aramco.com/en/careers", enabled: true },
  { id: "tonomus", name: "Tonomus", region: ["middle-east"], sector: "ai-emerging", ats: "custom", careersUrl: "https://tonomus.neom.com/careers", enabled: true },
  { id: "edge-group", name: "EDGE Group", region: ["middle-east"], sector: "industry", ats: "workday", careersUrl: "https://edgegroup.ae/careers", enabled: true },
];

// APAC regional tech (Singapore/HK/Japan/Korea/SE Asia)
const APAC_REGIONAL: CompanyTarget[] = [
  { id: "grab", name: "Grab", region: ["apac"], sector: "big-tech-strategy", ats: "greenhouse", atsTenant: "grab", careersUrl: "https://grab.careers", enabled: true },
  { id: "sea-group", name: "Sea Group / Shopee / Garena", region: ["apac"], sector: "ecommerce", ats: "workday", careersUrl: "https://careers.sea.com", enabled: true },
  { id: "goto", name: "GoTo / Gojek / Tokopedia", region: ["apac"], sector: "big-tech-strategy", ats: "greenhouse", atsTenant: "gotogroup", careersUrl: "https://www.gotocompany.com/careers", enabled: true },
  { id: "lazada", name: "Lazada", region: ["apac"], sector: "ecommerce", ats: "workday", careersUrl: "https://careers.lazada.com", enabled: true },
  { id: "bytedance", name: "ByteDance / TikTok", region: ["apac", "global"], sector: "big-tech-strategy", ats: "custom", careersUrl: "https://careers.bytedance.com", enabled: true },
  { id: "tencent", name: "Tencent", region: ["apac"], sector: "big-tech-strategy", ats: "custom", careersUrl: "https://join.tencent.com", enabled: true },
  { id: "alibaba", name: "Alibaba Group", region: ["apac"], sector: "big-tech-strategy", ats: "custom", careersUrl: "https://talent.alibaba.com", enabled: true },
  { id: "razer", name: "Razer", region: ["apac"], sector: "big-tech-strategy", ats: "workday", careersUrl: "https://www.razer.com/careers", enabled: true },
  { id: "naver", name: "Naver", region: ["apac"], sector: "big-tech-strategy", ats: "custom", careersUrl: "https://recruit.navercorp.com", enabled: true },
  { id: "kakao", name: "Kakao", region: ["apac"], sector: "big-tech-strategy", ats: "custom", careersUrl: "https://careers.kakao.com", enabled: true },
  { id: "rakuten", name: "Rakuten", region: ["apac"], sector: "big-tech-strategy", ats: "workday", careersUrl: "https://global.rakuten.com/corp/careers", enabled: true },
  { id: "softbank", name: "SoftBank Group", region: ["apac"], sector: "investment", ats: "custom", careersUrl: "https://group.softbank/en/careers", enabled: true },
  { id: "sensetime", name: "SenseTime", region: ["apac"], sector: "ai-emerging", ats: "custom", careersUrl: "https://www.sensetime.com/en/careers", enabled: true },
  { id: "ai-singapore", name: "AI Singapore", region: ["apac"], sector: "ai-emerging", ats: "custom", careersUrl: "https://aisingapore.org/careers", enabled: true },
  { id: "ninja-van", name: "Ninja Van", region: ["apac"], sector: "industry", ats: "greenhouse", atsTenant: "ninjavan", careersUrl: "https://www.ninjavan.co/en-sg/careers", enabled: true },
  { id: "carousell", name: "Carousell", region: ["apac"], sector: "ecommerce", ats: "lever", atsTenant: "carousell", careersUrl: "https://careers.carousell.com", enabled: true },
];

// India regional tech & startups
const INDIA_REGIONAL: CompanyTarget[] = [
  { id: "flipkart", name: "Flipkart", region: ["india"], sector: "ecommerce", ats: "workday", careersUrl: "https://www.flipkartcareers.com", enabled: true },
  { id: "myntra", name: "Myntra", region: ["india"], sector: "ecommerce", ats: "workday", careersUrl: "https://careers.myntra.com", enabled: true },
  { id: "meesho", name: "Meesho", region: ["india"], sector: "ecommerce", ats: "lever", atsTenant: "meesho", careersUrl: "https://www.meesho.io/careers", enabled: true },
  { id: "zomato", name: "Zomato", region: ["india"], sector: "ecommerce", ats: "lever", atsTenant: "zomato", careersUrl: "https://www.zomato.com/careers", enabled: true },
  { id: "swiggy", name: "Swiggy", region: ["india"], sector: "ecommerce", ats: "lever", atsTenant: "swiggy", careersUrl: "https://careers.swiggy.com", enabled: true },
  { id: "lenskart", name: "Lenskart", region: ["india"], sector: "ecommerce", ats: "workday", careersUrl: "https://www.lenskart.com/careers", enabled: true },
  { id: "cred", name: "CRED", region: ["india"], sector: "fintech", ats: "lever", atsTenant: "cred", careersUrl: "https://careers.cred.club", enabled: true },
  { id: "razorpay", name: "Razorpay", region: ["india"], sector: "fintech", ats: "lever", atsTenant: "razorpay", careersUrl: "https://razorpay.com/jobs", enabled: true },
  { id: "zerodha", name: "Zerodha", region: ["india"], sector: "fintech", ats: "custom", careersUrl: "https://zerodha.com/careers", enabled: true },
  { id: "groww", name: "Groww", region: ["india"], sector: "fintech", ats: "lever", atsTenant: "groww", careersUrl: "https://groww.in/careers", enabled: true },
  { id: "phonepe", name: "PhonePe", region: ["india"], sector: "fintech", ats: "workday", careersUrl: "https://www.phonepe.com/careers", enabled: true },
  { id: "pine-labs", name: "Pine Labs", region: ["india"], sector: "fintech", ats: "lever", atsTenant: "pinelabs", careersUrl: "https://www.pinelabs.com/careers", enabled: true },
  { id: "krutrim", name: "Krutrim", region: ["india"], sector: "ai-emerging", ats: "custom", careersUrl: "https://www.olakrutrim.com/careers", enabled: true },
  { id: "sarvam-ai", name: "Sarvam AI", region: ["india"], sector: "ai-emerging", ats: "ashby", atsTenant: "sarvamai", careersUrl: "https://www.sarvam.ai/careers", enabled: true },
  { id: "yellow-ai", name: "Yellow.ai", region: ["india"], sector: "ai-emerging", ats: "lever", atsTenant: "yellowai", careersUrl: "https://yellow.ai/careers", enabled: true },
  { id: "fractal", name: "Fractal Analytics", region: ["india", "global"], sector: "ai-emerging", ats: "workday", careersUrl: "https://fractal.ai/careers", enabled: true },
  { id: "tiger-analytics", name: "Tiger Analytics", region: ["india", "global"], sector: "ai-emerging", ats: "workday", careersUrl: "https://www.tigeranalytics.com/careers", enabled: true },
  { id: "ola", name: "Ola", region: ["india"], sector: "big-tech-strategy", ats: "lever", atsTenant: "ola", careersUrl: "https://www.olacabs.com/careers", enabled: true },
  { id: "reliance-jio", name: "Reliance Jio", region: ["india"], sector: "big-tech-strategy", ats: "workday", careersUrl: "https://careers.jio.com", enabled: true },
  { id: "jio-platforms", name: "Jio Platforms", region: ["india"], sector: "ai-emerging", ats: "workday", careersUrl: "https://careers.jio.com", enabled: true },
];

export const DEFAULT_COMPANY_TARGETS: CompanyTarget[] = [
  ...CONSULTING_GLOBAL,
  ...CONSULTING_ME,
  ...CONSULTING_APAC,
  ...CONSULTING_INDIA,
  ...BIG_TECH,
  ...AI_EMERGING,
  ...ME_REGIONAL,
  ...APAC_REGIONAL,
  ...INDIA_REGIONAL,
];

const TARGETS_KEY = "careeros_company_targets";

export function getCompanyTargets(): CompanyTarget[] {
  if (typeof window === "undefined") return DEFAULT_COMPANY_TARGETS;
  const raw = localStorage.getItem(TARGETS_KEY);
  if (!raw) return DEFAULT_COMPANY_TARGETS;
  try { return JSON.parse(raw); } catch { return DEFAULT_COMPANY_TARGETS; }
}

export function saveCompanyTargets(targets: CompanyTarget[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TARGETS_KEY, JSON.stringify(targets));
}

export function resetCompanyTargets() {
  if (typeof window === "undefined") return;
  localStorage.setItem(TARGETS_KEY, JSON.stringify(DEFAULT_COMPANY_TARGETS));
}

export function getEnabledTargets(region?: Region, sector?: Sector): CompanyTarget[] {
  return getCompanyTargets().filter(c => {
    if (!c.enabled) return false;
    if (region && !c.region.includes(region)) return false;
    if (sector && c.sector !== sector) return false;
    return true;
  });
}

// Domain extraction for email lookup
export function companyDomain(target: CompanyTarget): string | null {
  try {
    const url = new URL(target.careersUrl.startsWith("http") ? target.careersUrl : `https://${target.careersUrl}`);
    return url.hostname.replace(/^www\./, "").replace(/^careers\./, "").replace(/^jobs\./, "");
  } catch { return null; }
}
