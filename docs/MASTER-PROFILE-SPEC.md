# Master Profile & Resume Engine Specification

**Canonical reference for Raunaq Rakesh.** Everything known about the profile, plus every construction rule, tone rule, confidentiality rule, and formatting specification derived from building real resumes against live job descriptions.

This document supersedes all prior versions. It is the specification the CareerOS resume engine implements.

---

## PART 0 — HOW TO USE THIS DOCUMENT

It contains four distinct layers. Keep them separate when implementing.

| Layer | Parts | Consumed by |
|---|---|---|
| **Confidentiality gates** | 1 | A hard blocking check on all generated output |
| **Career data** | 2–6 | The profile store; the only legal source of resume bullet text |
| **Construction rules** | 7–9 | The generation prompt and selection logic |
| **Formatting spec** | 10–11 | The DOCX renderer and validation pipeline |

**Rule of precedence:** confidentiality gates override everything. If a rule in Part 8 would produce output forbidden by Part 1, Part 1 wins and the build fails.

---

## PART 1 — CONFIDENTIALITY AND NAMING GATES

> These are not style preferences. They protect client confidentiality and internal IP. Any generated artifact containing a forbidden term is a failed build, not a warning.

### 1.1 Forbidden terms with mandatory substitutions

| Never render | Render instead | Reason |
|---|---|---|
| `nuclear utility` | `green energy entity` | Client anonymisation |
| `10 GW plant` | omit the capacity entirely | Client anonymisation |
| `$10.45B` | `$10 billion` | Rounded figures only |
| Internal tool product names | The capability description (see 1.2) | Internal IP |
| `CAP Ops`, `BCN` | omit, or `Project Leader` alone | Internal team naming |
| Team-size numbers | `lead cross-functional teams` | Policy |

### 1.2 Tool naming map

Internal builds are described **by capability, never by internal product name**.

| Internal name | Resume-safe description |
|---|---|
| *(AI-first consulting platform)* | `AI-first strategy consulting platform` — never name it |
| *(risk/schedule diagnostic)* | `the risk-analysis module`, or the full `Schedule, Cost and Risk Diagnostic AI-enabled toolkit` |

### 1.3 Facts that must never be cited on a resume

- The 5,232-activity / $3.8 billion validation programme
- Development-environment URLs
- Release counts, version-pinning gaps, support-model limitations
- Any unreleased or non-live integration

### 1.4 Absolute prohibitions

- **Never fabricate.** No invented numbers, URLs, certifications, or claimed specialisations that do not exist.
- **Never claim tenure in a practice area that does not exist** (e.g. a dedicated PIPE practice).
- **Zero em dashes** in any output. See Part 11 for the repair sweep.

---

## PART 2 — IDENTITY

| Field | Value |
|---|---|
| Name | Raunaq Rakesh |
| Phone | +91-7982271861 |
| Primary email | raunaq1509@gmail.com |
| LinkedIn email | raunaq6655@gmail.com |
| LinkedIn | linkedin.com/in/raunaqrakesh |
| GitHub | github.com/Raunaq-nous |
| Portfolio | raunaq-nous.github.io/raunaq-portfolio/builds |
| CareerOS dashboard | raunaq-nous.github.io/TheWhiteKnight |

**Header location rule:** write `India` on AI and product resumes. `Gurgaon` is acceptable on consulting and Naukri resumes only.

**Header link treatment:** LinkedIn, Portfolio and GitHub render as clickable single-word hyperlinks, colour `1155CC`, underlined, pipe-separated. Never raw URLs.

### Canonical employer locations

The most frequently violated facts. Hard-code them.

| Employer | Location |
|---|---|
| Bain and Company | Gurgaon |
| **Aranca** | **Mumbai** |
| Evalueserve | Gurgaon |
| Tecnova India | Gurgaon |
| Delbomblr Inc | Delhi |
| Madcue | Bangalore |

---

## PART 3 — EXPERIENCE CALIBRATION

Years of experience is **not a fixed field**. It flexes by target role.

