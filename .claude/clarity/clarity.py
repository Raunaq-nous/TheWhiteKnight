#!/usr/bin/env python3
"""clarity.py: keeps a plain-English explanation of every file in a repository.

What this tool is for
---------------------
The owner of the repository is not a programmer, but still needs to understand,
debug and judge every part of the code. This script is the bookkeeper of that
"clarity layer". It never calls an AI model and never goes on the internet, so
running it costs no tokens. The writing happens in Claude Code (a cheap model
explains each packet of code); this script prepares the work, checks the answers
and builds the visual Code Explorer.

Commands (run from the repository root)
---------------------------------------
  sync    Make or refresh a note card for every source file. Each card splits its
          file into small sections: the setup lines at the top, each function,
          each class, each database statement. When a file changes, only the
          sections whose code changed lose their notes, so they get re-explained
          and nothing out of date is ever shown as current.
  next    Write the next work packet: code that still needs explaining, numbered
          line by line, plus the writing rules and the exact answer format. Sized
          to stay under a token budget so a small model can handle it in one call.
  apply   Save a model's answers (JSON) onto the note cards, after checking that
          every note matches a real section.
  check   Report coverage, out-of-date notes, and names in notes that do not exist
          in the code. With --changed-only it acts as a reminder for files you
          touched in this session (used by a Claude Code Stop hook).
  build   Produce docs/clarity/CODE_EXPLORER.html: one self-contained page with a
          mind map, every file with notes beside its code, a readiness scorecard,
          decisions, a debugging guide and a glossary. Opens offline in a browser.
  guard-commit
          A Claude Code hook: pauses `git commit` while files you changed have
          missing or out-of-date notes, so code and explanations never drift apart.
  spotcheck
          Pick a random sample of explained sections for a stronger model to verify.
  publish Put the explorer on the portfolio site: public/code/<slug>/ plus an entry in
          public/code/manifest.json. "full" includes the code after a clean secret scan;
          "notes" (the default) publishes only the plain-English notes and mind map.

Where things are stored (inside the repository)
-----------------------------------------------
  docs/clarity/repo.json          repo-level notes: summary, areas, decisions,
                                  readiness, debugging playbook, glossary
  docs/clarity/files/<path>.json  one note card per source file
  docs/clarity/.work/             scratch packets and answers (git-ignored)
  .clarityignore                  optional extra patterns to leave out

Requires Python 3.8 or newer and nothing else.
"""

from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import hashlib
import json
import math
import random
import re
import subprocess
import sys
from pathlib import Path

VERSION = "1.2.0"
SCHEMA_VERSION = 1

CLARITY_DIR = Path("docs") / "clarity"
FILES_DIR = CLARITY_DIR / "files"
WORK_DIR = CLARITY_DIR / ".work"
REPO_JSON = CLARITY_DIR / "repo.json"
EXPLORER_HTML = CLARITY_DIR / "CODE_EXPLORER.html"
TEMPLATE_NAME = "explorer_template.html"

# Code tokenizes more densely than prose, so a conservative ratio keeps packets
# safely under the budget (a pilot found ~3 characters per token for code).
DEFAULT_CHARS_PER_TOKEN = 3.0
PACKET_OVERHEAD_TOKENS = 1800      # instructions and answer format
FILE_OVERHEAD_TOKENS = 120         # per-file header inside a packet
MAX_SECTION_LINES = 60             # longer sections are split into parts
MIN_SECTION_LINES = 3              # shorter sections merge into the previous one
KEEP_SMALL_KINDS = {"entry point", "route"}  # too important to fold into a neighbour
NAMED_KINDS = {"function", "class", "type", "value", "method", "event handler", "block"}
MAX_FILE_LINES = 6000              # bigger files are almost always generated
MAX_LINE_CHARS = 400               # very long lines (minified code) are cut
MAX_NOTE_CHARS = 1500              # longer notes are trimmed when applied

LANGUAGES = {
    ".py": ("Python", "python"),
    ".ts": ("TypeScript", "js"), ".tsx": ("TypeScript (React)", "js"),
    ".js": ("JavaScript", "js"), ".jsx": ("JavaScript (React)", "js"),
    ".mjs": ("JavaScript", "js"), ".cjs": ("JavaScript", "js"),
    ".vue": ("Vue component", "js"), ".svelte": ("Svelte component", "js"),
    ".sql": ("SQL", "sql"),
    ".go": ("Go", "brace"), ".rs": ("Rust", "brace"), ".java": ("Java", "brace"),
    ".kt": ("Kotlin", "brace"), ".cs": ("C#", "brace"), ".swift": ("Swift", "brace"),
    ".c": ("C", "brace"), ".h": ("C header", "brace"), ".cpp": ("C++", "brace"),
    ".hpp": ("C++ header", "brace"), ".php": ("PHP", "brace"), ".dart": ("Dart", "brace"),
    ".rb": ("Ruby", "ruby"),
    ".sh": ("Shell script", "shell"), ".bash": ("Shell script", "shell"),
    ".css": ("CSS", "css"), ".scss": ("SCSS", "css"),
    ".html": ("HTML", "plain"), ".r": ("R", "plain"),
}

# Configuration files matter for understanding how an app runs and is deployed.
CONFIG_NAMES = {
    "package.json", "pyproject.toml", "requirements.txt", "setup.cfg", "setup.py",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml", "Makefile",
    "Procfile", "tsconfig.json", "vite.config.ts", "vite.config.js",
    "next.config.js", "next.config.mjs", "next.config.ts", "drizzle.config.ts",
    "tailwind.config.js", "tailwind.config.ts", ".replit", "replit.nix",
    "vercel.json", "netlify.toml", "fly.toml", "render.yaml", ".env.example",
}

EXCLUDED_DIRS = {
    "node_modules", "dist", "build", ".next", "out", "coverage", "vendor",
    "__pycache__", ".venv", "venv", ".git", ".cache", ".turbo",
    ".pytest_cache", ".mypy_cache", "target", "obj", ".idea", ".vscode",
    "graphify-out", ".claude", "site-packages", ".parcel-cache", ".svelte-kit",
}

EXCLUDED_PATTERNS = [
    "*.min.js", "*.min.css", "*.map", "*.lock", "package-lock.json",
    "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Cargo.lock", "*.snap",
    "*.generated.*", "*_pb2.py", "*.pb.go", "docs/clarity/*",
]

READINESS_FILE_STATES = {"ready", "needs-work", "not-ready", "unknown"}
READINESS_CHECK_STATES = {"pass", "partial", "fail", "unknown"}

DEFAULT_CHECKS = [
    ("starts", "Does the app build and start with one documented command?"),
    ("tests", "Are there automated tests, and do they pass?"),
    ("errors", "When something goes wrong, does the app show a clear message instead of crashing or failing silently?"),
    ("inputs", "Does it check what people type or upload before using it?"),
    ("secrets", "Are passwords and API keys kept out of the code and out of git history?"),
    ("access", "Can only the right people see and change things (sign-in and permissions)?"),
    ("data", "Is important data backed up, and are database changes made through migrations?"),
    ("dependencies", "Are third-party packages reasonably up to date and free of known security problems?"),
    ("logs", "If it breaks while people use it, will logs or alerts show what happened?"),
    ("performance", "Does it stay fast with realistic amounts of data and users?"),
    ("deploy", "Is there a written, repeatable way to deploy it and to roll back a bad release?"),
    ("docs", "Could someone new run it and understand it from the docs alone?"),
]

