"""zmx-pick: the loop, the rows and the keys, against fake zmx/fzf/shell on PATH."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

PICK = Path(__file__).resolve().parents[1] / "zmx-pick"
LS = (
    "  name=dotfiles\tpid=1\tclients=0\tcreated=1\tcwd=file://box/home/me/Dev/dotfiles\tended=1\texit_code=0\n"
    "→ name=pi-agent\tpid=2\tclients=2\tcreated=2\tcwd=kitty-shell-cwd://box/tmp\n"
    "  name=bare\tpid=3\tclients=1\tcreated=3\n"
)
FAKE = r"""#!/usr/bin/env python3
import json, os, pathlib, sys
root = pathlib.Path(os.environ["FAKE_ROOT"])
cmd, args = pathlib.Path(sys.argv[0]).name, sys.argv[1:]
with (root / "calls").open("a") as log:
    log.write(json.dumps([cmd, args, os.environ.get("ZMX_NO_DETACH_KEY")]) + "\n")
if cmd == "zmx" and args == ["ls"]:
    sys.stdout.write((root / "ls").read_text())
if cmd == "fzf":
    sys.stdin.read()
    answers = json.loads((root / "answers").read_text())
    n = int((root / "fzf.n").read_text()) if (root / "fzf.n").exists() else 0
    (root / "fzf.n").write_text(str(n + 1))
    rc, out = answers[n] if n < len(answers) else (130, "")
    sys.stdout.write(out)
    sys.exit(rc)
"""


class ZmxPick(unittest.TestCase):
    def run_pick(self, fzf_answers, *args, env=None):
        root = Path(self.tmp.name)
        (root / "answers").write_text(json.dumps(fzf_answers))
        full = {"PATH": f"{root}:/usr/bin:/bin", "HOME": str(root), "FAKE_ROOT": str(root),
                "SHELL": str(root / "sh"), "ZMX_NO_DETACH_KEY": "1", **(env or {})}
        proc = subprocess.run(["bash", str(PICK), *args], env=full, capture_output=True, text=True, timeout=10)
        calls = [json.loads(l) for l in (root / "calls").read_text().splitlines()] if (root / "calls").exists() else []
        return proc, calls

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        for name in ("zmx", "fzf", "sh"):
            (root / name).write_text(FAKE)
            (root / name).chmod(0o755)
        (root / "ls").write_text(LS)

    def tearDown(self):
        self.tmp.cleanup()

    def test_rows(self):
        proc, _ = self.run_pick([], "--rows", env={"HOME": "/home/me"})
        rows = [r.split("\t") for r in proc.stdout.splitlines()]
        self.assertEqual([r[0] for r in rows], ["dotfiles", "pi-agent", "bare"])
        self.assertIn("~/Dev/dotfiles", rows[0][1])
        self.assertIn("2 attached", rows[1][1])
        self.assertIn("/tmp", rows[1][1])
        self.assertIn("1 attached", rows[2][1])

    def test_attach_then_back_to_picker_then_shell(self):
        proc, calls = self.run_pick([[0, "\n\npi-agent\tx\n"], [130, ""]])
        cmds = [(c, a) for c, a, _ in calls if c != "fzf" and a != ["ls"]]
        self.assertEqual(cmds, [("zmx", ["attach", "pi-agent"]), ("sh", ["-il"])])
        attach = next(c for c in calls if c[1][:1] == ["attach"])
        self.assertIsNone(attach[2], "ctrl+\\ must detach, so ZMX_NO_DETACH_KEY is unset")

    def test_typed_name_without_match_creates(self):
        _, calls = self.run_pick([[1, "newbox\n\n"], [130, ""]])
        self.assertIn(["zmx", ["attach", "newbox"], None], calls)

    def test_ctrl_n_creates_from_query_even_with_a_match(self):
        _, calls = self.run_pick([[0, "dot\nctrl-n\ndotfiles\tx\n"], [130, ""]])
        self.assertIn(["zmx", ["attach", "dot"], None], calls)

    def test_inside_a_session_switches_once(self):
        _, calls = self.run_pick([[0, "\n\nbare\tx\n"]], env={"ZMX_SESSION": "dotfiles"})
        self.assertEqual([c[:2] for c in calls if c[0] != "fzf" and c[1] != ["ls"]], [["zmx", ["attach", "bare"]]])

    def test_kill(self):
        _, calls = self.run_pick([], "--kill", "logs")
        self.assertEqual(calls, [["zmx", ["kill", "logs"], "1"]])


if __name__ == "__main__":
    unittest.main()
