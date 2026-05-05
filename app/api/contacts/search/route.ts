import { NextRequest, NextResponse } from "next/server";
import { exaPeopleSearch } from "../../../../lib/exa-client";
import { apolloPeopleSearch } from "../../../../lib/apollo-client";

export const runtime = "nodejs";

export type ContactSearchRequest = {
  company: string;
  role: "hiring_manager" | "referral_candidate" | "ceo" | "executive" | "any";
  jobRole?: string;
  location?: string;
  exaApiKey?: string;
  apolloApiKey?: string;
  numResults?: number;
};

export type ContactCard = {
  name: string;
  title?: string;
  company: string;
  linkedinUrl?: string;
  email?: string;
  location?: string;
  source: "exa" | "apollo";
  confidence: "high" | "medium" | "low";
  snippet?: string;
};

const TITLE_KEYWORDS = {
  hiring_manager: (jobRole?: string) => {
    const role = jobRole ?? "Manager";
    return [
      `Head of ${role}`,
      `VP ${role}`,
      `Director ${role}`,
      `Senior Director ${role}`,
      `${role} Lead`,
      `Chief ${role} Officer`,
    ];
  },
  referral_candidate: (jobRole?: string) => {
    const role = jobRole ?? "Manager";
    return [
      role,
      `Senior ${role}`,
      `Associate ${role}`,
      `Principal`,
      `Consultant`,
      `Manager`,
    ];
  },
  ceo: () => ["CEO", "Chief Executive Officer", "Founder", "Co-Founder"],
  executive: () => ["CEO", "COO", "CTO", "CFO", "President", "EVP", "SVP"],
  any: (jobRole?: string) => [jobRole ?? "Manager", "Director", "VP"],
};

function normalizeCompany(s: string): string {
  return s.toLowerCase()
    .replace(/\binc\.?\b|\bllc\.?\b|\bltd\.?\b|\bcorp\.?\b|\bco\.?\b|\bplc\.?\b|\bgroup\b/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function companyMatches(found: string, target: string): boolean {
  if (!found) return false;
  const n = normalizeCompany(found);
  const t = normalizeCompany(target);
  // exact match or one contains the other (handles "Anthropic" vs "Anthropic PBC")
  return n === t || n.includes(t) || t.includes(n);
}

function parseExaProfile(result: any, company: string): ContactCard | null {
  // LinkedIn title format: "First Last - Title at Company | LinkedIn"
  const title = result.title ?? "";
  const dashSplit = title.split(/\s+[-–—|]\s+/);
  const namePart = dashSplit[0]?.trim() ?? "";
  if (!namePart) return null;
  const restPart = dashSplit.slice(1).join(" - ").replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();

  const atIndex = restPart.toLowerCase().lastIndexOf(" at ");
  let inferredTitle = restPart;
  let inferredCompany = "";
  if (atIndex > 0) {
    inferredTitle = restPart.slice(0, atIndex).trim();
    inferredCompany = restPart.slice(atIndex + 4).trim();
  }

  // Reject if company doesn't match
  if (inferredCompany && !companyMatches(inferredCompany, company)) return null;

  // Also check snippet/highlights for company mention as secondary signal
  const text = (result.highlights?.[0] ?? result.text ?? "").toLowerCase();
  const hasCompanyMention = text.includes(normalizeCompany(company));
  if (!inferredCompany && !hasCompanyMention) return null;

  return {
    name: namePart,
    title: inferredTitle || undefined,
    company,
    linkedinUrl: result.url,
    location: result.author,
    source: "exa",
    confidence: inferredCompany ? "medium" : "low",
    snippet: result.highlights?.[0] ?? result.text?.slice(0, 200),
  };
}

function parseApolloPerson(p: any, targetCompany: string): ContactCard | null {
  const name = p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  if (!name) return null;
  const orgName = p.organization?.name ?? p.organization_name ?? "";
  // Filter out people not at the target company
  if (orgName && !companyMatches(orgName, targetCompany)) return null;
  return {
    name,
    title: p.title,
    company: orgName || targetCompany,
    linkedinUrl: p.linkedin_url,
    email: p.email && !p.email.includes("email_not_unlocked") ? p.email : undefined,
    location: [p.city, p.state, p.country].filter(Boolean).join(", "),
    source: "apollo",
    confidence: p.email && !p.email.includes("email_not_unlocked") ? "high" : "medium",
  };
}

function dedupe(cards: ContactCard[]): ContactCard[] {
  const seen = new Set<string>();
  const out: ContactCard[] = [];
  for (const c of cards) {
    const key = c.linkedinUrl ?? c.email ?? `${c.name}|${c.company}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ContactSearchRequest;
    const { company, role, jobRole, location, exaApiKey, apolloApiKey, numResults = 10 } = body;

    if (!company) return NextResponse.json({ error: "Missing company" }, { status: 400 });
    if (!exaApiKey && !apolloApiKey) {
      return NextResponse.json(
        { error: "No search provider configured. Add an Exa.ai or Apollo.io API key in Settings → Integrations." },
        { status: 400 }
      );
    }

    const titles = TITLE_KEYWORDS[role](jobRole);
    const errors: string[] = [];
    let exaCards: ContactCard[] = [];
    let apolloCards: ContactCard[] = [];

    if (exaApiKey) {
      try {
        const results = await exaPeopleSearch(exaApiKey, company, titles, location, numResults);
        exaCards = results.map(r => parseExaProfile(r, company)).filter((c): c is ContactCard => c !== null);
      } catch (e: any) {
        errors.push(`Exa: ${e.message}`);
      }
    }

    if (apolloApiKey) {
      try {
        const result = await apolloPeopleSearch(apolloApiKey, {
          organizationName: company,
          personTitles: titles,
          personLocations: location ? [location] : undefined,
          perPage: Math.min(numResults, 25),
        });
        apolloCards = result.people.map((p: any) => parseApolloPerson(p, company)).filter((c): c is ContactCard => c !== null);
      } catch (e: any) {
        errors.push(`Apollo: ${e.message}`);
      }
    }

    const merged = dedupe([...apolloCards, ...exaCards]);

    return NextResponse.json({
      contacts: merged,
      errors: errors.length > 0 ? errors : undefined,
      providers: { exa: exaCards.length, apollo: apolloCards.length },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Contact search failed" }, { status: 500 });
  }
}