| Claim | Use for | Anchor |
|---|---|---|
| **10+ years** | Senior consulting, Accenture/BCG Manager, Chief of Staff, venture roles | Madcue founding, June 2015 |
| **8 years** | AI and product roles, startup roles | Professional arc |
| **7+ years** | Legacy default, largely superseded | Tecnova start, July 2019 |
| **6–8 years** | Only when a JD specifies that exact band | Match the JD's language |

---

## PART 4 — CAREER ARC

### Bain and Company | Project Leader | Jun 2025 – Present | Gurgaon

**Team:** Capital Projects & Infrastructure. Never write the internal team abbreviation. On some resumes drop the team entirely and write only `Project Leader`.

**Sectors:** oil and gas, solar, mining, green energy, capital-intensive infrastructure.

#### Consulting engagements

**1. Concept selection study — national oil and gas company (South America)**
Stalled upstream asset. Built the evaluation framework across financial, technical and regulatory criteria; authored the C-suite decision document.
*Outcome:* unlocked investment on a previously non-feasible project.

**2. Capital program readiness — North American green energy entity**
Building 10+ plants. Covered the financial business case, partnership and ecosystem design, governance model, and delivery readiness across the multi-plant build sequence.
*Naming gate:* `green energy entity` only. Never `nuclear utility`. Never state plant capacity.

**3. Utility-scale solar performance improvement**
Asset returning below its hurdle rate. Isolated CapEx and OpEx optimisation levers; produced an investment-committee-ready case for capital redeployment.
*Outcome:* lifted project **IRR from 6% to the 10% hurdle rate**.

#### AI builds

**1. Workflow and Workforce Modernization Studio**
Turns a client's process taxonomy into a full AI transformation blueprint in a single working session. Spans current-state diagnosis with pain points and workflow debt, redesigned AI-first future state with defined agents and exception handling, workforce implications, prioritised roadmap and delivery waves, and an EBITDA value bridge with auditable assumptions.
*Throughput:* roughly **100 processes in two hours**; documented client session across **118 processes**.
*Modules:* Taxonomy Explorer, Current State, Future State, Compare, Prioritisation Studio, Roadmap & Program, Program Value, Executive Overview, Methodology, Sessions.

**2. Portfolio and project intelligence cockpit**
Integrates cost, schedule and risk data with early-warning alerts. An AI stage-gate reviewer scores submissions against gate criteria and drafts feedback for human approval.
*Outcome:* cut **manual review effort by 80%**.
*Scale:* demonstrated on a **$10 billion portfolio of 16 projects across 10+ sites**; planned rollout across 5 active projects for a renewables developer.

**3. Generative scheduling platform**
Optimises project schedules by sequencing activities, resolving dependencies, computing critical paths and levelling resources. Gives planners an AI-generated optimised schedule in place of manual iteration.
*Naming gate:* `AI-based` or `generative` on consulting resumes. Never `knowledge graph-linked`.

**4. Schedule, Cost and Risk Diagnostic AI-enabled toolkit**
Use this exact name. Deployed on **Azure cloud**. Runs probabilistic risk simulation and industry-standard schedule quality scoring.
*Scale:* **55+ partial and 10 complete live client cases**.

**5. Capital Projects Intelligence Toolkit**
A proprietary knowledge management system spanning **17 capital-project industries and 16,000 projects**, with multiple AI agents running benchmarking, risk analysis, value-at-risk checks and success-recipe identification across the portfolio.

#### Platform depth — reference only

Production platform inside a governed Azure environment at Orange data classification: Azure App Service for Containers, PostgreSQL Flexible Server 16.14, private VNet with delegated subnet and forced NAT egress, private endpoint plus private DNS so database traffic never touches the internet, Entra-only database authentication via managed identity, Azure EasyAuth with assignment-required access, GitHub Actions with OIDC federated credentials, Terraform via internal CloudLaunch templates, all model calls routed through a centralised gateway.

Stack and scale: React 18 + Vite, FastAPI + SQLAlchemy, PostgreSQL, optional Redis; one-million-iteration vectorised Monte Carlo in ~3 seconds; DCMA 14-point schedule quality, SmartPM metrics, AACE estimate classification, SPI/CPI earned value, CPM and resource-levelling optimiser; ingests Primavera P6 XER, MS Project XML, Excel and CSV; calculation traceability DAG.

