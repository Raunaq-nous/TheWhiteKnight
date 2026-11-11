---
name: plan-first
description: Plan before building. Interview the owner, write a short spec with acceptance checks, record any real design decision with its alternatives, and split the work into small tasks that each end in a check. Use this for any new feature, any change that touches more than two files, anything involving sign-in, payments, data deletion or database changes, and whenever the owner says "build", "add", "redesign" or "migrate". Skip it for one-line fixes you could describe in a single sentence.
---

# Plan first

Jumping straight to code often solves the wrong problem. A short written spec gives the owner
something concrete to agree to, and gives every later step (tests, review, the explanation notes) a
standard to check against. Keep it lean: teams using spec-driven tools found that specs which keep
growing make agents lose the thread.

## Steps

1. **Explore without changing anything.** Read the relevant code and its notes in `docs/clarity/`.
   Summarise for the owner in three to five plain lines how that part works today.
2. **Interview the owner.** Use the AskUserQuestion tool. Ask at most six questions, about the hard
   parts only: who uses it, what "done" looks like, edge cases, what must not break, and trade-offs.
   Do not ask what you can find in the code.
3. **Write the spec** at `docs/specs/<short-name>.md` from `templates/SPEC.md` in the clarity kit (or
   the same headings): goal, who it is for, in scope, out of scope, how it should behave, acceptance
   checks, risks, files likely to change. One page at most.
4. **Record real decisions.** When there is more than one reasonable way to build it, write
   `docs/decisions/NNN-<short-name>.md` from `templates/DECISION.md`: the options, the choice, why,
   the trade-offs, and when to revisit. Add the same decision, shortened, to `decisions` in
   `docs/clarity/repo.json` so it shows in the Code Explorer.
5. **Split into small tasks.** Each task changes little, can be checked on its own (a test, a build,
   a screenshot), and is listed in the spec. Ask the owner to approve the spec and tasks.
6. **Build in a fresh session** using the spec as the brief. After each task: run the checks, show
   the output, commit. Then use the `reviewer` subagent on the whole diff against the spec.
7. **Finish.** Re-explain changed files (explain-code skill), tick the acceptance checks in the spec,
   and give the owner a plain summary with how to try it themselves.