FILE_TEXT_FIELDS = ("summary", "purpose", "why", "how", "inputs", "outputs", "risks", "debug")
SECTION_TEXT_FIELDS = ("title", "what", "why", "watch_out")

WRITING_RULES = """\
You are writing notes for the owner of this software. They are smart but have never programmed.
Write so they can understand, debug and judge the code without reading it.

For every section:
- what: 1 to 3 sentences on what this piece does, in terms of what a user or the app would notice.
- why: 1 to 2 sentences on why it exists or why it is written this way. If the reason is not visible
  in the code, comments or names, start with "Likely reason:" or write "Reason not stated in the code."
  Never invent history or intent.
- watch_out: at most 1 sentence on a concrete thing that could go wrong here, or that someone changing
  this code must keep in mind. Leave it empty if there is nothing real.
- title: a short plain-English name for the section (3 to 7 words), not the function name.

For each file that asks for file fields (need_file_fields is true), also fill:
summary (one sentence), purpose, why, how (the steps in order), inputs, outputs, risks, debug
(where to look and what to try when this file misbehaves), readiness, terms, depends_on, used_by.

Style:
- Plain words, short sentences, active voice. Define any technical word in `terms` the first time
  (for example {"term": "API", "meaning": "a doorway other programs use to ask this app for data"}).
- Use exact names in backticks when you mention a function, file, setting or table, so it can be found.
- Explain intent, not syntax. Never write line-by-line paraphrase such as "line 3 sets x to 1".
- No code in notes, no markdown headings, no em dashes.
- readiness.status: "ready" only if errors are handled and there is a test or other clear evidence;
  "needs-work" with reasons otherwise; "not-ready" if it would break or be unsafe in real use
  (for example a hardcoded secret or a debug switch left on); "unknown" if you cannot tell.
- If something is genuinely unclear, say so. An honest "this is unclear" beats a confident guess.

Example of a weak note: "This function loops over rows and appends to a list."
Example of a strong note: "Goes through every project and keeps only those whose actual cost is more
than the allowed margin above budget, worst first, so the home page can list them."
"""

ANSWER_FORMAT = {
    "files": [
        {
            "path": "exact path from the packet",
            "file": {
                "summary": "...", "purpose": "...", "why": "...", "how": "...",
                "inputs": "...", "outputs": "...", "risks": "...", "debug": "...",
                "readiness": {"status": "ready | needs-work | not-ready | unknown", "reasons": ["..."]},
                "terms": [{"term": "...", "meaning": "..."}],
                "depends_on": ["paths or package names"],
                "used_by": ["paths, if visible"],
            },
            "sections": [
                {"id": "s1", "title": "...", "what": "...", "why": "...", "watch_out": ""},
            ],
        }
    ]
}