**Use only for** deeply technical roles, AI engineering roles, or when a JD explicitly demands platform depth. On strategy and management-consulting resumes compress to `deployed on Azure cloud`.

---

### Aranca | Engagement Lead, Growth Advisory | Mar 2022 – Jun 2025 | Mumbai

**Scope:** primary client interface across 12+ mandates for Fortune 500 and PE-backed clients across EMEA and North America. Earned multiple **Star Performance awards and a fast-track promotion**.

#### Consulting engagements

1. **Series A financial model and investor business plan** — EMEA B2B marketplace. Revenue projections, unit economics, adjacent market sizing. The multi-million-dollar raise closed.
2. **Go-to-market strategy for IT infrastructure and software** — multiple Indian states and territories. AI-based product platform strategy, channel design, enterprise adoption pathways.
3. **M&A roadmap** — global IT services firm. Sequenced acquisition targets to improve the valuation multiple, enabling private equity investment.
4. **Bid advisory** — global port operator across three continents. Financial return models and commercial strategy across APAC, Europe and Africa under differing regulatory regimes.
5. **Tier-based pricing model** — North American technology firm's carbon credits platform. No clean market comparables; replacement-cost and market-benchmarking methodology.
6. **Marketing and launch strategy** — global beverage company entering ready-to-drink. Consumer positioning, channel architecture, pricing, distributor model, market-by-market sequencing.
7. **Go-to-market and repositioning** — EMEA consumer electronics brand. Channel strategy, product architecture, revenue diversification into adjacent categories.
8. **Multi-year long-range business plan** — EMEA waste management firm. Infrastructure capital expenditure, supply chain transformation, return profile.
9. **NFT-linked product strategy** — Japanese beverage manufacturer. Tradable bottle-NFT framework, channel architecture, partner identification.
10. **Solution portfolio architecture** — stock trading firm. Product bundling, tier-based pricing, C-suite commercial framework.
11. **Market attractiveness analysis** — EMEA logistics firm. Demand forecasts, competitive and supply assessments, business model evaluation.
12. **EMEA ecommerce vertical entry** — market sizing, competitive dynamics, monetisation feasibility.
13. **Fractional content marketing assets manager** — global EMEA telecom. Market research plus strategic content initiatives for market presence and sales enablement.

#### AI builds

1. **Led the internal AI strategy team** — reforming how research and consulting work gets delivered across the firm through in-house tool development, third-party partnerships, and rollout of AI toolkits into everyday analyst and engagement workflows.
2. **Project economics and cost modelling engine** — real-time CapEx, OpEx and IRR analysis across multiple project concepts at once.
3. **AI survey intelligence platform** — automates the full research lifecycle from questionnaire design through response analysis and executive-ready insight synthesis.
4. **Document intelligence engine using agentic retrieval and knowledge graphs** — source-cited natural language search across large contract and regulatory libraries.

#### Publications from this period

AI's impact on green manufacturing (*Economic Times*, 2024) and digital governance (*Dataquest*, 2025).

*Framing:* "Published thought leadership across Economic Times and Dataquest and quoted as a subject-matter expert."

---

### Evalueserve | Business Analyst, Insights and Intelligence | Oct 2020 – Nov 2021 | Gurgaon

1. **Product strategy for a global hyperscale technology firm** — competitive analysis of cloud compliance and assurance programmes, directly informing product roadmap decisions and M&A screening.
2. **India market entry and partner strategy for a hyperscale cloud provider** — assessed 10+ global system integrators into a digital readiness framework and tiered engagement model.
3. **Go-to-market and product launch strategy** — major Indian telecom operator entering CPaaS/CCaaS.
4. **Strategic landscape analysis, EV charging infrastructure** — key technologies, deployment models, investment opportunities in an emerging market.
5. **IT solution spend mapping across the Canadian public sector** — structured spend taxonomy identifying enterprise engagement opportunities.

---

### Tecnova India | Strategy Analyst | Jul 2019 – Oct 2020 | Gurgaon

