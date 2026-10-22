# Career Tracks and Sourcing

Seed knowledge for track classification, job sourcing and the skill-building layer. Compiled in October 2026 from the public sources listed under each section. Treat the skill lists as a starting point: demand measured from real JDs overrides them over time.

## Part 1. Sourcing: what converts

Evidence. Most of it is US data; there is no rigorous public conversion data for India, so the app must measure its own conversion by source.

- Interview rate by where the application went, across 1,244,654 applications tracked by Huntr between October 2024 and July 2026: company career page 6.87%, Google Jobs 6.60%, direct ATS form 3.16%, Indeed 2.92%, Glassdoor 2.89%, LinkedIn 1.95%. Google Jobs scores well because it sends the candidate to the employer's own form.
- Response rate by board, Huntr 2025 (about 600,000 applications): Google Jobs 11.3%, Wellfound 6.0%, Glassdoor 5.5%, Welcome to the Jungle 4.5%, Indeed 4.5%, LinkedIn 3.1%.
- Referrals: Ashby's data puts a cold application at about 3% to interview, and a referral at about 40%.

Source priority for the app:

1. A warm introduction or referral, through the contacts feature.
2. Company-direct postings, through public ATS endpoints.
3. Google Jobs aggregators, which route to the employer's own form.
4. Track and region niche boards.
5. Job-alert emails, for portals with no public API.
6. Mass boards last.

### Public ATS endpoints (no key)

| ATS | Endpoint |
| --- | --- |
| Greenhouse | GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true |
| Lever | GET https://api.lever.co/v0/postings/{slug}?mode=json |
| Ashby | GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true |
| SmartRecruiters | GET https://api.smartrecruiters.com/v1/companies/{slug}/postings |
| Workday | POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs (JSON body, 20 per page) |
| Workable | GET https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true, plus POST https://apply.workable.com/api/v3/accounts/{slug}/jobs for totals |
| Recruitee | GET https://{slug}.recruitee.com/api/offers/ |
| Teamtailor | GET https://{slug}.teamtailor.com/jobs.rss |
| Personio | GET https://{slug}.jobs.personio.de/xml?language=en |
| Rippling | GET https://api.rippling.com/platform/api/ats/v1/board/{slug}/jobs |

### Aggregators with free tiers

| Service | Free tier (as published in 2026) | Notes |
| --- | --- | --- |
| SerpApi, Google Jobs | 250 searches a month, no card | Best route to company-direct listings |
| JSearch | Free tier, no card | Google for Jobs plus public boards |
| Adzuna | 1,000 calls a month | Strongest in the UK and Western Europe |
| TheirStack | A couple of hundred API credits a month | Also gives hiring signals by company |
| JobsPipe | 1,000 jobs a month | Normalised ATS postings |
| Keyless remote boards | Remotive, Arbeitnow, The Muse, Remote OK, We Work Remotely, Himalayas, Jobicy | Remote roles |

### Boards by region and track

These have no public API. Use job-alert emails, or Jina Reader on public pages where the terms allow it.

- India: iimjobs (senior management and business roles), Hirist, Instahyre and Cutshort (tech and startups), foundit (mid-management), Naukri (volume).
- Middle East: Bayt, GulfTalent, Naukrigulf.
- Europe: Welcome to the Jungle.
- Startups: Wellfound, YC Work at a Startup.
- Venture capital: VC Stack, venturecapitalcareers.com, fund websites and their portfolio job boards.

Sources: huntr.co/blog/job-search-tips; lumyhired.com/blog/job-search-strategies-2026; noxjobs.com/blog/which-job-board-actually-works-data-backed-comparison-2026; apify.com/aurenic/ats-jobs-scraper; dev.to/makenomistakesllc (nine public ATS APIs on one schema); jobspipe.dev/theirstack-alternatives; openwebninja.com/api/jsearch; 100hires.com/best-job-posting-sites-in-india.html.

## Part 2. Tracks

Each track lists titles and keywords, what JDs ask for now, how candidates are evaluated, the evidence from this profile to lead with, gaps with pathways, and where to source.

### Track A: Strategy consulting (consulting_strategy)

