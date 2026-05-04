// Apollo.io contact enrichment client.
// Docs: https://apolloapi.com / https://docs.apollo.io

export type ApolloPerson = {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  organization_name?: string;
  organization?: { name?: string; website_url?: string; primary_domain?: string };
  seniority?: string;
  departments?: string[];
};

export type ApolloSearchResult = {
  people: ApolloPerson[];
  total: number;
};

const APOLLO_BASE = "https://api.apollo.io/api/v1";

// People search by company + title keywords + location
export async function apolloPeopleSearch(
  apiKey: string,
  params: {
    organizationName?: string;
    organizationDomain?: string;
    personTitles?: string[];
    personLocations?: string[];
    perPage?: number;
    page?: number;
  }
): Promise<ApolloSearchResult> {
  if (!apiKey) throw new Error("Apollo API key missing. Add it in Settings → Integrations.");

  const body: any = {
    api_key: apiKey,
    page: params.page ?? 1,
    per_page: params.perPage ?? 10,
  };
  if (params.organizationName) body.q_organization_name = params.organizationName;
  if (params.organizationDomain) body.q_organization_domains = [params.organizationDomain];
  if (params.personTitles?.length) body.person_titles = params.personTitles;
  if (params.personLocations?.length) body.person_locations = params.personLocations;

  const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Apollo search failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return { people: data.people ?? [], total: data.pagination?.total_entries ?? 0 };
}

// Enrich a single person by email or LinkedIn URL → returns full profile + email
export async function apolloEnrichPerson(
  apiKey: string,
  params: { email?: string; linkedinUrl?: string; firstName?: string; lastName?: string; organizationName?: string }
): Promise<ApolloPerson | null> {
  if (!apiKey) throw new Error("Apollo API key missing.");

  const body: any = { api_key: apiKey, reveal_personal_emails: false };
  if (params.email) body.email = params.email;
  if (params.linkedinUrl) body.linkedin_url = params.linkedinUrl;
  if (params.firstName) body.first_name = params.firstName;
  if (params.lastName) body.last_name = params.lastName;
  if (params.organizationName) body.organization_name = params.organizationName;

  const res = await fetch(`${APOLLO_BASE}/people/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.text();
    throw new Error(`Apollo enrich failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.person ?? null;
}
