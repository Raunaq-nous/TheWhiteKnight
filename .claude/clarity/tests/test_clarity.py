"""Self-test for clarity.py. Run: python3 .claude/clarity/tests/test_clarity.py

Plain English: this builds a tiny throwaway project in a temporary folder, runs every
clarity command on it, and checks the results. It touches nothing in your repository
and makes no model calls. If every test passes, the tool works on this machine.
"""

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import clarity  # noqa: E402  (imported after adjusting the path on purpose)

PY_SOURCE = '''"""Sample module."""
import os

LIMIT = 3


def first(items):
    """Return the first item."""
    return items[0]


class Box:
    def __init__(self, value):
        self.value = value

    def get(self):
        return self.value


if __name__ == "__main__":
    print(first([1, 2]))
'''

JS_SOURCE = '''// Sample browser script.
import { thing } from "./thing.js";

export function add(a, b) {
  return a + b;
}

const multiply = (a, b) => a * b;

button.addEventListener("click", () => {
  console.log(add(1, 2), multiply(2, 3));
});
'''


def run(*args):
    """Run a clarity command and return (exit code, printed output)."""
    out = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
        code = clarity.main(list(args))
    return code, out.getvalue()


def answer_for(packet):
    """Write a valid answer for every section in a packet, as the explainer would."""
    files = []
    for item in packet["items"]:
        entry = {"path": item["path"], "sections": []}
        if item["need_file_fields"]:
            entry["file"] = {"summary": f"Summary of {item['path']}.", "purpose": "p", "why": "w", "how": "h",
                             "inputs": "i", "outputs": "o", "risks": "r", "debug": "d",
                             "readiness": {"status": "needs-work", "reasons": ["no tests"]},
                             "terms": [{"term": "API", "meaning": "a doorway for programs"}],
                             "depends_on": [], "used_by": []}
        for section in item["sections"]:
            entry["sections"].append({"id": section["id"], "title": "T", "what": f"Does {section['name']}.",
                                      "why": "", "watch_out": ""})
        files.append(entry)
    return {"files": files}


class SectionSplitting(unittest.TestCase):
    def assert_covers(self, text, family):
        sections = clarity.split_sections(text, family)
        lines = len(text.splitlines())
        self.assertEqual(sections[0]["start"], 1)
        self.assertEqual(sections[-1]["end"], lines)
        for before, after in zip(sections, sections[1:]):
            self.assertEqual(before["end"] + 1, after["start"], "sections must be contiguous")
        for section in sections:
            self.assertLessEqual(section["end"] - section["start"] + 1, clarity.MAX_SECTION_LINES)
        return sections

    def test_python_every_line_belongs_to_one_section(self):
        sections = self.assert_covers(PY_SOURCE, "python")
        names = [s["name"] for s in sections]
        self.assertIn("first", names)
        self.assertIn("Box", names)
        self.assertIn("entry point", [s["kind"] for s in sections])

    def test_javascript_functions_and_event_handlers(self):
        sections = self.assert_covers(JS_SOURCE, "js")
        names = [s["name"] for s in sections]
        self.assertTrue(any(n.startswith("add") for n in names), names)
        self.assertTrue(any("multiply" in n for n in names), names)  # tiny helpers stay named
        self.assertIn("button click handler", names)

    def test_long_function_is_split_into_parts(self):
        body = "\n".join(f"    x{i} = {i}" + ("\n" if i % 10 == 0 else "") for i in range(150))
        text = "def big():\n" + body + "\n    return 1\n"
        sections = self.assert_covers(text, "python")
        self.assertGreater(len(sections), 2)

    def test_sql_statements(self):
        text = "-- users\nCREATE TABLE users (\n  id int\n);\n\nCREATE INDEX idx ON users(id);\nSELECT 1;\n"
        self.assert_covers(text, "sql")


