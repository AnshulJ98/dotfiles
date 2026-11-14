"""zmx-pick: the loop around zpick --zmx, against fake zpick/zmx/shell on PATH."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

PICK = Path(__file__).resolve().parents[1] / "zmx-pick"
FAKE = r"""#!/usr/bin/env python3
import json, os, pathlib, sys
root = pathlib.Path(os.environ["FAKE_ROOT"])
cmd, args = pathlib.Path(sys.argv[0]).name, sys.argv[1:]
with (root / "calls").open("a") as log:
    log.write(json.dumps([cmd, args, os.environ.get("ZMX_NO_DETACH_KEY")]) + "\n")
if cmd == "zmx" and args[:1] == ["attach"] and args[1] not in os.environ.get("FAKE_DEAD", "").split(","):
    with (root / "live").open("a") as live:
        live.write(args[1] + "\n")
if cmd == "zmx" and args[:1] == ["list"]:
    sys.stdout.write((root / "live").read_text() if (root / "live").exists() else "")
if cmd == "zpick":
    answers = json.loads((root / "answers").read_text())
    n = int((root / "n").read_text()) if (root / "n").exists() else 0
    (root / "n").write_text(str(n + 1))
    rc, out = answers[n] if n < len(answers) else (1, "")
    sys.stdout.write(out)
    sys.exit(rc)
"""


class ZmxPick(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for name in ("zmx", "zpick", "sh"):
            (self.root / name).write_text(FAKE)
            (self.root / name).chmod(0o755)

    def tearDown(self):
        self.tmp.cleanup()

    def run_pick(self, answers, **env):
        (self.root / "answers").write_text(json.dumps(answers))
        full = {"PATH": f"{self.root}:/usr/bin:/bin", "HOME": str(self.root), "FAKE_ROOT": str(self.root),
                "SHELL": str(self.root / "sh"), "ZPICK": str(self.root / "zpick"), "ZMX_NO_DETACH_KEY": "1", **env}
        self.out = subprocess.run(["bash", str(PICK)], env=full, capture_output=True, text=True,
                                  timeout=10, stdin=subprocess.DEVNULL).stdout
        calls = [json.loads(l) for l in (self.root / "calls").read_text().splitlines()]
        return [c for c in calls if c[1][:1] != ["list"]]

    def test_attach_back_to_picker_then_shell_on_esc(self):
        calls = self.run_pick([[0, "logs\n"], [0, "newbox\n"], [1, ""]])
        self.assertEqual([c[:2] for c in calls], [
            ["zpick", ["--zmx"]], ["zmx", ["attach", "logs"]], ["zpick", ["--zmx"]],
            ["zmx", ["attach", "newbox"]], ["zpick", ["--zmx"]], ["sh", ["-il"]]])
        self.assertEqual({c[2] for c in calls if c[0] == "zmx"}, {None}, "ctrl+\\ must detach")

    def test_nothing_picked_shows_the_picker_again(self):
        calls = self.run_pick([[0, ""], [1, ""]])
        self.assertEqual([c[0] for c in calls], ["zpick", "zpick", "sh"])

    def test_a_session_that_never_starts_says_so_before_the_picker_returns(self):
        # zmx attach exits 0 on InvalidSessionName or NameTooLong, and the picker would redraw
        # over its error.
        calls = self.run_pick([[0, "x/y\n"], [0, "logs\n"], [1, ""]], FAKE_DEAD="x/y")
        self.assertIn("x/y", self.out)
        self.assertNotIn("logs", self.out, "a session that ran must not trigger the message")
        self.assertEqual([c[0] for c in calls], ["zpick", "zmx", "zpick", "zmx", "zpick", "sh"])

    def test_inside_a_session_switches_once(self):
        calls = self.run_pick([[0, "bare\n"]], ZMX_SESSION="dotfiles")
        self.assertEqual([c[:2] for c in calls], [["zpick", ["--zmx"]], ["zmx", ["attach", "bare"]]])


if __name__ == "__main__":
    unittest.main()