1. **India market entry for a $10 billion French conglomerate** — automotive, pharmaceuticals and consumer electronics simultaneously. M&A and joint venture targets, partner origination, competitive intelligence.
2. **Built a personal care startup in-house from zero** — handpicked by the co-founding team. Product positioning, financial model, channel architecture against a three-year break-even plan.
3. **Market sizing framework, Indian metals market** — for a US industry association using import-export data and demand-supply modelling.
4. **Turnaround strategy, German automotive parts manufacturer in India** — Voice of Customer research plus operational diagnostic.
5. **Partner identification and negotiation, European primary cell manufacturer** — contract manufacturing arrangement in India.

---

### Delbomblr Inc | Business Consultant | Feb 2018 – Jun 2019 | Delhi

**Content unknown. Never fabricate.** Omit from resumes or flag as an open gap until real content is supplied.

---

### Madcue | Co-founder | Jun 2015 – Jan 2018 | Bangalore

1. **Co-founded and scaled a creator economy and digital media platform** to 150+ independent creators and 70,000 monthly viewers, tripling audience in 8 months through structured performance marketing experiments across Facebook and Google.
2. **Owned product, technology, operations, content strategy and creator acquisition end-to-end**, building the platform in-house and orchestrating multiple pivots as the market evolved.
3. **Defined the brand identity, visual design language and editorial voice from the ground up**, securing exclusive interviews with globally recognised creators (Gavin Aung Than, Abhilash Tomy, Tashi Malik).

*Alternative framing:* "built a creator economy platform before the phrase existed."

---

## PART 5 — EDUCATION, PUBLICATIONS, CERTIFICATIONS

### Education

**B.Tech, Mechanical Engineering | Manipal Institute of Technology | 2016 | CGPA 8.0 / 10.0**

**Parikshit Student Satellite Team** (ISRO-guided, 1 Cr funded), 2013–2016
ADCS Subsystem Head — write as `Subsystem Head` on non-technical resumes. Designed the full PID control system from scratch including actuators and magnetorquers; used quaternions and Lagrangian mechanics for attitude dynamics modelling. Nano-satellite operating at 28,800 km/hr in polar low-Earth orbit. Presented at the **IEEE Aerospace Conference, Big Sky, Montana, USA**.

*Compressed version for management-consulting resumes:*
> Worked on the control system of a satellite during an ISRO-guided student project; co-authored multiple published research papers.

*Plain-language version for non-technical audiences:*
> Led the satellite control systems team on an ISRO-guided project at Manipal funded with 1 Cr. We built a satellite the size of a microwave that had to orient itself precisely while moving at 28,800 km per hour. My job was the part that kept it from tumbling.

### Publications (7 total)

| Title | Venue | Year |
|---|---|---|
| AI's impact on green manufacturing | Economic Times | 2024 |
| Digital governance | Dataquest | 2025 |
| Mechanism, Ensuing Dynamics and Control of a Polar Low-Earth Orbit Tethered Nano-Satellite | IEEE | 2016 |
| Dynamics and Control System Design of a Polar Low-Earth Orbit Nano-Satellite | IEEE | 2015 |
| Software in Loop Test Setup for a Tethered Satellite | IEEE | 2015 |
| Control System Design to Counter the Effect of Tether Ejection System on a Nano-satellite | IEEE | 2015 |
| Earthquake Stabilization Using Active Control, Structural Dynamics | IJERT | 2014 |

*Count framing:* 5 IEEE + 1 IJERT = 6 research papers, plus 2 industry thought-leadership pieces = 7 publications total.

**Open gap:** URLs for all seven are missing. Hyperlink titles once supplied. Never fabricate a URL.

### Certifications

**Standard resume line (one row, comma-separated):**
> Claude Certified Architect (Anthropic), Claude Certified Developer (Anthropic), AI Engineering (IBM), Product Management (Microsoft), Business and Financial Modeling (Wharton)

**Full set** for Naukri and long-form profiles: Claude Certified Architect · Claude Certified Developer · Agent Skills with Anthropic · AI Engineering (IBM) · Product Management (Microsoft) · Business & Financial Modeling (Wharton) · Business Strategy (Wharton) · Vector Databases for RAG · Build RAG Applications · Agentic AI · Introduction to Large Language Models · Performance Improvement Projects for Management Consultants · CS50 Python (Harvard) · Introduction to Git and GitHub (Google) · Venture Capital Analyst Fundamentals · Introduction to IT & Cybersecurity