class EndToEnd(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "app").mkdir()
        (self.root / "app" / "main.py").write_text(PY_SOURCE, encoding="utf-8")
        (self.root / "web.js").write_text(JS_SOURCE, encoding="utf-8")
        (self.root / "node_modules").mkdir()
        (self.root / "node_modules" / "skip.js").write_text("var a = 1;\n", encoding="utf-8")
        self.old_cwd = os.getcwd()
        os.chdir(self.root)
        os.environ["GIT_CEILING_DIRECTORIES"] = str(self.root.parent)

    def tearDown(self):
        os.chdir(self.old_cwd)
        self.tmp.cleanup()

    def explain_everything(self):
        for _ in range(10):
            code, out = run("next", "--max-tokens", "60000")
            self.assertEqual(code, 0, out)
            if "Nothing left" in out:
                return
            packet = json.loads((self.root / clarity.WORK_DIR / "packet.json").read_text(encoding="utf-8"))
            answer = self.root / "answer.json"
            answer.write_text(json.dumps(answer_for(packet)), encoding="utf-8")
            code, out = run("apply", str(answer), "--model", "test")
            self.assertEqual(code, 0, out)
        self.fail("explaining did not finish")

    def test_full_cycle_sync_explain_check_build(self):
        code, out = run("sync")
        self.assertEqual(code, 0, out)
        cards = clarity.load_cards(self.root)
        self.assertEqual(sorted(cards), ["app/main.py", "web.js"], "node_modules must be left out")
        self.explain_everything()
        code, out = run("check", "--refs", "--strict")
        self.assertEqual(code, 0, out)
        code, out = run("build")
        self.assertEqual(code, 0, out)
        page = (self.root / clarity.EXPLORER_HTML).read_text(encoding="utf-8")
        self.assertIn("Summary of app/main.py.", page)
        self.assertNotIn("/*__CLARITY_DATA__*/null", page)

    def test_changed_code_loses_only_its_own_notes_and_undo_restores_them(self):
        run("sync")
        self.explain_everything()
        path = self.root / "app" / "main.py"
        original = path.read_text(encoding="utf-8")
        path.write_text(original.replace("return items[0]", "return items[-1]"), encoding="utf-8")
        run("sync")
        card = clarity.load_cards(self.root)["app/main.py"]
        pending = [s["name"] for s in card["sections"] if not s.get("what")]
        self.assertEqual(pending, ["first"], "only the edited function should need a new note")
        self.assertTrue(card["summary_stale"])
        path.write_text(original, encoding="utf-8")
        run("sync")
        card = clarity.load_cards(self.root)["app/main.py"]
        self.assertTrue(all(s.get("what") for s in card["sections"]))
        self.assertFalse(card["summary_stale"])
        self.assertEqual(clarity.card_status(card), "explained")

    def test_reference_check_catches_invented_names(self):
        run("sync")
        self.explain_everything()
        card_file = clarity.card_path(self.root, "web.js")
        card = json.loads(card_file.read_text(encoding="utf-8"))
        card["sections"][0]["what"] += " Calls `totallyMadeUpFunction` and reads `./thing.js`."
        card_file.write_text(json.dumps(card), encoding="utf-8")
        code, out = run("check", "--refs", "--strict")
        self.assertEqual(code, 1)
        self.assertIn("totallyMadeUpFunction", out)
        self.assertNotIn("./thing.js`", out.split("not found in the code")[-1].replace("totallyMadeUpFunction", ""))

    def test_apply_rejects_unknown_sections_and_paths(self):
        run("sync")
        bad = self.root / "bad.json"
        bad.write_text(json.dumps({"files": [{"path": "web.js", "sections": [{"id": "s99", "what": "x"}]},
                                             {"path": "nope.py", "sections": []}]}), encoding="utf-8")
        code, out = run("apply", str(bad))
        self.assertEqual(code, 2)
        self.assertIn("s99", out)
        self.assertIn("nope.py", out)

    def test_code_containing_script_tags_cannot_break_the_page(self):
        (self.root / "evil.js").write_text('const s = "</script><script>alert(1)</script>";\n', encoding="utf-8")
        run("sync")
        run("build")
        page = (self.root / clarity.EXPLORER_HTML).read_text(encoding="utf-8")
        template = (HERE.parent / clarity.TEMPLATE_NAME).read_text(encoding="utf-8")
        self.assertEqual(page.count("</script>"), template.count("</script>"))

    def test_changed_only_reminder(self):
        run("sync")
        self.explain_everything()
        (self.root / "web.js").write_text(JS_SOURCE + "\nconst extra = 1;\n", encoding="utf-8")
        # Outside git, nothing counts as "changed in this session", so the reminder stays quiet.
        code, out = run("check", "--changed-only")
        self.assertEqual(code, 0)


class Publishing(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "repo"
        self.site = Path(self.tmp.name) / "portfolio"
        (self.root / "app").mkdir(parents=True)
        (self.site / "public").mkdir(parents=True)
        (self.root / "app" / "main.py").write_text(PY_SOURCE, encoding="utf-8")
        self.old_cwd = os.getcwd()
        os.chdir(self.root)
        os.environ["GIT_CEILING_DIRECTORIES"] = str(self.root.parent)
        run("sync")

    def tearDown(self):
        os.chdir(self.old_cwd)
        self.tmp.cleanup()

    def test_secret_scan_finds_real_looking_keys_and_ignores_placeholders(self):
        sources = {"a.py": {"text": 'KEY = "AKIA' + "ABCDEFGHIJKLMNOP" + '"\npassword = "changeme-please"\napi_key = "q8Zr3kLm9xPw"\n'}}
        kinds = sorted({f["kind"] for f in clarity.scan_for_secrets(sources)})
        self.assertEqual(kinds, ["AWS access key", "hard-coded password or key"])

    def test_full_publish_is_blocked_by_findings_and_notes_mode_is_not(self):
        (self.root / "app" / "keys.py").write_text('TOKEN = "ghp_' + "a" * 36 + '"\n', encoding="utf-8")
        run("sync")
        code, out = run("publish", "--portfolio", str(self.site), "--slug", "demo", "--mode", "full")
        self.assertEqual(code, 3, out)
        self.assertFalse((self.site / "public" / "code" / "demo" / "index.html").exists())
        code, out = run("publish", "--portfolio", str(self.site), "--slug", "demo", "--mode", "notes")
        self.assertEqual(code, 0, out)
        page = (self.site / "public" / "code" / "demo" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("ghp_", page, "notes mode must not embed any code")
        manifest = json.loads((self.site / "public" / "code" / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual([e["slug"] for e in manifest["entries"]], ["demo"])
        self.assertEqual(manifest["entries"][0]["mode"], "notes")

    def test_republishing_replaces_the_entry_instead_of_duplicating_it(self):
        for _ in range(2):
            code, out = run("publish", "--portfolio", str(self.site), "--slug", "demo", "--mode", "full")
            self.assertEqual(code, 0, out)
        manifest = json.loads((self.site / "public" / "code" / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(len(manifest["entries"]), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