Titles and keywords: Consultant, Engagement Manager, Project Leader, Principal, Senior Manager (Strategy); experienced hire; Capital Projects, Infrastructure, Energy and Operations practices; AI consultant or delivery lead in AI units (QuantumBlack, BCG X, Bain's AI teams); AI implementation lead at Accenture, Deloitte, PwC, EY and KPMG.

Three doors:

- Generalist strategy (MBB and tier-2 firms): case interview and business judgment.
- AI-native units: a case interview plus a technical screen.
- AI implementation (Big 4, Accenture): systems knowledge and delivery experience.

What JDs ask for in 2026: structured problem solving, client and team leadership, and quantified impact. AI fluency is now a baseline rather than a specialism.

How candidates are evaluated: case interviews and behavioural rounds. The firms are piloting AI inside interviews. McKinsey has used its Lilli assistant in some US final rounds since January 2026. BCG is testing LLM access during live cases, competency questions on AI use, and an online AI-scenario assessment. Bain is preparing an AI-enabled component. What is tested is judgment in using AI, not prompting technique.

Evidence to lead with: capital programme engagements with decision-grade outcomes (IRR lifted from 6% to the 10% hurdle rate; a concept selection study that unlocked a stalled upstream investment; programme readiness for a build of 10+ plants), AI tools deployed on live engagements (the portfolio cockpit cutting manual review effort by 80%; the diagnostic toolkit across 55+ partial and 10 complete live client cases), and breadth at Aranca (12+ mandates).

Gaps and pathways:

- AI-assisted case practice. Run cases with an LLM as a tool: prompt it, critique its output, and synthesise a recommendation. Proof: three recorded mock cases with written debriefs. About two weeks.
- For AI units: SQL (window functions, CTEs), ML framing (metrics, bias and variance, evaluation), and one data-science case written end to end. Proof: a use-case write-up on non-client data. Four to six weeks.
- A leadership story bank covering team leadership, client disagreement, project pivots and delivered impact. Proof: eight STAR stories mapped to common questions. About one week.

Sourcing: firm career sites (detect each firm's ATS; many large firms use Workday), iimjobs for India, referrals through former colleagues and alumni, and LinkedIn through alert emails.

Sources: casecoach.com/b/how-mckinsey-bcg-and-bain-are-testing-ai-skills-in-interviews; strategycase.com/ai-in-consulting-interviews; strategycase.com/ai-consulting-jobs.

### Track B: AI deployment strategy (ai_deployment_strategy)

Titles and keywords: Deployment Strategist, Deployment Lead, Technical Deployment Lead, AI Solutions Lead, AI Transformation Lead, Applied AI strategy, and Engagement Manager at AI companies.

The role owns scope, stakeholders and value while forward deployed engineers build. OpenAI's Deployment Lead asks for seven years of customer-facing delivery leadership and enough technical fluency to pressure-test architectures. Anthropic's Technical Deployment Lead centres on SOWs, executive briefings, security reviews, legal approvals and procurement. Palantir's Deployment Strategist asks for experience with programming, scripting or statistical packages, with no minimum years.

Why this is the strongest fit for this profile: consulting delivery leadership, AI tools built and deployed into live client work, and executive communication, which is the combination these roles describe.

What JDs ask for: programme scoping, value cases, stakeholder management, adoption and change management, security and compliance awareness, evaluation literacy ("how do you know it works"), and familiarity with agents and MCP.

Gaps and pathways:

- Evaluation literacy. Build an evaluation suite for one personal build (CareerOS's evaluator gate is a ready example), measuring accuracy against human labels. Proof: an evaluation report. About two weeks.
- Enterprise deployment fluency. Learn the basics of AI security reviews, data processing agreements and procurement, then write an anonymised SOW for an AI deployment. Proof: the SOW template. About one week.
- Agents and MCP. Document CareerOS's MCP server and a skill built on it as a case study. Proof: the write-up. About two weeks.
- Formal programmes. Anthropic committed $100 million in October 2026 to training 10,000 engineers for this kind of deployment work; pair it with the existing Claude certifications.

Sourcing: AI labs' and AI-native companies' career boards (check each with the ATS detector), Wellfound, YC Work at a Startup, Cutshort and Instahyre for India, and Google Jobs aggregators.

Sources: secondtalent.com/occupations/deployment-strategist-vs-forward-deployed-engineer; digitalapplied.com/blog/forward-deployed-engineer-role-skills-hiring.

### Track C: Forward deployed engineer (forward_deployed_engineer)

Titles and keywords: Forward Deployed Engineer, Forward Deployed AI Engineer, Forward Deployed Software Engineer, Applied AI Engineer, and Solutions Engineer (AI).

What JDs ask for: production code in Python and at least one of TypeScript, Go or Java, with tests, error handling and observability; SQL fluency; RAG, agent orchestration, evaluations and fine-tuning trade-offs; and customer-facing delivery. OpenAI asks for five or more years. Anthropic's London posting asks for MCP servers, sub-agents and agent skills in production workflows, plus evaluation frameworks.

How candidates are evaluated: coding and system design for LLM applications, with heavy weight on evaluation ("how do you know your AI system is actually working"), plus customer scenarios.

Honest fit: the coding bar is the clearest divide between this track and Track B. This profile shows building through AI coding tools rather than owning production code at review level. Target Track B first, and FDE roles at earlier-stage companies where the bar is lower, while working the pathway below.

Gaps and pathways:

- Own one production system end to end, with tests, CI, monitoring, alerting and an on-call routine (CareerOS on its server is the starting point). Proof: a public write-up with metrics. Six to eight weeks.
- Python and TypeScript to code-review level, through a structured course and reviewed pull requests. Proof: merged PRs. Eight to twelve weeks.
- Evaluation engineering: regression and hallucination suites. Proof: an eval suite in a public repo. Two to three weeks.

Sourcing: as for Track B, plus the career boards of Palantir, Databricks, Scale AI and similar companies.

Sources: aced.io/blog/forward-deployed-engineer-interview-the-definitive-2026-guide-fde; marktechpost.com (forward deployed engineer explainer, May 2026); fde.academy/blog/openai-forward-deployed-engineer.

### Track D: Venture capital (venture_capital)

Titles and keywords: Associate, Senior Associate, Principal, Investor, Platform, Venture Partner, Scout; AI investing; climate, energy and infrastructure funds.

The reality: venture capital hires roughly 3 to 5% of MBB consultants and generally prefers former operators and bankers, and mid-sized firms hire one to three associates a year. The realistic routes are an associate role at a sector-focused or tier-2 fund, or an operating loop through a venture-backed company before moving to a fund.

What firms inspect: sourcing, diligence, financial reasoning (unit economics, valuation, dilution, fund-return logic), a crisp one-page memo, network building and portfolio support. Firms hire for work they can inspect.

Evidence to lead with: co-founder of a creator-economy platform (operator credibility); the Series A financial model for an EMEA B2B marketplace whose raise closed; an M&A roadmap that enabled private equity investment; market entry and sizing work; and capital-projects and energy-transition depth combined with AI tooling, which suggests a natural sector thesis.

Consulting work that produces VC evidence: commercial due diligence for growth or PE investors, market entry in startup-heavy sectors, and corporate venture or innovation scouting.

Gaps and pathways:

- A sector thesis and market map (for example, AI for capital projects and construction, or energy-transition infrastructure software). Proof: a published market map and thesis. About three weeks.
- Three investment memos on real startups, written from public information. Proof: the memos. About four weeks.
- Venture mechanics: term sheets, dilution, liquidation preferences and power-law fund returns. Proof: worked examples. About two weeks.
- Network: regular conversations with founders and investors, and a scout programme where one is available.

Sourcing: VC Stack, venturecapitalcareers.com, fund websites and portfolio job boards, and referrals, which are the dominant route.

Sources: strategycase.com/consulting-to-venture-capital; venturecapitalcareers.com/blog/venture-capital-skills; venturecapitalcareers.com/blog/consulting-to-venture-capital.

## Part 3. How the app uses this file

- Track classification: match JD titles and keywords first, then confirm with the structured model.
- Skill demand: skills extracted from real JDs override this seed over time. This file is the prior, not the truth.
- Pathways: seeded here. New skills get generated drafts that the user approves.
- Proof artifacts: a completed artifact becomes a profile bullet only with the user's approval, and never uses client-confidential material.
