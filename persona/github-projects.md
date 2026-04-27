# Raunaq's GitHub Projects

> **What this is:** the canonical project index. Every reference to "GitHub repos" or "AI builds" in any external content (resumes, cover letters, portfolio pages) pulls from this file. Tools are described **by capability**, never by repo name. Repo names appear here for internal reference only.

## CareerOS — TheWhiteKnight (the meta-project)

**What it is:** the personal AI-powered job application command center we are building. Lives at `github.com/Raunaq-nous/TheWhiteKnight`. Deployed at `raunaq-nous.github.io/TheWhiteKnight`.

**Capability framing:** "A personal AI command center that ingests job descriptions, scores them against target profiles, generates tailored materials in my voice, drafts founder and colleague outreach, tracks the entire pipeline, and learns my preferences over time."

**Stack:** Next.js, Tailwind CSS, GitHub Pages, GitHub Actions, Anthropic API.

## AI Toolkit (5 modules built at Bain)

These are positioned as "an integrated agentic AI platform" or "an AI toolkit for capital project analytics" depending on context.

### 1. Document intelligence engine

- **Capability framing:** "RAG-based document intelligence engine for natural language retrieval across large contract and regulatory libraries; replaces manual document search with structured, source-cited query responses."
- **Repo:** Universal-RAG (and RAG-Learning for the experimentation work)
- **Stack:** Python, LangChain, vector databases, Streamlit
- **Use case:** consulting engagements where a partner asks "find every clause in these 200 PDFs that mentions X"

### 2. Multi-agent workplan generator

- **Capability framing:** "Multi-agent LLM workplan generator that automates project schedule logic from a brief; uses chained LLM reasoning to build structured workplans with tasks, dependencies, owners, and milestones, then checks outputs for consistency across agents."
- **Repo:** [Standalone, part of the toolkit]
- **Stack:** Python, LangChain
- **Use case:** the first week of any consulting engagement, when the team needs a workplan and a partner has only given a one-paragraph brief

### 3. AI financial modeling and scenario engine

- **Capability framing:** "AI financial modeling and scenario comparison engine enabling real-time CapEx, OpEx, and IRR analysis across multiple project concepts simultaneously; applied in live client engagements to accelerate commercial decision-making."
- **Repo:** Financial_Modelling_Final_Version1
- **Stack:** Python, LangChain, agentic financial modeling
- **Use case:** O&G concept selection studies, solar performance improvement, capital allocation modeling

### 4. Knowledge graph-linked schedule optimization platform

- **Capability framing:** "Knowledge graph-linked schedule optimization platform for EPC and construction projects; integrates schedule, cost, and dependency data into a single optimization layer with visual exploration."
- **Repo:** Schedule_Optimization_Version_1
- **Stack:** React, FastAPI, D3.js, knowledge graphs
- **Use case:** large capital programs where schedule, cost, and resourcing trade-offs need to be visualized and optimized together

### 5. Capital allocation opportunity trigger system

- **Capability framing:** "Capital allocation opportunity trigger mapping tool that analyzes capital allocation portfolios to identify reallocation signals and account growth opportunities."
- **Repo:** Capital-Projects-Watcher
- **Stack:** Python, LangChain, monitoring frameworks
- **Use case:** continuous portfolio monitoring vs traditional quarterly review cycles

## AI-first consulting platform (Haus-Nous)

**Important rule:** never name this platform "Haus-Nous" in any external content. Always describe by capability.

**Capability framing:** "AI-first strategy consulting platform with 12+ purpose-built tools across Strategy, Operations, Finance, Analytics, and Innovation; features a natural language console for business problem-solving, agentic tool orchestration, and an AI-enhanced consulting framework library."

**Repo:** Haus-Nous (private/internal)

**Stack:** Next.js 14+, TypeScript, Tailwind CSS, Anthropic API, multi-agent orchestration

## Solar / energy modeling

### Solar PV cost modeling system

- **Capability framing:** "Multi-agent solar PV cost modeling system for utility-scale project economics."
- **Repo:** SVPCM_Version_1
- **Stack:** Python, agentic frameworks

### Solar cost modeling tool

- **Repo:** Solar-Cost-Modelling
- **Capability framing:** "Domain-specific cost modeling tool for solar project CapEx and OpEx analysis."

### Solar project benchmarking

- **Repo:** Solar-Project-Benchmarking
- **Capability framing:** "Cross-project benchmarking system for utility-scale solar project performance."

## Other AI builds

### AI proposal builder

- **Capability framing:** "AI proposal builder that automates the structured generation of consulting proposals from engagement context."
- **Repo:** Proposal-Builder

### AI survey intelligence platform

- **Capability framing:** "AI survey intelligence platform — automated research lifecycle management from question design through analysis."
- **Repo:** PULSE
- **Stack:** Python, LLM integrations

## How to reference these in external content

**On a resume bullet:**
> "Built an integrated agentic AI platform spanning financial modeling, document intelligence, workplan generation, and portfolio monitoring; live at portfolio link, demonstrating thought leadership in applied AI for consulting."

**In a cover letter:**
> "The AI builds are live and working. A multi-agent LLM workplan generator. A RAG-based document intelligence engine for large contract libraries. An AI financial modeling and scenario comparison engine applied in live client engagements."

**In LinkedIn or portfolio:**
> "Built and shipped 12+ purpose-built AI tools for internal consulting use, plus 5 production AI modules deployed in client engagements."

**In an interview:**
> Reference specific capabilities in response to specific questions. The repo names are internal trivia, the capabilities are the substance.

## Tech stack mentioned across repos

- **Languages:** Python, TypeScript, JavaScript
- **AI:** LangChain, Anthropic Claude API, vector databases (Chroma, Pinecone, FAISS), multi-agent orchestration, RAG systems
- **Frontend:** React, Next.js 14+, Tailwind CSS, D3.js, Streamlit
- **Backend:** FastAPI, Node.js
- **Data and viz:** SQL, knowledge graphs, structured data pipelines
- **Infrastructure:** GitHub, GitHub Actions, GitHub Pages, Vercel (some projects)

## When CareerOS generates content referencing these

**Always:**
- Describe by capability and outcome
- Mention stack only when relevant to the role
- Link to portfolio.github.io page, not directly to repos (unless the role specifically asks for code samples)

**Never:**
- List repo names in parentheses
- Combine two distinct tools in one bullet
- Use the proper noun "Haus-Nous" in external content
- Overclaim — every tool listed here actually exists and is described accurately
