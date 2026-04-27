# CLAUDE.md, explained line by line

> **Why this exists:** the `CLAUDE.md` you'll commit is short and dense by design. This document explains *why* each section is there, what failure mode it prevents, and what to change as the project evolves. Read it once, then delete it from the repo if you want — it's for you, not Claude.

## The 100-line rule

Anthropic's best practices doc (and every senior Claude Code user) converges on the same rule: **CLAUDE.md should be 50-100 lines.** When it gets longer, Claude starts ignoring half of it because important rules get buried in noise.

The discipline is: for every line, ask *"if I delete this, will Claude make a mistake?"* If no, delete. If a rule only applies sometimes, move it to a Skill (which loads on demand). If a rule is enforceable by code, move it to a hook (which runs deterministically).

## Section-by-section

### "What we are building" (3 lines)

This is the orientation paragraph. Claude reads it first and uses it to interpret everything below. Keep it concrete: what the system is, what pattern it follows, what the data layer looks like.

**Why it points to the product brief instead of restating it:** restating wastes context tokens on every session. The brief is loaded only when relevant.

**What to change later:** as the system grows, the one-line description may shift. If you add a major new capability (say, job market analytics), update this line.

### "Methodology" (1 line)

This anchors Claude in SDD discipline. Without it, Claude defaults to "let's start coding," which is the failure mode SDD exists to prevent.

**The phrase "Stop at every phase gate"** is doing a lot of work. It's the single sentence that prevents Claude from running ahead of you.

### "Hard rules" (the longest section)

These are the rules that must be active in every session. Each one prevents a specific known failure:

- **Rule 1 (User Layer protection):** prevents Claude from overwriting your cv.md when an update script runs. This is the single most important rule. Borrowed directly from career-ops's DATA_CONTRACT pattern.
- **Rule 2 (no em dashes):** you've seen this rule fail in our chat already. Encoding it here means every skill enforces it.
- **Rules 3-5 (resume rules):** these are personal preferences encoded as system rules. Without them, every resume generation re-debates the same questions.
- **Rule 6 (skill modes):** prevents the "monolithic prompt" anti-pattern.
- **Rule 7 (subagents for research):** prevents context pollution. The single biggest leverage point in Claude Code.
- **Rule 8 (70% context limit):** prevents the "dumb zone." The data is from real benchmarks: 0-30% context = peak, 50% = rushing, 70%+ = hallucinating.
- **Rule 9 (approve before sending):** the safety rail on auto-apply. Without this rule, the agent can do irreversible things.

**What to change later:** you'll add 1-2 rules over time as you encounter new failure modes. If a rule never fires, delete it. The right number is "as few as possible to keep Claude on the rails."

### "Layout" (the directory tree)

Claude needs a mental model of where things live. Without this, it'll create files in the wrong places. The User Layer / System Layer split is annotated so Claude knows what's safe to modify and what's not.

**What to change later:** as you add directories, update the tree. Don't let it drift.

### "How I want you to work" (the persona section)

These are interaction rules. They shape *how* Claude responds, not *what* it does. The most important one is "explain technical choices in plain language" — without that, Claude defaults to engineer-to-engineer voice and you lose the educational value.

**The "push back once, then comply" rule** is subtle but important. It prevents Claude from being a sycophant *and* prevents it from arguing forever. One push-back, then you're the boss.

### "Compaction policy"

When the context window fills past a threshold, Claude Code automatically compacts (summarizes) the conversation to save space. By default, the summary is opaque and often loses important detail.

This section tells Claude *what* to preserve. Without it, Claude might compact away the fact that you're mid-Phase-2 and you've already approved the PRD.

**What to change later:** add anything you find getting lost during compactions.

## What's deliberately NOT in CLAUDE.md

- **The product brief itself.** It's in `docs/build-kit/01-product-brief.md` and Claude reads it on demand.
- **The SDD methodology details.** Same reason — they're in `docs/build-kit/02-sdd-workflow.md`.
- **Skill instructions.** Each skill has its own SKILL.md. CLAUDE.md just establishes that skills exist.
- **My persona corpus.** That's in `persona/`. Claude reads it when generating, not on every session.
- **Specific implementation guidance.** That's the spec's job, not CLAUDE.md's.

This separation matters because everything in CLAUDE.md is loaded into the context window of *every* session. Everything in the on-demand files is loaded only when relevant. Mixing them up is the most common reason CLAUDE.md bloats and stops working.

## The hub-and-spoke pattern

CLAUDE.md is the hub. The spokes are:

```
CLAUDE.md  ──→  docs/build-kit/01-product-brief.md
           ──→  docs/build-kit/02-sdd-workflow.md
           ──→  DATA_CONTRACT.md
           ──→  docs/spec/SPEC.md  (after Phase 2)
           ──→  .claude/skills/<skill-name>/SKILL.md  (per skill)
```

Claude reads the hub on every session. It reads the spokes only when the task calls for them. That's how you get a system that *feels* fully informed without paying the token cost on every interaction.

## When to update CLAUDE.md

- After every refinement phase (you'll learn something that becomes a rule)
- When you catch Claude making the same mistake twice (turn it into a rule)
- When you delete a feature (delete the rule that supported it)
- Never as part of normal feature work

## A test for CLAUDE.md health

Open it monthly and ask: *"if I deleted this file and started fresh, would I write the same thing?"* If you'd write less, delete the difference. If you'd write more, you've been holding fixes in your head — write them down.