# ---------------------------------------------------------------------------
# Section boundaries: lines where a new, separately explainable piece begins.
# These are deliberately simple regular expressions. They do not need to be
# perfect: every line always belongs to exactly one section, and long sections
# are split further, so a missed boundary only makes a section a bit bigger.
# ---------------------------------------------------------------------------
_JS_IDENT = r"[A-Za-z_$][\w$]*"
BOUNDARIES = {
    "python": [
        (re.compile(r"^(?:async\s+)?def\s+([A-Za-z_]\w*)"), "function"),
        (re.compile(r"^class\s+([A-Za-z_]\w*)"), "class"),
        (re.compile(r"^if\s+__name__\s*==\s*['\"]__main__['\"]"), "entry point"),
    ],
    "js": [
        (re.compile(r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(" + _JS_IDENT + r")?"), "function"),
        (re.compile(r"^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(" + _JS_IDENT + r")"), "class"),
        (re.compile(r"^(?:export\s+)?(?:const|let|var)\s+(" + _JS_IDENT + r")\s*(?::[^=]+)?=\s*(?:async\s+)?"
                    r"(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|" + _JS_IDENT + r"\s*=>|<)"), "function"),
        (re.compile(r"^(?:export\s+)?(?:declare\s+)?(?:interface|type|enum)\s+(" + _JS_IDENT + r")"), "type"),
        (re.compile(r"^(?:export\s+)?(?:const|let|var)\s+(" + _JS_IDENT + r")\s*(?::[^=]+)?=\s*"
                    r"(?:\{|\[|new\s|styled|create|define|z\.|pgTable|sqliteTable|mysqlTable)"), "value"),
        (re.compile(r"^\s{0,4}(?:app|router|server|api|fastify)\.(get|post|put|patch|delete|use|all|route)\s*\("), "route"),
        (re.compile(r"^(" + _JS_IDENT + r"(?:\." + _JS_IDENT + r")*)\.(?:addEventListener|on|once)\s*\(\s*['\"`]([\w:.-]+)"), "event handler"),
        (re.compile(r"^export\s+default\b"), "export"),
        (re.compile(r"^describe\s*\(\s*['\"`]([^'\"`]+)"), "test group"),
    ],
    "sql": [
        (re.compile(r"^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT|WITH|GRANT|REVOKE|"
                    r"COMMENT|BEGIN|COMMIT|TRUNCATE|DO)\b", re.IGNORECASE), "statement"),
    ],
    "brace": [
        (re.compile(r"^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:fn|func|impl|struct|enum|trait|interface|"
                    r"class|object|record|type|module|namespace)\s+([A-Za-z_]\w*)"), "block"),
        (re.compile(r"^(?:(?:public|private|protected|internal|static|final|abstract|override|virtual|"
                    r"async|suspend|fun|function)\s+)+[\w<>\[\],.?\s*&:]*?([A-Za-z_]\w*)\s*\("), "function"),
    ],
    "ruby": [
        (re.compile(r"^\s{0,2}(?:def|class|module)\s+([A-Za-z_][\w.:?!]*)"), "block"),
    ],
    "shell": [
        (re.compile(r"^(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{?"), "function"),
    ],
    "css": [
        (re.compile(r"^([^\s{}/@*][^{]*)\{\s*$"), "rule"),
        (re.compile(r"^(@media[^{]*)\{\s*$"), "rule"),
    ],
    "plain": [],
}

# Inside a long section, prefer to split at a method boundary before a blank line.
INNER_BOUNDARIES = {
    "python": re.compile(r"^\s+(?:async\s+)?def\s+([A-Za-z_]\w*)"),
    "js": re.compile(r"^\s{2,4}(?:(?:static|async|get|set|public|private|protected|readonly|override)\s+)*"
                     r"(" + _JS_IDENT + r")\s*\([^)]*\)\s*(?::[^{]+)?\{\s*$"),
    "brace": re.compile(r"^\s{2,8}(?:(?:public|private|protected|internal|static|final|override|async|fun|func|fn|pub)\s+)+"
                        r"[\w<>\[\],.?\s*&:]*?([A-Za-z_]\w*)\s*\("),
    "ruby": re.compile(r"^\s{2,}def\s+([A-Za-z_][\w.?!]*)"),
}

ATTACHABLE_PREFIXES = {
    "python": ("@", "#"),
    "js": ("//", "/*", "*", "*/", "@"),
    "brace": ("//", "/*", "*", "*/", "@", "#["),
    "sql": ("--",),
    "ruby": ("#",),
    "shell": ("#",),
    "css": ("/*", "*", "*/"),
    "plain": (),
}


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def sha256_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def short_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def run_git(args, cwd: Path):
    try:
        result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True)
        return result.stdout
    except (OSError, subprocess.CalledProcessError):
        return None


def repo_root() -> Path:
    out = run_git(["rev-parse", "--show-toplevel"], Path.cwd())
    return Path(out.strip()) if out else Path.cwd()


def load_json(path: Path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    tmp.replace(path)  # atomic on the same disk, so a crash never leaves half a card


def read_source(path: Path):
    """Return the file's text, or None if it is binary or not UTF-8."""
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    if b"\x00" in raw[:4096]:
        return None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return None


def slug(text: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return value or "area"


def estimate_tokens(text: str, chars_per_token: float) -> int:
    return int(math.ceil(len(text) / max(chars_per_token, 1.0)))


def display_path(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(path)


def card_path(root: Path, rel: str) -> Path:
    return root / FILES_DIR / (rel + ".json")


def classify(rel: str):
    """Return (language label, family) for a source file, or None if it is not one."""
    name = rel.rsplit("/", 1)[-1]
    if name in CONFIG_NAMES:
        return ("Configuration", "plain")
    if rel.startswith(".github/workflows/") and name.endswith((".yml", ".yaml")):
        return ("Automation workflow", "plain")
    suffix = "." + name.rsplit(".", 1)[-1] if "." in name else ""
    return LANGUAGES.get(suffix)


def load_ignore_patterns(root: Path):
    patterns = list(EXCLUDED_PATTERNS)
    ignore = root / ".clarityignore"
    if ignore.exists():
        for line in ignore.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                patterns.append(line.rstrip("/") + ("/*" if line.endswith("/") else ""))
    return patterns


def is_excluded(rel: str, patterns) -> bool:
    parts = rel.split("/")
    if any(part in EXCLUDED_DIRS for part in parts[:-1]):
        return True
    name = parts[-1]
    return any(fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(name, pat) for pat in patterns)


def list_repo_files(root: Path):
    out = run_git(["ls-files", "-co", "--exclude-standard"], root)
    if out is not None:
        files = [line.strip() for line in out.splitlines() if line.strip()]
    else:
        files = [p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()]
    return sorted(set(files))


def scan_sources(root: Path):
    """Find every source file worth explaining. Returns (sources, skipped)."""
    patterns = load_ignore_patterns(root)
    sources, skipped = {}, []
    for rel in list_repo_files(root):
        if is_excluded(rel, patterns):
            continue
        kind = classify(rel)
        if not kind:
            continue
        path = root / rel
        if not path.is_file():
            continue
        text = read_source(path)
        if text is None:
            skipped.append({"path": rel, "reason": "binary or not UTF-8 text"})
            continue
        line_count = len(text.splitlines())
        if line_count == 0:
            continue
        if line_count > MAX_FILE_LINES:
            skipped.append({"path": rel, "reason": f"{line_count} lines, probably generated"})
            continue
        sources[rel] = {"language": kind[0], "family": kind[1], "text": text}
    return sources, skipped


# ---------------------------------------------------------------------------
# Splitting a file into sections
# ---------------------------------------------------------------------------
def _boundary_name(match, kind: str, line: str) -> str:
    groups = [g for g in match.groups() if g] if match.groups() else []
    if kind == "event handler" and len(groups) >= 2:
        return f"{groups[0]} {groups[1]} handler"
    if groups:
        return groups[0]
    return kind if kind != "export" else "default export"


def _is_attachable(line: str, family: str) -> bool:
    stripped = line.strip()
    return bool(stripped) and stripped.startswith(ATTACHABLE_PREFIXES.get(family, ()))


def _split_long(section, lines, family):
    start, end = section["start"], section["end"]
    if end - start + 1 <= MAX_SECTION_LINES:
        return [section]
    inner = INNER_BOUNDARIES.get(family)
    chunks = []  # (start, end, inner_name)
    cur, cur_name = start, None
    while end - cur + 1 > MAX_SECTION_LINES:
        lo = cur + MAX_SECTION_LINES // 2
        hi = cur + MAX_SECTION_LINES - 1
        split_at, next_name = None, None
        if inner is not None:
            for ln in range(hi, lo - 1, -1):
                match = inner.match(lines[ln - 1])
                if match:
                    split_at = ln
                    next_name = match.group(1) if match.groups() else None
                    # pull leading comments/decorators of the method into the new chunk
                    while split_at - 1 > lo and _is_attachable(lines[split_at - 2], family):
                        split_at -= 1
                    break
        if split_at is None:
            for ln in range(hi, lo - 1, -1):
                if not lines[ln - 1].strip():
                    split_at = ln + 1
                    break
        if split_at is None or split_at <= cur:
            split_at = hi + 1
        chunks.append((cur, split_at - 1, cur_name))
        cur, cur_name = split_at, next_name
    chunks.append((cur, end, cur_name))
    base = section["name"]
    out = []
    for index, (c_start, c_end, inner_name) in enumerate(chunks, start=1):
        if inner_name:
            name, kind = f"{base}: {inner_name}", "method"
        elif index == 1:
            name, kind = f"{base} (part 1)", section["kind"]
        else:
            name, kind = f"{base} (part {index})", section["kind"]
        out.append({"start": c_start, "end": c_end, "kind": kind, "name": name})
    return out


def split_sections(text: str, family: str):
    """Split a file into contiguous sections that together cover every line."""
    lines = text.splitlines()
    total = len(lines)
    if total == 0:
        return []
    found = {}
    for number, line in enumerate(lines, start=1):
        for regex, kind in BOUNDARIES.get(family, []):
            match = regex.match(line)
            if match:
                found[number] = (kind, _boundary_name(match, kind, line))
                break
    # Comments and decorators directly above a boundary belong to it.
    starts = {}
    taken = set(found)
    for number in sorted(found):
        begin = number
        while begin > 1 and (begin - 1) not in taken and _is_attachable(lines[begin - 2], family):
            begin -= 1
        taken.update(range(begin, number))
        starts[begin] = found[number]
    bounds = sorted(starts)
    sections = []
    if not bounds or bounds[0] != 1:
        sections.append({"start": 1, "end": (bounds[0] - 1) if bounds else total,
                         "kind": "setup", "name": "File setup"})
    for index, begin in enumerate(bounds):
        finish = (bounds[index + 1] - 1) if index + 1 < len(bounds) else total
        kind, name = starts[begin]
        sections.append({"start": begin, "end": finish, "kind": kind, "name": name})
    merged = []
    for section in sections:
        size = section["end"] - section["start"] + 1
        if merged and size < MIN_SECTION_LINES and section["kind"] not in KEEP_SMALL_KINDS:
            previous = merged[-1]
            previous["end"] = section["end"]
            if section["kind"] in NAMED_KINDS and len(previous["name"]) < 80:
                previous["name"] = f"{previous['name']}, {section['name']}"  # keep tiny helpers visible
        else:
            merged.append(section)
    result = []
    for section in merged:
        result.extend(_split_long(section, lines, family))
    for number, section in enumerate(result, start=1):
        section["id"] = f"s{number}"
        body = "\n".join(lines[section["start"] - 1:section["end"]])
        section["hash"] = short_hash(body)
        for field in SECTION_TEXT_FIELDS:
            section.setdefault(field, "")
    return result


# ---------------------------------------------------------------------------
# Areas: the handful of plain-English parts the owner thinks in
# ---------------------------------------------------------------------------
GROUP_ROOTS = {"src", "app", "lib", "packages", "apps", "server", "client",
               "frontend", "backend", "services", "components", "pages", "api"}


def derive_areas(paths):
    """Default areas from folders. Claude later renames and regroups them."""
    counts = {}
    for rel in paths:
        parts = rel.split("/")
        if len(parts) == 1:
            key = "(root files)"
        elif parts[0] in GROUP_ROOTS and len(parts) >= 3:
            key = parts[0] + "/" + parts[1]
        else:
            key = parts[0]
        counts[key] = counts.get(key, 0) + 1
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    keep = [key for key, _ in ranked[:11]]
    areas = []
    for key in keep:
        if key == "(root files)":
            match = ["*"]  # assigned last, see assign_area
        else:
            match = [key + "/*"]
        areas.append({"id": slug(key), "name": key, "match": match,
                      "summary": "", "why": "", "debug_tips": ""})
    if len(ranked) > len(keep):
        areas.append({"id": "other", "name": "Everything else", "match": [],
                      "summary": "", "why": "", "debug_tips": ""})
    return areas


def assign_area(rel: str, areas) -> str:
    fallback = None
    for area in areas:
        for pattern in area.get("match", []):
            if pattern == "*":
                if "/" not in rel:
                    fallback = fallback or area["id"]
                continue
            if fnmatch.fnmatch(rel, pattern):
                return area["id"]
    if fallback:
        return fallback
    for area in areas:
        if area["id"] == "other":
            return "other"
    return areas[-1]["id"] if areas else "other"


def default_repo(root: Path):
    return {
        "schema_version": SCHEMA_VERSION,
        "name": root.name,
        "commit": None,
        "synced_at": None,
        "summary": "",
        "who_its_for": "",
        "how_it_runs": "",
        "start_here": [],
        "areas": [],
        "decisions": [],
        "readiness": {
            "overall": "unknown",
            "summary": "",
            "checked_at": None,
            "checks": [{"id": cid, "question": question, "status": "unknown",
                        "evidence": "", "next_step": ""} for cid, question in DEFAULT_CHECKS],
        },
        "debug_playbook": [],
        "glossary": [],
        "skipped": [],
    }


# ---------------------------------------------------------------------------
# Card status
# ---------------------------------------------------------------------------
def card_status(card) -> str:
    sections = card.get("sections", [])
    noted = sum(1 for s in sections if s.get("what"))
    if card.get("summary") and not card.get("summary_stale") and noted == len(sections):
        return "explained"
    if noted or card.get("summary"):
        return "partial"
    return "new"


def load_cards(root: Path):
    cards = {}
    base = root / FILES_DIR
    if not base.exists():
        return cards
    for path in base.rglob("*.json"):
        try:
            card = load_json(path, None)
        except (OSError, json.JSONDecodeError) as error:
            print(f"  Warning: could not read {path}: {error}", file=sys.stderr)
            continue
        if isinstance(card, dict) and card.get("path"):
            cards[card["path"]] = card
    return cards


def new_card(rel: str, info, sections, area: str):
    card = {
        "schema_version": SCHEMA_VERSION,
        "path": rel,
        "language": info["language"],
        "lines": len(info["text"].splitlines()),
        "hash": sha256_text(info["text"]),
        "area": area,
        "status": "new",
        "summary_stale": False,
        "readiness": {"status": "unknown", "reasons": []},
        "terms": [],
        "depends_on": [],
        "used_by": [],
        "sections": sections,
        "explained_at": None,
        "explained_by": None,
    }
    for field in FILE_TEXT_FIELDS:
        card[field] = ""
    return card


NOTE_ARCHIVE_LIMIT = 60  # notes kept for code that was changed, in case the change is undone


def refresh_card(card, info, area: str):
    """Update a card for changed code, keeping notes for sections that did not change.

    Notes are matched by the exact text of each section, so moving code up or down
    keeps its note. Notes for code that changed are archived (by content), so if the
    change is undone the old note comes straight back without another model call.
    """
    sections = split_sections(info["text"], info["family"])
    archive = card.get("note_archive", {})
    old_by_hash = {}
    for old in card.get("sections", []):
        if old.get("what"):
            old_by_hash.setdefault(old.get("hash"), old)
            archive[old.get("hash")] = {field: old.get(field, "") for field in SECTION_TEXT_FIELDS}
    changed = False
    for section in sections:
        source = old_by_hash.get(section["hash"]) or archive.get(section["hash"])
        if source and source.get("what"):
            for field in SECTION_TEXT_FIELDS:
                section[field] = source.get(field, "")
        else:
            changed = True
    while len(archive) > NOTE_ARCHIVE_LIMIT:
        archive.pop(next(iter(archive)))
    new_hash = sha256_text(info["text"])
    card["note_archive"] = archive
    card["sections"] = sections
    card["hash"] = new_hash
    card["lines"] = len(info["text"].splitlines())
    card["language"] = info["language"]
    card["area"] = area
    if card.get("summary"):
        if card.get("summary_hash"):
            card["summary_stale"] = card["summary_hash"] != new_hash
        else:
            card["summary_stale"] = changed or bool(card.get("summary_stale"))
    card["status"] = card_status(card)
    return changed


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
def cmd_sync(args) -> int:
    root = repo_root()
    sources, skipped = scan_sources(root)
    repo = load_json(root / REPO_JSON, None) or default_repo(root)
    if not repo.get("areas"):
        repo["areas"] = derive_areas(sources.keys())
    cards = load_cards(root)
    created = updated = unchanged = removed = 0
    for rel, info in sources.items():
        area = assign_area(rel, repo["areas"])
        card = cards.get(rel)
        if card is None:
            save_json(card_path(root, rel), new_card(rel, info, split_sections(info["text"], info["family"]), area))
            created += 1
        elif card.get("hash") != sha256_text(info["text"]):
            refresh_card(card, info, area)
            save_json(card_path(root, rel), card)
            updated += 1
        else:
            if card.get("area") != area:
                card["area"] = area
                save_json(card_path(root, rel), card)
            unchanged += 1
    for rel in list(cards):
        if rel not in sources:
            card_file = card_path(root, rel)
            if card_file.exists():
                card_file.unlink()
            removed += 1
    commit = run_git(["rev-parse", "--short", "HEAD"], root)
    repo["commit"] = commit.strip() if commit else None
    repo["synced_at"] = now_iso()
    repo["skipped"] = skipped
    repo["start_here"] = [p for p in repo.get("start_here", []) if p in sources]
    save_json(root / REPO_JSON, repo)
    gitignore = root / CLARITY_DIR / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text(".work/\nCODE_EXPLORER.html\n", encoding="utf-8")
    print(f"Clarity sync for {repo['name']}: {len(sources)} source files.")
    print(f"  New note cards: {created}. Updated for changed code: {updated}. "
          f"Unchanged: {unchanged}. Removed for deleted files: {removed}.")
    if skipped:
        print(f"  Left out {len(skipped)} files (binary, not text, or too large to be hand-written).")
    pending = _pending_summary(load_cards(root))
    print(f"  Still to explain: {pending['files']} files, {pending['sections']} sections.")
    return 0


def _pending_summary(cards):
    files = sum(1 for c in cards.values() if card_status(c) != "explained")
    sections = sum(1 for c in cards.values() for s in c.get("sections", []) if not s.get("what"))
    return {"files": files, "sections": sections}


def _numbered(lines, start, end) -> str:
    out = []
    for number in range(start, end + 1):
        text = lines[number - 1]
        if len(text) > MAX_LINE_CHARS:
            text = text[:MAX_LINE_CHARS] + " ...(line cut, it is very long)"
        out.append(f"{number:>5} | {text}")
    return "\n".join(out)


def _changed_paths(root: Path):
    out = run_git(["status", "--porcelain", "--untracked-files=all"], root)
    if out is None:
        return set()
    paths = set()
    for line in out.splitlines():
        entry = line[3:].strip()
        if " -> " in entry:
            entry = entry.split(" -> ", 1)[1]
        paths.add(entry.strip('"'))
    return paths


def cmd_next(args) -> int:
    root = repo_root()
    repo = load_json(root / REPO_JSON, None)
    if repo is None:
        print("No clarity layer yet. Run `sync` first.", file=sys.stderr)
        return 1
    cards = load_cards(root)
    wanted = set(args.paths or [])
    if args.changed:
        wanted |= _changed_paths(root)
    area_order = {area["id"]: index for index, area in enumerate(repo.get("areas", []))}
    start_here = set(repo.get("start_here", []))

    def priority(card):
        stale = 0 if card.get("summary_stale") or card_status(card) == "partial" else 1
        first = 0 if card["path"] in start_here else 1
        return (stale, first, area_order.get(card.get("area"), 99), card["path"])

    queue = [c for c in cards.values() if card_status(c) != "explained"]
    if wanted:
        queue = [c for c in queue if c["path"] in wanted]
    queue.sort(key=priority)
    if not queue:
        print("Nothing left to explain. Every section has notes.")
        return 0

    budget = args.max_tokens - PACKET_OVERHEAD_TOKENS
    used = 0
    items = []
    for card in queue:
        if len(items) >= args.max_files:
            break
        text = read_source(root / card["path"])
        if text is None or sha256_text(text) != card.get("hash"):
            print(f"  Skipping {card['path']}: it changed since the last sync. Run `sync` again.", file=sys.stderr)
            continue
        lines = text.splitlines()
        need_file = (not card.get("summary")) or bool(card.get("summary_stale"))
        pending = [s for s in card.get("sections", []) if not s.get("what")]
        if not pending and not need_file:
            continue
        cost = FILE_OVERHEAD_TOKENS
        chosen = []
        for section in pending:
            code = _numbered(lines, section["start"], section["end"])
            section_cost = estimate_tokens(code, args.chars_per_token) + 40
            if used + cost + section_cost > budget and (items or chosen):
                break
            chosen.append({"id": section["id"], "start": section["start"], "end": section["end"],
                           "kind": section["kind"], "name": section["name"], "code": code})
            cost += section_cost
        if not chosen and pending:
            break
        outline = [{"id": s["id"], "lines": f"{s['start']}-{s['end']}", "name": s["name"]}
                   for s in card.get("sections", [])]
        item = {
            "path": card["path"],
            "language": card.get("language"),
            "area": card.get("area"),
            "lines": card.get("lines"),
            "need_file_fields": need_file,
            "outline": outline,
            "sections": chosen,
        }
        if len(chosen) < len(pending):
            item["note"] = (f"You are seeing {len(chosen)} of the {len(pending)} sections that still need notes in "
                            "this file. Use the outline to understand the whole file.")
        if need_file and not chosen:
            sample_end = min(len(lines), 120)
            item["file_sample"] = _numbered(lines, 1, sample_end)
            cost += estimate_tokens(item["file_sample"], args.chars_per_token)
        items.append(item)
        used += cost
        if used >= budget:
            break
    if not items:
        print("Nothing could be packed. Run `sync` and try again.", file=sys.stderr)
        return 1
    packet = {
        "packet_version": 1,
        "tool": f"clarity.py {VERSION}",
        "repo": repo.get("name"),
        "created_at": now_iso(),
        "estimated_tokens": used + PACKET_OVERHEAD_TOKENS,
        "instructions": WRITING_RULES,
        "answer_format": ANSWER_FORMAT,
        "items": items,
    }
    out = Path(args.out) if args.out else root / WORK_DIR / "packet.json"
    save_json(out, packet)
    section_count = sum(len(i["sections"]) for i in items)
    remaining = _pending_summary(cards)
    print(f"Wrote {display_path(out, root)}: {len(items)} files, "
          f"{section_count} sections, about {packet['estimated_tokens']:,} tokens.")
    print(f"  Still pending across the repo before this packet: {remaining['files']} files, "
          f"{remaining['sections']} sections.")
    return 0


def _clean_text(value) -> str:
    if not isinstance(value, str):
        return ""
    value = value.strip().replace("\u2014", ", ")
    if len(value) > MAX_NOTE_CHARS:
        value = value[:MAX_NOTE_CHARS].rsplit(" ", 1)[0] + " ..."
    return value


def _parse_answer(raw: str):
    raw = raw.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw, re.DOTALL)
    if fenced:
        raw = fenced.group(1)
    data = json.loads(raw)
    if isinstance(data, list):
        data = {"files": data}
    if not isinstance(data, dict) or not isinstance(data.get("files"), list):
        raise ValueError("The answer must be a JSON object with a 'files' list.")
    return data


def cmd_apply(args) -> int:
    root = repo_root()
    try:
        answer = _parse_answer(Path(args.answer).read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Could not read the answer: {error}", file=sys.stderr)
        return 1
    files_done = sections_done = 0
    problems = []
    for item in answer["files"]:
        rel = str(item.get("path", "")).strip()
        if rel.startswith("./"):
            rel = rel[2:]
        path = card_path(root, rel)
        card = load_json(path, None)
        if card is None:
            problems.append(f"{rel}: no note card with this path (check the path or run sync).")
            continue
        current = read_source(root / rel)
        if current is not None and sha256_text(current) != card.get("hash"):
            problems.append(f"{rel}: the file changed after the packet was made; notes not applied.")
            continue
        info = item.get("file") or {}
        if info:
            for field in FILE_TEXT_FIELDS:
                if field in info:
                    card[field] = _clean_text(info.get(field))
            readiness = info.get("readiness") or {}
            status = str(readiness.get("status", "unknown")).strip().lower()
            card["readiness"] = {
                "status": status if status in READINESS_FILE_STATES else "unknown",
                "reasons": [_clean_text(r) for r in readiness.get("reasons", []) if isinstance(r, str)][:6],
            }
            terms = []
            for term in info.get("terms", []) or []:
                if isinstance(term, dict) and term.get("term") and term.get("meaning"):
                    terms.append({"term": _clean_text(term["term"])[:80], "meaning": _clean_text(term["meaning"])})
            card["terms"] = terms[:20]
            for field in ("depends_on", "used_by"):
                values = info.get(field) or []
                card[field] = [str(v).strip() for v in values if isinstance(v, (str, int))][:30]
            card["summary_stale"] = False
            card["summary_hash"] = card.get("hash")
        by_id = {s["id"]: s for s in card.get("sections", [])}
        for note in item.get("sections", []) or []:
            section = by_id.get(str(note.get("id", "")).strip())
            if section is None:
                problems.append(f"{rel}: section id {note.get('id')!r} does not exist; ignored.")
                continue
            what = _clean_text(note.get("what"))
            if not what:
                problems.append(f"{rel} {section['id']}: empty 'what'; left pending.")
                continue
            section["what"] = what
            for field in ("title", "why", "watch_out"):
                section[field] = _clean_text(note.get(field))
            sections_done += 1
        card["explained_at"] = now_iso()
        card["explained_by"] = args.model or answer.get("model") or card.get("explained_by")
        card["status"] = card_status(card)
        save_json(path, card)
        files_done += 1
    print(f"Applied notes to {files_done} files and {sections_done} sections.")
    for problem in problems[:50]:
        print(f"  Problem: {problem}")
    if len(problems) > 50:
        print(f"  ...and {len(problems) - 50} more problems.")
    pending = _pending_summary(load_cards(root))
    print(f"  Still to explain: {pending['files']} files, {pending['sections']} sections.")
    return 0 if not problems or args.allow_problems else 2


IDENT_RE = re.compile(r"[A-Za-z_$][\w$]*")
BACKTICK_RE = re.compile(r"`([^`\n]{1,120})`")


PATH_EXTENSIONS = {"py", "js", "jsx", "ts", "tsx", "mjs", "cjs", "json", "md", "csv", "sql", "yml", "yaml",
                   "toml", "html", "css", "scss", "txt", "sh", "env", "cfg", "ini", "lock", "vue", "svelte"}


def _looks_like_path(token: str) -> bool:
    if "/" in token:
        return True
    if token.startswith(".") or "." not in token:
        return False
    return token.rsplit(".", 1)[-1].lower() in PATH_EXTENSIONS


def _reference_problems(cards, sources, root: Path):
    """Find backticked names in notes that appear nowhere in the code or the file tree.

    A name counts as found when it appears literally in its own file, literally in any
    other source file, as an existing path, or (for dotted names) as a known identifier.
    This keeps false alarms rare: a note may quote a web address, a setting such as
    `debug=True`, or a file the code creates at run time.
    """
    identifiers = set()
    for info in sources.values():
        identifiers.update(IDENT_RE.findall(info["text"]))
    corpus = None
    all_paths = set(sources)
    problems = []
    for rel, card in cards.items():
        own = sources.get(rel, {}).get("text", "")
        texts = [card.get(f, "") for f in FILE_TEXT_FIELDS]
        texts += [s.get(f, "") for s in card.get("sections", []) for f in ("what", "why", "watch_out")]
        for text in texts:
            for token in BACKTICK_RE.findall(text or ""):
                token = token.strip()
                bare = token[:-2] if token.endswith("()") else token
                if not bare or " " in bare.strip():
                    continue
                if bare in own:
                    continue
                if _looks_like_path(bare):
                    if bare in all_paths or any(p.endswith("/" + bare) for p in all_paths) or (root / bare).exists():
                        continue
                else:
                    last = re.split(r"[.:#]", bare)[-1]
                    if bare in identifiers or (last and last in identifiers and "." in bare):
                        continue
                if corpus is None:
                    corpus = "\n".join(info["text"] for info in sources.values())
                if bare in corpus:
                    continue
                problems.append((rel, token))
    return problems


def _stale_changed_files(root: Path, sources=None, cards=None):
    """Source files changed in the working tree whose notes are missing or out of date."""
    if sources is None:
        sources, _ = scan_sources(root)
    if cards is None:
        cards = load_cards(root)
    stale = []
    for rel in sorted(p for p in _changed_paths(root) if p in sources):
        card = cards.get(rel)
        if card is None or card.get("hash") != sha256_text(sources[rel]["text"]) or card_status(card) != "explained":
            stale.append(rel)
    return stale


def cmd_guard_commit(args) -> int:
    """Claude Code PreToolUse hook: block `git commit` while changed files have stale notes.

    Reads the hook's JSON from standard input. Anything that is not a git commit passes
    straight through. Exit code 2 tells Claude Code to block the command and show the
    message to Claude, which then refreshes the notes and commits again. Put
    [skip-clarity] in a commit message to bypass the guard in an emergency.
    """
    raw = sys.stdin.read() if not sys.stdin.isatty() else ""
    try:
        event = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return 0
    command = str((event.get("tool_input") or {}).get("command", ""))
    if "git commit" not in command or "[skip-clarity]" in command:
        return 0
    root = repo_root()
    if not (root / REPO_JSON).exists():
        return 0  # no clarity layer in this repository yet, so nothing to protect
    stale = _stale_changed_files(root)
    if not stale:
        return 0
    listing = ", ".join(stale[:12]) + (" and more" if len(stale) > 12 else "")
    print(f"Commit paused by the clarity guard: {len(stale)} changed file(s) have missing or out-of-date "
          f"explanations: {listing}. Run `python3 .claude/clarity/clarity.py sync`, re-explain them with "
          "`next --changed`, the explainer subagent and `apply`, then commit again.", file=sys.stderr)
    return 2


def cmd_check(args) -> int:
    root = repo_root()
    repo = load_json(root / REPO_JSON, None)
    if repo is None:
        message = "No clarity layer yet. Run `python3 .claude/clarity/clarity.py sync` to start one."
        print(message, file=sys.stderr if args.block else sys.stdout)
        return 0
    sources, _ = scan_sources(root)
    cards = load_cards(root)
    changed = [p for p, info in sources.items() if p in cards and cards[p].get("hash") != sha256_text(info["text"])]
    unsynced = [p for p in sources if p not in cards]
    removed = [p for p in cards if p not in sources]

    if args.changed_only:
        stale = _stale_changed_files(root, sources, cards)
        if not stale:
            print("Clarity: explanations are up to date for the files changed in this session.")
            return 0
        listing = ", ".join(stale[:12]) + (" and more" if len(stale) > 12 else "")
        message = (f"Clarity reminder: {len(stale)} changed file(s) have out-of-date or missing explanations: "
                   f"{listing}. Before finishing, run `python3 .claude/clarity/clarity.py sync` and re-explain "
                   "them with the explain-code skill, so the owner's notes stay true.")
        if args.block:
            print(message, file=sys.stderr)
            return 2
        print(message)
        return 0

    total_files = len(cards)
    explained = sum(1 for c in cards.values() if card_status(c) == "explained")
    total_sections = sum(len(c.get("sections", [])) for c in cards.values())
    noted = sum(1 for c in cards.values() for s in c.get("sections", []) if s.get("what"))
    tally = {}
    for card in cards.values():
        status = card.get("readiness", {}).get("status", "unknown")
        tally[status] = tally.get(status, 0) + 1
    refs = _reference_problems(cards, sources, root) if args.refs else []
    report = {
        "repo": repo.get("name"),
        "files": total_files, "files_explained": explained,
        "sections": total_sections, "sections_with_notes": noted,
        "changed_since_explained": sorted(changed), "not_synced": sorted(unsynced),
        "cards_for_deleted_files": sorted(removed), "readiness": tally,
        "unresolved_names": [{"file": f, "name": n} for f, n in refs],
    }
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        def pct(part, whole):
            return f"{(100.0 * part / whole):.1f}%" if whole else "n/a"
        print(f"Clarity check for {repo.get('name')}")
        print(f"  Files explained: {explained} of {total_files} ({pct(explained, total_files)})")
        print(f"  Sections with notes: {noted} of {total_sections} ({pct(noted, total_sections)})")
        print(f"  Changed since they were explained: {len(changed)}" + (f" ({', '.join(changed[:8])})" if changed else ""))
        print(f"  New files not yet synced: {len(unsynced)}" + (f" ({', '.join(unsynced[:8])})" if unsynced else ""))
        print(f"  Note cards for files that no longer exist: {len(removed)}")
        print("  File readiness: " + ", ".join(f"{k} {v}" for k, v in sorted(tally.items())))
        if args.refs:
            print(f"  Names in notes not found in the code: {len(refs)}")
            for rel, name in refs[:15]:
                print(f"    {rel}: `{name}`")
        if changed or unsynced or removed:
            print("Next step: run `python3 .claude/clarity/clarity.py sync`, then explain the pending files.")
    healthy = not (changed or unsynced or removed) and explained == total_files and not refs
    if args.strict and not healthy:
        return 1
    return 0



# ---------------------------------------------------------------------------
# Secret scan: run before any code is published on a public site
# ---------------------------------------------------------------------------
SECRET_PATTERNS = [
    ("private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}")),
    ("AI provider key", re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("Stripe live key", re.compile(r"\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}")),
    ("JSON web token", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("hard-coded password or key", re.compile(
        r"(?i)\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret)\b"
        r"\s*[:=]\s*['\"]([^'\"\s]{8,})['\"]")),
]
PLACEHOLDER_RE = re.compile(r"(?i)(example|placeholder|your[_-]|changeme|change[_-]me|dummy|sample|xxx|<|\$\{|\*\*\*|test|fake|todo|replace)")


def scan_for_secrets(sources):
    """Return findings as dicts: path, line, kind and a masked preview. Placeholders are ignored."""
    findings = []
    for rel, info in sorted(sources.items()):
        for number, line in enumerate(info["text"].splitlines(), start=1):
            for kind, regex in SECRET_PATTERNS:
                match = regex.search(line)
                if not match:
                    continue
                value = match.group(1) if match.groups() else match.group(0)
                if kind == "hard-coded password or key" and PLACEHOLDER_RE.search(value):
                    continue
                masked = value[:4] + "*" * max(4, min(12, len(value) - 4))
                findings.append({"path": rel, "line": number, "kind": kind, "preview": masked})
                break
    return findings


def cmd_spotcheck(args) -> int:
    """Pick a random sample of explained sections for a stronger model to verify."""
    root = repo_root()
    cards = load_cards(root)
    pool = [(c["path"], s) for c in cards.values() for s in c.get("sections", []) if s.get("what")]
    if not pool:
        print("No explained sections yet.")
        return 0
    rng = random.Random(args.seed)
    count = max(args.minimum, int(len(pool) * args.fraction))
    sample = rng.sample(pool, min(count, len(pool)))
    items = []
    for rel, section in sample:
        text = read_source(root / rel) or ""
        lines = text.splitlines()
        if section["end"] > len(lines):
            continue
        items.append({"path": rel, "id": section["id"], "lines": f"{section['start']}-{section['end']}",
                      "note": {k: section.get(k, "") for k in SECTION_TEXT_FIELDS},
                      "code": _numbered(lines, section["start"], section["end"])})
    out = Path(args.out) if args.out else root / WORK_DIR / "spotcheck.json"
    save_json(out, {"instructions": "For each item, compare the note with the code. Mark each note "
                                    "'correct', 'minor issue' or 'wrong', and give a corrected note when "
                                    "it is wrong. Then report the share of wrong notes.",
                    "items": items})
    print(f"Wrote {len(items)} sections to check into {out}.")
    return 0


def _site_context(args):
    site = {}
    for key in ("site_url", "owner", "slug", "project_name", "map", "project", "repo_url"):
        value = getattr(args, key, None)
        if value:
            site["url" if key == "site_url" else key] = value
    if getattr(args, "private", False):
        site["private"] = True
    if getattr(args, "index", False):
        site["index"] = True
    if getattr(args, "no_project_page", False):
        site["project_page"] = False
    if getattr(args, "no_code", False):
        site["mode"] = "notes"
    return site


def cmd_build(args) -> int:
    root = repo_root()
    repo = load_json(root / REPO_JSON, None)
    if repo is None:
        print("No clarity layer yet. Run `sync` first.", file=sys.stderr)
        return 1
    template_path = Path(args.template) if args.template else Path(__file__).with_name(TEMPLATE_NAME)
    if not template_path.exists():
        print(f"Template not found: {template_path}", file=sys.stderr)
        return 1
    cards = load_cards(root)
    files_out = {}
    for rel in sorted(cards):
        card = dict(cards[rel])
        card.pop("note_archive", None)
        text = read_source(root / rel)
        card["fresh"] = text is not None and sha256_text(text) == card.get("hash")
        card["status"] = card_status(card)
        if text is not None and not args.no_code:
            card["code"] = text
        files_out[rel] = card
    data = {
        "generator": f"clarity.py {VERSION}",
        "built_at": now_iso(),
        "repo": repo,
        "site": _site_context(args),
        "files": files_out,
    }
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    # Make the JSON safe inside an HTML <script> element whatever the code contains.
    payload = payload.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    template = template_path.read_text(encoding="utf-8")
    if "/*__CLARITY_DATA__*/null" not in template:
        print("The template is missing its data placeholder.", file=sys.stderr)
        return 1
    title = re.sub(r"[<>&\"]", "", str(repo.get("name") or "Repository"))
    page = template.replace("/*__CLARITY_DATA__*/null", payload).replace("__CLARITY_TITLE__", title)
    out = Path(args.out) if args.out else root / EXPLORER_HTML
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")
    size_mb = out.stat().st_size / (1024 * 1024)
    print(f"Built {out} ({size_mb:.1f} MB, {len(files_out)} files). Open it in any browser; it works offline.")
    return 0


def cmd_publish(args) -> int:
    """Publish this repository's Code Explorer into a portfolio site checkout.

    Writes <portfolio>/public/code/<slug>/index.html (plus map.html when a technical map is
    given) and records the repository in <portfolio>/public/code/manifest.json, which the
    portfolio reads to link each project page to its explorer. In "full" mode the code is
    included, so the secret scan must come back clean first. In "notes" mode the code and the
    technical map stay out and only the plain-English notes and the mind map are published.
    """
    root = repo_root()
    repo = load_json(root / REPO_JSON, None)
    if repo is None:
        print("No clarity layer yet. Run `sync` and explain the repository first.", file=sys.stderr)
        return 1
    portfolio = Path(args.portfolio).resolve()
    if not (portfolio / "public").is_dir():
        print(f"{portfolio} does not look like the portfolio checkout (no public/ folder).", file=sys.stderr)
        return 1
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,60}", args.slug):
        print("The slug must be lowercase letters, digits and hyphens, matching the portfolio page.", file=sys.stderr)
        return 1
    sources, _ = scan_sources(root)
    if args.mode == "full":
        findings = scan_for_secrets(sources)
        if findings and not args.allow_findings:
            print(f"Publishing stopped: the secret scan found {len(findings)} possible secret(s) in code that would become public:")
            for item in findings[:40]:
                print(f"  {item['path']}:{item['line']}  {item['kind']}  {item['preview']}")
            print("Review each one with the owner. Remove or rotate real secrets, or publish with --mode notes. "
                  "Only after the owner confirms they are safe, re-run with --allow-findings.")
            return 3
    out_dir = portfolio / "public" / "code" / args.slug
    out_dir.mkdir(parents=True, exist_ok=True)
    map_name = None
    if args.graph and args.mode == "full":
        graph = Path(args.graph)
        if graph.is_file():
            (out_dir / "map.html").write_bytes(graph.read_bytes())
            map_name = "map.html"
        else:
            print(f"  Note: technical map {graph} not found; publishing without it.")
    elif (out_dir / "map.html").exists():
        (out_dir / "map.html").unlink()  # never leave an old map behind in notes mode
    build_args = argparse.Namespace(
        out=str(out_dir / "index.html"), no_code=(args.mode == "notes"), template=args.template,
        site_url=args.site_url, owner=args.owner, slug=args.slug, project_name=args.project_name,
        map=map_name, index=True, no_project_page=args.no_project_page or not args.project,
        project=args.project, repo_url=args.repo_url, private=args.private)
    code = cmd_build(build_args)
    if code:
        return code
    cards = load_cards(root)
    summary = (repo.get("summary") or "").strip()
    first_sentence = re.split(r"(?<=[.!?])\s", summary, maxsplit=1)[0] if summary else ""
    stale_files = 0
    for rel, card in cards.items():
        info = sources.get(rel)
        if info is None or card.get("hash") != sha256_text(info["text"]) or card_status(card) != "explained":
            stale_files += 1
    entry = {
        "slug": args.slug,
        "repo": args.repo or repo.get("name"),
        "name": args.project_name or repo.get("name"),
        "project": args.project,
        "visibility": "private" if args.private else "public",
        "repo_url": args.repo_url,
        "stale_files": stale_files,
        "summary": first_sentence,
        "files": len(cards),
        "explained": sum(1 for c in cards.values() if card_status(c) == "explained"),
        "sections": sum(len(c.get("sections", [])) for c in cards.values()),
        "lines": sum(int(c.get("lines") or 0) for c in cards.values()),
        "readiness": (repo.get("readiness") or {}).get("overall", "unknown"),
        "mode": args.mode,
        "map": bool(map_name),
        "commit": repo.get("commit"),
        "built_at": now_iso(),
    }
    manifest_path = portfolio / "public" / "code" / "manifest.json"
    manifest = load_json(manifest_path, {"generator": f"clarity.py {VERSION}", "entries": []})
    entries = [e for e in manifest.get("entries", []) if e.get("slug") != args.slug] + [entry]
    manifest["entries"] = sorted(entries, key=lambda e: e["slug"])
    manifest["updated_at"] = now_iso()
    save_json(manifest_path, manifest)
    print(f"Published {args.slug} ({args.mode}) to {display_path(out_dir, portfolio)} and updated public/code/manifest.json.")
    return 0


def build_parser():
    parser = argparse.ArgumentParser(
        prog="clarity.py",
        description="Plain-English explanations for every file in a repository. Makes no model calls.",
    )
    parser.add_argument("--version", action="version", version=f"clarity.py {VERSION}")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("sync", help="create or refresh note cards for every source file")

    p_next = sub.add_parser("next", help="write the next work packet of code to explain")
    p_next.add_argument("--max-tokens", type=int, default=60000,
                        help="token budget for the packet (default 60000, safely under a 100K line)")
    p_next.add_argument("--max-files", type=int, default=40, help="most files in one packet (default 40)")
    p_next.add_argument("--chars-per-token", type=float, default=DEFAULT_CHARS_PER_TOKEN)
    p_next.add_argument("--paths", nargs="*", help="only these files")
    p_next.add_argument("--changed", action="store_true", help="only files changed in the working tree")
    p_next.add_argument("--out", help="where to write the packet (default docs/clarity/.work/packet.json)")

    p_apply = sub.add_parser("apply", help="save a model's JSON answer onto the note cards")
    p_apply.add_argument("answer", help="path to the answer JSON")
    p_apply.add_argument("--model", help="which model wrote the notes, for the record")
    p_apply.add_argument("--allow-problems", action="store_true", help="exit 0 even if some notes were rejected")

    p_check = sub.add_parser("check", help="report coverage, staleness and unresolved names")
    p_check.add_argument("--refs", action="store_true", help="also check names in notes exist in the code")
    p_check.add_argument("--changed-only", action="store_true", help="only files changed in this session")
    p_check.add_argument("--block", action="store_true", help="exit 2 with the message on stderr (for hooks)")
    p_check.add_argument("--strict", action="store_true", help="exit 1 unless everything is explained and fresh")
    p_check.add_argument("--json", action="store_true", help="machine-readable output")

    sub.add_parser("guard-commit", help="Claude Code hook: block git commit while changed files have stale notes")

    p_spot = sub.add_parser("spotcheck", help="sample explained sections for a stronger model to verify")
    p_spot.add_argument("--fraction", type=float, default=0.05)
    p_spot.add_argument("--minimum", type=int, default=10)
    p_spot.add_argument("--seed", type=int, default=7)
    p_spot.add_argument("--out")

    p_build = sub.add_parser("build", help="build the self-contained Code Explorer HTML page")
    p_build.add_argument("--out", help="output path (default docs/clarity/CODE_EXPLORER.html)")
    p_build.add_argument("--no-code", action="store_true", help="leave the code out (smaller file)")
    p_build.add_argument("--template", help="path to a different explorer template")
    for p in (p_build,):
        p.add_argument("--site-url", help="portfolio home URL, for links back to the site")
        p.add_argument("--owner", help="name shown as the first breadcrumb, for example the site owner's name")
        p.add_argument("--slug", help="the project's page slug on the portfolio")
        p.add_argument("--project-name", help="the project's display name on the portfolio")
        p.add_argument("--map", help="relative link to a technical map page, if any")
        p.add_argument("--index", action="store_true", help="link to the site's code index page")
        p.add_argument("--no-project-page", action="store_true", help="the repository has no project page on the site")
        p.add_argument("--project", help="slug of the matching project page on the site, if there is one")
        p.add_argument("--repo-url", help="https://github.com/<owner>/<repo>, for 'open these lines on GitHub' links")
        p.add_argument("--private", action="store_true", help="the repository is private (links need sign-in)")

    p_pub = sub.add_parser("publish", help="publish the explorer into a portfolio site checkout")
    p_pub.add_argument("--portfolio", required=True, help="path to the portfolio repository checkout")
    p_pub.add_argument("--slug", required=True, help="the project's page slug on the portfolio")
    p_pub.add_argument("--mode", choices=["full", "notes"], default="notes",
                       help="full includes the code (public repositories); notes leaves it out (default)")
    p_pub.add_argument("--repo", help="owner/name of the repository, for the record")
    p_pub.add_argument("--project-name", help="the project's display name")
    p_pub.add_argument("--site-url", help="portfolio home URL, for links back to the site")
    p_pub.add_argument("--owner", help="name shown as the first breadcrumb")
    p_pub.add_argument("--graph", help="path to graphify-out/graph.html to publish as the technical map (full mode only)")
    p_pub.add_argument("--template", help="path to a different explorer template")
    p_pub.add_argument("--no-project-page", action="store_true",
                       help="the repository has no project page; it is listed on the code index only")
    p_pub.add_argument("--project", help="slug of the matching project page on the site, if there is one")
    p_pub.add_argument("--repo-url", help="https://github.com/<owner>/<repo>, for line links")
    p_pub.add_argument("--private", action="store_true", help="the repository is private")
    p_pub.add_argument("--allow-findings", action="store_true",
                       help="publish despite secret-scan findings, only after the owner has reviewed them")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    handlers = {"sync": cmd_sync, "next": cmd_next, "apply": cmd_apply, "check": cmd_check,
                "spotcheck": cmd_spotcheck, "build": cmd_build, "guard-commit": cmd_guard_commit,
                "publish": cmd_publish}
    return handlers[args.command](args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:  # output piped into a command such as `head` that stopped reading
        sys.exit(0)