---

## PART 6 — SKILLS TAXONOMY

**Strategy and transformation:** enterprise process reinvention, discovery workshops and pain-point diagnosis, process modelling and taxonomy design, target-state design, value frameworks and business case modelling, KPI and benefits realisation, operating model design, change management and adoption planning, executive stakeholder management, market entry, GTM strategy, M&A advisory, financial modelling, investment evaluation, due diligence, pricing strategy, commercial diligence, portfolio strategy, market sizing.

**AI and technology:** agentic AI and agent architecture design, multi-agent orchestration, agentic retrieval and knowledge graphs, Anthropic Claude, Microsoft Azure, cloud deployment, AI governance and access control, Python, TypeScript, React, FastAPI, SQL, LangChain, Next.js, prompt engineering, vector databases, Claude Code, Cursor, GitHub, APIs, custom AI skills.

**Geographies** (weave into the summary): EMEA, North America, South America, APAC.

**Sectors** (weave into the summary): technology, telecom, energy and infrastructure, consumer goods, industrials, financial services. Extended: oil and gas, solar and renewables, mining, cloud, EV infrastructure, beverages, consumer electronics, waste management, ports and logistics, automotive, pharmaceuticals, metals, public sector, fintech, media and creator economy.

---

## PART 7 — VOICE AND TONE

### Sentence rhythm

Short declarative openers, longer connective middles. Lead with the substantive claim, then the evidence. Sentence fragments acceptable where natural. Direct, specific, non-corporate.

### Signature phrasings

- "Approaches every engagement from first principles, breaking each problem back to its economic fundamentals before reaching for frameworks"
- "What makes this role interesting specifically is [the hard part]"
- "The honest framing is…"
- "That is a harder problem than it sounds"
- "What I bring alongside [the obvious] is [the differentiator]"

### Never use

Em dashes · "excited to apply" · "passionate about" · "synergy" · "leverage" as a verb · "cutting-edge" · "innovative solutions" · "self-starter" · "proven track record" · "consumer-facing" · double-spaced hyphens

### Tone by audience

| Audience | Calibration |
|---|---|
| MBB / strategy | Formal, structured, less first-person |
| AI / product | Direct, confident about builds, lead with concrete proof |
| Chief of Staff | Warmer, partnership and trust |
| VC / fintech / crypto | Acknowledge domain gap honestly, lead with transferable mechanics |
| Aerospace / deep-tech | Include IEEE publications, signal technical depth |

---

## PART 8 — RESUME CONSTRUCTION RULES

### Hard rules

1. **Zero em dashes.** Validate on the packed XML and the extracted PDF text. Autocorrect introduces them; always sweep.
2. **One project per bullet.** Never combine two distinct projects.
3. **First-principles thinking** woven naturally into the profile summary, never as a standalone buzzword claim.
4. **Verb-first bullets** with selective bolding inside. Never bold label prefixes.
5. **Skills sections lean** — two to three rows. No forced "Leadership" row.
6. **Pipe separators** for education, certifications and the header contact line.
7. **GitHub repos described by function**, never listed parenthetically.
8. All Part 1 confidentiality gates apply.

### Page length

| Target | Pages |
|---|---|
| Senior consulting Manager roles (Accenture, BCG, Big 4) | **2** |
| Startup, AI, product, VC roles | **1** |
| MBB (McKinsey, Bain, BCG core strategy) | **1** |

**Density rule, both directions.** Fill the page — bottom white space means the content is too thin, so add real projects rather than stretching spacing. If a second page is used it must be at least half full. Never shrink below the minimum font to force a fit.

### Bullet formula

**Action verb + situation/context + specific action + quantified outcome.**

> "Led a **concept selection study for a national oil and gas company** on a stalled upstream asset, building the **evaluation framework** across financial, technical, and regulatory criteria and authoring the **C-suite decision document** that unlocked investment on a previously non-feasible project"

