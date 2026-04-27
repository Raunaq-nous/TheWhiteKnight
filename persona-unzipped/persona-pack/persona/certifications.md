# Raunaq's Certifications

> **What this is:** the canonical certifications list with metadata for ranking and ordering on resumes by role type.

## How CareerOS uses this file

When tailoring a resume, the `tailor-resume` skill picks 5-7 certifications from this list, ordered by relevance to the target role. The `relevance` field tells the skill which roles each cert is most useful for.

## Certifications

### AI / Agentic / Technical roles (lead with these for AI Product, Tech roles)

| Name | Issuer | Year | Relevance |
|---|---|---|---|
| Agent Skills with Anthropic | Anthropic | Mar 2026 | AI, agentic, LLM, technical |
| AI Engineering | IBM | (year) | AI, ML, technical, product |
| Vector Databases for RAG | LinkedIn Learning | (year) | AI, data, RAG, technical |
| Build RAG Applications | LinkedIn Learning | (year) | AI, data, RAG, technical |
| Agentic AI | (issuer TBD) | (year) | AI, agentic |
| Introduction to Large Language Models | (issuer TBD) | (year) | AI, ML, technical |
| CS50 Python | Harvard (edX) | (year) | Technical, programming |
| Introduction to Git and GitHub | Google | (year) | Technical, dev workflow |

### Strategy / Finance / Consulting roles (lead with these for MBB, Strategy, Consulting)

| Name | Issuer | Year | Relevance |
|---|---|---|---|
| Business & Financial Modeling | Wharton (Coursera) | (year) | Strategy, finance, consulting |
| Business Strategy | Wharton (Coursera) | (year) | Strategy, consulting |
| Performance Improvement Projects for Management Consultants | (issuer TBD) | (year) | Consulting, ops, PMO |

### Adjacent / specialized

| Name | Issuer | Year | Relevance |
|---|---|---|---|
| Tableau Business Intelligence | Tableau | (year) | Data, analytics, BI |
| Venture Capital Analyst Fundamentals | (issuer TBD) | (year) | VC, investment, fintech, crypto |
| Introduction to IT & Cybersecurity | (issuer TBD) | (year) | Technical credibility |

## Ordering rules for resumes

CareerOS picks certifications using this priority logic, given the target role's bucket:

### MBB Strategy / Consulting bucket
1. Business & Financial Modeling — Wharton
2. Business Strategy — Wharton
3. AI Engineering — IBM
4. Agent Skills — Anthropic
5. Performance Improvement Projects for Management Consultants
6. CS50 Python — Harvard
7. Venture Capital Analyst Fundamentals

### AI Product / Engineering bucket
1. Agent Skills — Anthropic
2. AI Engineering — IBM
3. Vector Databases for RAG
4. Build RAG Applications
5. Business & Financial Modeling — Wharton
6. CS50 Python — Harvard

### Chief of Staff / Founder Office bucket
1. Business & Financial Modeling — Wharton
2. Business Strategy — Wharton
3. AI Engineering — IBM
4. Agent Skills — Anthropic
5. Vector Databases for RAG
6. CS50 Python — Harvard
7. Venture Capital Analyst Fundamentals

### Strategy & Operations / PMO bucket
1. Business & Financial Modeling — Wharton
2. Business Strategy — Wharton
3. AI Engineering — IBM
4. Agent Skills — Anthropic
5. Performance Improvement Projects for Management Consultants
6. Tableau Business Intelligence

### Crypto / Web3 / Fintech bucket
1. Venture Capital Analyst Fundamentals
2. Business & Financial Modeling — Wharton
3. AI Engineering — IBM
4. Agent Skills — Anthropic
5. Vector Databases for RAG

### Aerospace / Engineering bucket
1. Business & Financial Modeling — Wharton
2. AI Engineering — IBM
3. CS50 Python — Harvard
4. Tableau Business Intelligence
5. Venture Capital Analyst Fundamentals

## Format for resume display

CareerOS renders certifications as a single line with pipe separators:

```
Certifications: [Cert 1] | [Cert 2] | [Cert 3] | [Cert 4] | [Cert 5] | [Cert 6]
```

Six certifications fits cleanly on one line for most fonts. Five if the names are longer.

## Update process

When Raunaq earns a new certification:
1. Add a new row to the relevant section above
2. Update the relevance tags
3. Add to the appropriate bucket priority lists
4. Commit with message: `feat(certs): add [cert name]`

CareerOS does NOT auto-add certifications. This file is User Layer.
