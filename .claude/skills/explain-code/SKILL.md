---
name: explain-code
description: Build, refresh or use the plain-English "clarity layer" for this repository, so the non-technical owner can understand every file and every section of code (what it does, why it exists, how it works, what can go wrong, how to debug it) and browse it all in the Code Explorer mind map. Use this whenever the owner asks to explain the code, a file, a feature or a flow; says they don't understand something; asks for a mind map, walkthrough or line-by-line explanation; asks to refresh or rebuild explanations or the Code Explorer; and at the end of any task that changed code, to re-explain the files that changed.
---

# Explain code: the clarity layer

The owner of this repository is not a programmer. They still need to understand, debug and judge
every part of it. The clarity layer is how: a plain-English note card for every source file, with a
note for every section of code, kept true as the code changes, and shown in one offline page.

- Notes live in `docs/clarity/` (`repo.json` for the whole repo, `files/<path>.json` per file).
- The bookkeeping script is `.claude/clarity/clarity.py`. It makes no model calls and costs nothing.
- The page is `docs/clarity/CODE_EXPLORER.html`, built by `clarity.py build`. It is git-ignored on
  normal branches because it contains a copy of the code; publish snapshots where the owner asks.

## Answering a question about the code

1. Answer the question first, in plain English, from the code itself.
2. If the file's note card exists and `check` says it is fresh, use it as a starting point, but the
   code is the authority. Never answer from notes alone about something that matters.
3. For "explain this line by line", walk through the section in short numbered steps, one per
   meaningful line or group of lines, saying what it does and why. Do this on demand rather than
   storing it, so it always reflects today's code.
4. Point the owner to the matching place in the Code Explorer (file and section id) so they can see
   the code beside the note.

## Building or refreshing the layer

Do the steps in order. Keep the main conversation lean: the reading happens in subagents.

1. **Sync.** Run `python3 .claude/clarity/clarity.py sync`. It creates cards for new files, keeps notes
   for code that did not change, and marks what needs explaining.
2. **Explain in packets.** Repeat until `next` says nothing is left:
   - `python3 .claude/clarity/clarity.py next --max-tokens 60000`
     (writes `docs/clarity/.work/packet.json`; 60,000 keeps every call under the cheaper 100K tier).
   - Ask the `explainer` subagent to read the packet and write its answer to
     `docs/clarity/.work/answer.json`. It runs on Haiku.
   - `python3 .claude/clarity/clarity.py apply docs/clarity/.work/answer.json --model haiku`
   - If `apply` reports problems, re-run that packet once. If it fails twice, stop and tell the owner.
   - After code changes, use `next --changed` so only touched files are re-explained.
3. **Repo-level notes (you, on Sonnet).** Read `docs/clarity/repo.json` and the file summaries, not
   the code, and fill in: `summary`, `who_its_for`, `how_it_runs`, `start_here` (3 to 7 files in
   reading order), `areas` (5 to 12 plain-English areas, each with `match` folder patterns, a
   `summary`, a `why` and `debug_tips`), `decisions`, `debug_playbook` and `glossary`. Then run `sync`
   again so files move into the new areas. Keep each entry to a few sentences.
4. **Spot-check (Sonnet).** Run `python3 .claude/clarity/clarity.py spotcheck` (5% of sections, at least
   10). For each sampled section, compare the note with the code and correct wrong notes in the card.
   Report the share that were wrong. If more than 1 in 10 were wrong, re-explain those files with
   Sonnet instead of Haiku and say so.
5. **Check.** `python3 .claude/clarity/clarity.py check --refs` must show nothing out of date and no
   unresolved names. For each unresolved name, either fix the note or explain why it is fine.
6. **Build.** `python3 .claude/clarity/clarity.py build`, then tell the owner where the page is.

## Where the notes live, and how they stay fresh

The portfolio keeps the main copy of every repository's notes in `raunaq-portfolio/code-notes/<repo>/`
and publishes each explorer at `/code/<repo>/`, named after the repository. A daily Claude Code routine
(`tools/clarity/ROUTINE_DAILY.md` in the portfolio) re-explains only the sections whose code changed,
within a fixed budget, and republishes. Notes made here in `docs/clarity/` are optional: the routine
merges them with the main copy by matching each note to the exact code it describes, so nothing is
lost or double-counted. Private repositories publish notes and maps, not code, unless the owner sets
`private_repositories` to `full` in `tools/clarity/publish.config.json`.

## Writing rules for every note

These are also inside every packet, so the explainer sees them. They exist because the owner will
use these notes to make decisions and to debug, so a confident wrong note is worse than none.

- Write for a smart person who has never programmed. Plain words, short sentences, active voice.
- Say what it does in terms the owner would notice in the app, then how.
- Say why. If the reason is not visible in the code, comments, names or git history, write
  "Likely reason:" or "Reason not stated in the code." Never invent history or intent.
- Name real things in backticks (functions, files, settings, tables) so they can be found.
- `watch_out` is one concrete risk or trap, or empty. No generic advice.
- Define jargon once in `terms`. No code in notes, no line-by-line paraphrase, no em dashes.
- Readiness: `ready` needs handled errors plus a test or other evidence; otherwise `needs-work` with
  reasons; `not-ready` when it would break or be unsafe in real use; `unknown` when you cannot tell.

## Cost guard

- Haiku explains, Sonnet writes repo-level notes and checks. Never Opus or Fable for this work.
- Keep every Haiku call under 100K tokens (`--max-tokens 60000` does this) and cap its output.
- Tell the owner the running cost after each repo. Pause and ask if one repo passes $1.
- If a usage limit is reached, stop cleanly. The cards already saved are kept; `next` resumes exactly
  where the work stopped.

## Example

Owner: "I don't get how the over-budget list is worked out."
Good reply: two or three plain sentences on what `find_overruns` in `costs.py` does and why, the one
thing to watch out for (zero budgets are skipped), and "In the Code Explorer: costs.py, section s3."