> "Drove **performance improvement** on a utility-scale solar asset returning below its hurdle rate, isolating **CapEx and OpEx optimisation levers** that lifted project **IRR from 6% to the 10% hurdle rate**"

### Selective bolding

Bold **keywords distributed through the bullet**, not one long bold lead phrase. Target the project type, the client type, the methodology name, and the number. Roughly three to five bold fragments per bullet.

### Section structure — senior consulting

```
PROFILE SUMMARY                          one paragraph, 4–5 sentences
EXPERIENCE
  Company | Role | Dates | Location      dotted top border, larger type
    CONSULTING ENGAGEMENTS               small grey uppercase sub-label
      • bullets
    AI BUILDS AND PROCESS REINVENTION    small grey uppercase sub-label
      • bullets
SKILLS                                   2–3 rows plus certifications row
EDUCATION
PUBLICATIONS                             own section when listing all seven
```

### Profile summary formula

1. Role + years + breadth + current position
2. What you own end-to-end, with first principles woven in
3. The build-and-deploy differentiator
4. Geographies + sectors

*Reference version:*
> Strategy consultant and AI builder with 10+ years across MBB consulting, growth advisory, and entrepreneurship, currently a Project Leader at Bain and Company. Owns end-to-end process reinvention engagements, applying first principles thinking to break complex enterprise workflows back to their fundamentals before redesigning them as AI-first processes, building the executive business case, and running delivery with senior stakeholders. Brings end-to-end experience building AI products and deploying them into production on the cloud. Has delivered engagements across EMEA, North America, South America, and APAC, spanning technology, telecom, energy and infrastructure, consumer goods, industrials, and financial services.

### Tool placement

Each build belongs to a specific employer. Never reassign, never merge.

| Tool | Employer |
|---|---|
| Workflow and Workforce Modernization Studio | Bain |
| Portfolio and project intelligence cockpit | Bain |
| Generative scheduling platform | Bain |
| Schedule, Cost and Risk Diagnostic AI-enabled toolkit | Bain |
| Capital Projects Intelligence Toolkit | Bain |
| Internal AI strategy team lead | Aranca |
| Project economics and cost modelling engine | Aranca |
| AI survey intelligence platform | Aranca |
| Document intelligence engine | Aranca |

**The cockpit and the diagnostic toolkit are different tools.** Never merge them.

### Side builds

CareerOS, the fantasy cricket platform, MateMate, the AI-first consulting platform, the AI proposal builder, the solar benchmarking tool and the solar PV cost modelling system belong on **startup, VC and AI/product resumes only**. Suppress on senior management-consulting resumes, where space is better spent on client engagements.

---

## PART 9 — FORMATTING SPECIFICATION

Built with the `docx` library, converted via LibreOffice headless.

### Two-page senior consulting format

```
Font               Calibri throughout
Body               size 18 (9pt)
Small/secondary    size 17
Company header     size 21 bold, role italic
Section header     size 22 bold uppercase
Sub-label          size 16 bold uppercase, colour 666666
Name               size 34 bold uppercase, centered
Page margins       top 620, right 800, bottom 620, left 800 (twips)
Section spacing    before 70, after 16
Company spacing    before 44, after 8
Sub-label spacing  before 12, after 6
Bullet spacing     after 12
Bullet line        250 (auto rule)
Bullet indent      left 220, hanging 140
Section border     bottom, SINGLE, size 6, colour 111111, space 2
Company border     top, DOTTED, size 4, colour 999999, space 6
Link colour        1155CC with single underline
Date colour        555555
```

### One-page dense format

```
Body               size 16
Company header     size 19
Section header     size 18
Page margins       top 340, right 580, bottom 340, left 580
Bullet spacing     after 7–8
Bullet line        190–210
```

---

## PART 10 — VALIDATION SEQUENCE

Run in order. Any failure is a failed build.

1. Build the `.docx`
2. Open the zip, read `word/document.xml`, replace every `—` with `, `, rewrite the zip
3. Convert to PDF via LibreOffice headless
4. Extract text with `pdftotext`; confirm em dash count is **0**
5. Confirm **no forbidden term** from Part 1 appears in the extracted text
6. Check page count with `pdfinfo` against the archetype's allowance
7. If two pages, confirm page two is at least half full
8. Render at 90–100 dpi with `pdftoppm` and visually inspect page fill

