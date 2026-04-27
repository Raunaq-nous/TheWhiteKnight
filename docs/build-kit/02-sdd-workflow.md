# Building CareerOS as an AI Product Manager

> **What this is:** an explanation of the build process framed as AI product management. You wanted to learn the PM craft for AI products while building this. This doc maps the build kit to PM concepts so the journey teaches the discipline.

## What an AI PM actually does

The classic PM does three things: **discovery** (what to build), **delivery** (shipping it), **scaling** (making it work for more users). The AI PM does the same three things with a twist: the system being built is non-deterministic, the unit of cost is tokens, and the team includes AI agents.

That last one matters more than people think. When you have AI agents on your team, your PM job changes:

- **Less**: feature debate, sprint ceremonies, ticket grooming
- **More**: spec writing, evaluation criteria, agent behavior design

The build kit you're holding is structured around those "more" categories.

## The PM artifacts you've already produced

Without realizing it, you've already produced the core PM artifacts in this conversation. The build kit codifies them:

| PM artifact | Where it lives |
|---|---|
| Vision statement | `01-Product-Brief/product-brief.md` Section 3 (North Star) |
| Target user definition | Same file, Section 2 (Who this is for) |
| Design principles | Same file, Section 4 (10 non-negotiables) |
| Scope boundary | Same file, Sections 5 and 6 (in-scope vs out-of-scope) |
| Success metrics | Same file, Section 7 |
| Tech opinion + tradeoff statement | Same file, Sections 8 and 9 |
| Methodology | `02-Spec-Driven-Workflow/sdd-workflow.md` |

If you've never written a PRD, that's what these files are. The product brief is the PRD's first draft, written before you've even talked to Claude.

## The four-phase workflow as a PM journey

Standard PM workflow vs. SDD:

| Standard PM phase | SDD equivalent | What's different |
|---|---|---|
| Discovery | Research | Subagents do parallel investigation in minutes, not weeks |
| PRD writing | Specification | The spec is executable — it directly shapes what gets built |
| Design review | Refinement | An AI plays adversary; you defend or revise |
| Engineering | Implementation | Tasks are atomic, parallelized, AI-led with PM gates |

The thing to internalize: in SDD, the PM is more important, not less. Because the AI executes faster, ambiguous PMs ship ambiguous products at higher velocity. Spec quality has become the binding constraint.

## How to think about each phase as a PM

### Research phase (Phase 1)

**The PM question:** *what do users like ours actually do, what tools have they tried, what worked, what didn't?*

You're not researching to build the perfect thing. You're researching to **avoid the obvious mistakes** — the ones that other people in this space have already made. Career-ops has been used 740+ times by its creator. ApplyPilot has shipped to thousands. Their architectural choices encode lessons we don't have to re-learn.

**Bad research:** *"Look at the top 10 job trackers and list their features."*

**Good research:** *"What did the most successful tool in this space deliberately NOT build, and why?"* That question reveals the bets you should make.

The four subagent prompts in `01-FIRST-PROMPT.md` are calibrated for "good research." Each one points at a specific learnable lesson, not a feature comparison.

### Specification phase (Phase 2)

**The PM question:** *what would I have to write so a fresh Claude session, three months from now, can build this without asking me anything?*

That's a hard test. Most PRDs fail it. The spec needs to capture:

- **What** — every behavior, every edge case
- **Why** — every "we chose this because..." so future you doesn't undo a deliberate decision
- **What not** — every "we considered this and rejected it because..."
- **When** — what's v1, what's v2, what's v3

The spec is the contract between you and the AI engineering team. A vague contract gets a vague product.

**One technique that works:** for every requirement, write the test that would prove it works. If you can't write the test, the requirement isn't specific enough yet.

### Refinement phase (Phase 3)

**The PM question:** *what would a smart adversary do to make this product fail?*

The `skeptical-reviewer` prompt is the structured version of this question. You're forcing the AI to look for spec bugs the way a security reviewer looks for code bugs.

A useful framing: *"the spec is buggy. Find the bugs."* Most teams don't believe their spec is buggy. Then the implementation breaks and they blame engineering. The spec was always buggy — the team just didn't look.

What you're hunting for in refinement:

- **Ambiguities:** "the system handles errors gracefully" → handled how, exactly?
- **Implicit assumptions:** "the user has a Gmail account" → what if they don't?
- **Conflicts:** Section 3 says X, Section 7 says not-X
- **Missing constraints:** what's the rate limit, what's the recovery path, what's the manual override
- **Underspecified UX:** "the user reviews and approves" → reviews how, in what UI, with what default action

You'll find 10-30 issues in a typical refinement pass. That's healthy. A spec with zero refinement findings was reviewed lazily.

### Implementation phase (Phase 4)

**The PM question:** *am I making the right decisions at the right level of abstraction?*

In implementation, you're approving diffs, not writing code. Your job is:

1. **Read every diff.** Even when it's tempting not to. The 5% of diffs you skim are the 5% that have bugs.
2. **Run the test for each task.** If it doesn't pass, push back.
3. **Update the spec when reality differs from plan.** The spec is a living document, not a museum piece.
4. **Catch decisions Claude made that should have been yours.** Things like "I picked Postgres over SQLite" or "I added a setting for X" — these should bubble up to you.

A useful habit: after each task, ask Claude *"what's one decision you made in this task that you'd like me to weigh in on?"* The good ones surface themselves. The bad ones, you catch in the diff.

## The PM rituals worth keeping

Borrowed from product management, adapted for AI builds:

### Weekly review (Friday, 30 min)

Use the `weekly-review` prompt from the prompt library. It surfaces:
- What's stuck (applications dormant 7+ days)
- What's overdue (follow-ups not sent)
- What's hot (active interviews)
- What worked, what didn't, what to try next week

This is the AI version of a sprint retro. Five minutes of input, structured output.

### Tradeoff log

Keep a file at `docs/tradeoffs.md`. Every time you make a non-obvious decision, write 3 lines:

```
## 2026-04-26: Markdown vs database for application storage
- Picked: markdown + YAML on disk
- Considered: SQLite, Postgres
- Rationale: portability, AI-native, easy to migrate later. Will revisit at >500 applications.
```

Future-you will thank present-you. Pattern stolen from how serious engineering teams document architectural decisions (ADRs).

### "Why are we building this" check

Once a month, re-read the product brief. If anything you're building doesn't trace back to the brief, either:
- Update the brief (the world changed)
- Stop building that thing

This is the single best technique against scope creep. It's also rare to do, because it requires honesty.

## What changes when you have multiple users

The product brief mentions "n number of profiles" — multi-tenancy is an explicit goal even though v1 is single-user. This is good PM discipline. The cost of designing for multi-user from day one is small (data model has a `user_id` field). The cost of retrofitting it later is enormous (every assumption you embedded gets revisited).

Apply this pattern broadly: **when something is cheap to design for now and expensive to add later, build the affordance even if you're not using it.**

Examples for CareerOS:
- Multi-user data model — yes, design now
- Multi-language resumes — design now (just a YAML field for the moment)
- API access for external tools — defer (you're not building an ecosystem yet)
- Mobile UI — defer (deeply expensive, low immediate return)

## The PM-engineer disagreement pattern

You will have moments where Claude pushes back on something you want. The pattern that works:

1. Claude pushes back once, with a specific concern
2. You consider the concern. If you still want it, say so explicitly: "I hear the concern, build it my way, log the disagreement"
3. Claude logs the disagreement in `docs/tradeoffs.md` with both sides
4. Six months later, you look back and either thank yourself or learn

This is healthier than either always-deferring-to-AI or always-overriding-AI. The PM job includes being the final decision-maker on judgment calls — but a good PM tracks which calls turned out wrong.

## What your job becomes when this works

If the build goes well, in three months you'll be:

- Reviewing diffs, not writing code
- Editing specs, not editing code
- Approving sends, not drafting them
- Watching the tracker, not maintaining the tracker

That's the AI PM endgame. You become the taste, the strategy, the editor — and the agents become the hands. The discipline of the build kit is what makes that future state achievable instead of theoretical.

## A final mental model

There's a saying in AI product circles: *"we used to ship products. Now we ship policies."*

What it means: in classic software, you wrote code that did exactly what you specified. The "product" was the code. In AI software, you write *policies* — rules, prompts, evaluations, guardrails — that shape what the AI does. The "product" is the policy.

CareerOS is a policy-shaped product. The CLAUDE.md is policy. The skills are policies. The hard rules are policies. The hooks are policies. The application code is thin — the policy is thick.

If that framing feels right, you're already thinking like an AI PM.
