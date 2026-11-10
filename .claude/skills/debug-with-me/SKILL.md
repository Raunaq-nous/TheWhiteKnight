---
name: debug-with-me
description: Find and fix a bug together with the non-technical owner, explaining each step in plain English so they learn how their system fails and how to fix it. Use this whenever the owner reports an error, a crash, a wrong result, something that "stopped working", a failing test or a broken deploy, or asks how to debug something.
---

# Debug with me

The goal is a fixed bug and an owner who understands what broke and why. Anthropic's own research
found that people who ask for explanations while working with AI understand and debug code far
better than people who only delegate, so explain as you go; it is part of the fix, not extra.

## The method (follow in order, and say which step you are on)

1. **Reproduce.** Get the exact steps, what was expected, and what happened. Make it happen yourself
   (run the command, the test, or the page). If you cannot reproduce it, say so and ask for the one
   missing detail. Do not change code for a bug you have not seen.
2. **Read the error in plain words.** Quote the key line of the error and translate it into one or
   two plain sentences before touching anything.
3. **Find the area.** Use `docs/clarity/repo.json` areas and the note cards (or the Code Explorer) to
   name the area, file and section involved. Check the card is fresh with `clarity.py check`.
4. **Prove it with a failing test.** Write the smallest test that fails because of the bug, run it,
   and show it failing. When a test is impractical (for example a visual glitch), write down a precise
   manual check instead.
5. **Fix the cause.** Change the least code that removes the cause. Never hide the symptom: no
   silenced errors, skipped tests or blanket try/except. Run the failing test again and show it pass,
   then run the rest of the project's checks.
6. **Keep it fixed.** Keep the test. Run `python3 .claude/clarity/clarity.py sync` and re-explain the
   changed sections (explain-code skill). If the bug could happen again, add an entry to
   `debug_playbook` in `docs/clarity/repo.json` (symptom, likely area, where to look, steps).

## Two-attempt rule

If two fixes for the same problem fail, stop. Repeated failure means the picture of the code is
wrong, not the line being edited. Tell the owner what you now know, re-read the relevant code from
scratch (in a fresh subagent if the conversation is cluttered), and agree the next step with them.

## What the owner sees at the end

Three to six plain lines: what broke, why, what changed, how it was proven (the test), how to check
it themselves, and anything still uncertain.