---

## PART 11 — PLATFORM POSITIONING

### LinkedIn — personal brand surface, understated

Headline: `Mostly building. Sometimes consulting. Project Leader at Bain. Engineer by training, operator by habit.`

Full stops, not pipes. Voice-led. About section permits humour and self-deprecation; no client names, no specific IRR figures, no "open to work". Do not name Madcue, Aranca or Evalueserve in the headline or About — they live in Experience. Featured: portfolio, best article, Economic Times, Dataquest. Not CareerOS. GitHub belongs in Contact Info, not Featured. Pin AI Agents, RAG and Financial Modeling; 15–18 skills total.

### Naukri — searchable database, keyword-dense

The opposite of LinkedIn. Name every firm, stack every keyword, fill every field. The headline packs role, years, firms, skills, sectors and location. 20 key skills matching literal recruiter search strings. 100% profile completeness drives roughly 4x recruiter views. Edit something every three to five days; freshness drives search ranking.

### Resumes

Tailor per JD. Never send a generic version. Match the JD's own vocabulary where honest. Two pages for senior consulting; one page elsewhere.

---

## PART 12 — OPEN GAPS

| Gap | Status |
|---|---|
| Publication URLs (all 7) | Needed to hyperlink titles. Never fabricate. |
| Delbomblr Inc content | Unknown. Never fabricate. Omit until supplied. |
| Aranca impact numbers | Port operator bid value, carbon credits platform scale, RTD launch outcome, India GTM scale all missing |
| Salary expectations | Needed for Naukri completeness |

---

## APPENDIX — MACHINE-READABLE CONFIG

Implement these as configuration files the engine reads, not as prose in a prompt.

```json
{
  "forbiddenTerms": [
    { "match": "nuclear utility", "replace": "green energy entity", "severity": "block" },
    { "match": "10 GW", "replace": null, "severity": "block" },
    { "match": "$10.45B", "replace": "$10 billion", "severity": "block" },
    { "match": "CAP Ops", "replace": null, "severity": "block" },
    { "match": "BCN", "replace": null, "severity": "block" },
    { "match": "knowledge graph-linked", "replace": "AI-based", "severity": "block",
      "scope": "consulting" },
    { "match": "—", "replace": ", ", "severity": "block" }
  ],
  "neverCite": [
    "5,232-activity", "$3.8 billion validation", "release count", "dev environment URL"
  ],
  "employerLocations": {
    "Bain and Company": "Gurgaon",
    "Aranca": "Mumbai",
    "Evalueserve": "Gurgaon",
    "Tecnova India": "Gurgaon",
    "Delbomblr Inc": "Delhi",
    "Madcue": "Bangalore"
  },
  "yearsByArchetype": {
    "consulting_senior": "10+",
    "consulting_mbb": "10+",
    "ai_product": "8",
    "startup": "8",
    "vc_investing": "10+",
    "chief_of_staff": "10+"
  },
  "pagesByArchetype": {
    "consulting_senior": 2,
    "consulting_mbb": 1,
    "ai_product": 1,
    "startup": 1,
    "vc_investing": 1
  },
  "sideBuildsAllowed": ["ai_product", "startup", "vc_investing"],
  "toolPlacement": {
    "Workflow and Workforce Modernization Studio": "Bain and Company",
    "Portfolio and project intelligence cockpit": "Bain and Company",
    "Generative scheduling platform": "Bain and Company",
    "Schedule, Cost and Risk Diagnostic AI-enabled toolkit": "Bain and Company",
    "Capital Projects Intelligence Toolkit": "Bain and Company",
    "Internal AI strategy team lead": "Aranca",
    "Project economics and cost modelling engine": "Aranca",
    "AI survey intelligence platform": "Aranca",
    "Document intelligence engine": "Aranca"
  },
  "bannedPhrases": [
    "excited to apply", "passionate about", "synergy", "cutting-edge",
    "innovative solutions", "self-starter", "proven track record", "consumer-facing"
  ]
}
```
