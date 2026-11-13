"""Switcher integration tests; app commands are faked, files and symlinks are real."""
import json
import os
import plistlib
import tomllib
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
NAMES = ("ayu-ink", "ayu-neutral", "coffee-neutral", "midnightvoid",
         "soviet-dark", "void-ink", "void-neutral")


class ThemeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.themes = self.base / "themes"
        shutil.copytree(ROOT, self.themes, ignore=shutil.ignore_patterns(
            "current", "test_theme.py", "__pycache__"))
        self.home = self.base / "home"
        self.home.mkdir()
        self.bin = self.base / "bin"
        self.bin.mkdir()
        # Only app/process boundaries are replaced; never signal real apps.
        for command in ("pkill", "pgrep", "borders", "vicinae", "tmux", "nvim", "bat", "brew", "git", "ya"):
            file = self.bin / command
            file.write_text('#!/bin/sh\necho "$(basename "$0") $*" >> "$APP_LOG"\n'
                            'if [ "$(basename "$0")" = "$FAIL_APP" ]; then exit 1; fi\n')
            file.chmod(0o755)
        self.env = dict(os.environ, HOME=str(self.home),
                        PATH=str(self.bin) + os.pathsep + os.environ["PATH"],
                        TMPDIR=str(self.base / "tmp"), USER="theme-test",
                        APP_LOG=str(self.base / "apps.log"), FAIL_APP="")
        (self.themes / "current").symlink_to("midnightvoid")

    def run_theme(self, *args):
        return subprocess.run(["bash", str(self.themes / "theme"), *args],
                              env=self.env, capture_output=True, text=True, timeout=10)

    def test_lists_themes_and_marks_current(self):
        result = self.run_theme()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(tuple(sorted(line[2:] for line in result.stdout.splitlines())), NAMES)
        self.assertIn("* midnightvoid", result.stdout)
        self.assertFalse((self.base / "apps.log").exists())

    def test_help_describes_usage_without_side_effects(self):
        for flag in ("-h", "--help"):
            with self.subTest(flag=flag):
                result = self.run_theme(flag)
                self.assertEqual(result.returncode, 0, result.stderr)
                for text in ("Usage:", "theme [name]", "theme coffee-neutral", "/reload"):
                    self.assertIn(text, result.stdout)
                self.assertEqual(os.readlink(self.themes / "current"), "midnightvoid")
                self.assertFalse((self.base / "apps.log").exists())
                self.assertFalse((self.home / ".pi").exists())

    def test_jankyborders_use_subdued_neutral_colors(self):
        for name in NAMES:
            if name == "midnightvoid":
                continue  # Preserve the original border colours.
            with self.subTest(name=name):
                settings = dict(line.split("=", 1) for line in
                                (ROOT / name / "colors.sh").read_text().splitlines()
                                if line.startswith("BORDER_"))
                active = settings["BORDER_ACTIVE"]
                channels = [int(active[i:i + 2], 16) for i in (4, 6, 8)]
                self.assertLessEqual(max(channels) - min(channels), 6)
                self.assertLessEqual(max(channels), 115)
                self.assertNotEqual(active, settings["BORDER_INACTIVE"])

    def test_switches_every_theme_and_pi_link(self):
        for name in NAMES:
            with self.subTest(name=name):
                result = self.run_theme(name)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(os.readlink(self.themes / "current"), name)
                pi = self.home / ".pi/agent/themes/current.json"
                self.assertEqual(pi.resolve(), self.themes / name / "pi.json")
                self.assertEqual(json.loads(pi.read_text())["name"], "current")
                self.assertTrue((self.themes / name / "kitty.conf").is_file())
        calls = (self.base / "apps.log").read_text()
        self.assertIn("tmux source-file", calls)
        self.assertIn("bat cache --build", calls)

    def test_rejects_invalid_name_and_extra_arguments_without_changes(self):
        # A real sibling directory containing a kitty.conf must not be sourceable.
        outside = self.base / "outside"
        outside.mkdir()
        (outside / "kitty.conf").write_text("# not a theme\n")
        for args in (("missing",), ("current",), ("../outside",),
                     ("coffee-neutral", "unexpected")):
            with self.subTest(args=args):
                result = self.run_theme(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(os.readlink(self.themes / "current"), "midnightvoid")
                self.assertFalse((self.base / "apps.log").exists())

    def test_reload_failure_is_reported_without_reverting_selection(self):
        self.env["FAIL_APP"] = "vicinae"
        result = self.run_theme("coffee-neutral")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("vicinae", result.stderr)
        self.assertEqual(os.readlink(self.themes / "current"), "coffee-neutral")

    def test_busy_nvim_times_out_without_blocking_switch(self):
        # macOS Unix sockets have a short path limit; use /tmp for this endpoint.
        with tempfile.TemporaryDirectory(prefix="theme-socket-", dir="/tmp") as tmp:
            directory = Path(tmp) / "nvim.theme-test/editor"
            directory.mkdir(parents=True)
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as endpoint:
                endpoint.bind(str(directory / "nvim.1.0"))
                self.env["TMPDIR"] = tmp
                (self.bin / "nvim").write_text("#!/bin/sh\nexec /bin/sleep 30\n")
                result = self.run_theme("coffee-neutral")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("nvim did not reload", result.stderr)
                self.assertEqual(os.readlink(self.themes / "current"), "coffee-neutral")

    def test_installer_initialises_and_preserves_selection_on_rerun(self):
        dot = self.base / "dotfiles"
        (dot / "config/pi/themes").mkdir(parents=True)
        (dot / "config/vicinae").mkdir()
        (dot / "config/vicinae/base.json").write_text("{}\n")
        (dot / "config/themes").symlink_to(self.themes)
        self.env["DOT"] = str(dot)
        installer = ROOT.parents[1] / "install.sh"
        for selected in (None, "soviet-dark"):
            with self.subTest(selected=selected):
                (self.themes / "current").unlink()
                if selected:
                    (self.themes / "current").symlink_to(selected)
                for _ in range(2):
                    result = subprocess.run(["bash", str(installer)], env=self.env,
                                            capture_output=True, text=True, timeout=10)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    expected = selected or "midnightvoid"
                    self.assertEqual(os.readlink(self.themes / "current"), expected)
                    pi = self.home / ".pi/agent/themes/current.json"
                    self.assertEqual(pi.resolve(), self.themes / expected / "pi.json")
        self.assertNotIn("pkill", (self.base / "apps.log").read_text())

    @unittest.skipUnless(shutil.which("kitty"), "kitty is not installed")
    def test_kitty_loads_every_theme_without_changing_windows(self):
        kitty = self.base / "kitty"
        shutil.copytree(ROOT.parent / "kitty", kitty)
        # kitty 0.50 internal parser: this test is the upgrade compatibility check.
        code = ("import json; from kitty.config import load_config; "
                + "o=load_config(" + repr(str(kitty / "kitty.conf")) + "); "
                + "print(json.dumps(dict(bg=repr(o.background), dim=o.dim_opacity, "
                + "opacity=o.background_opacity, floor=o.text_fg_override_threshold)))")
        for name in NAMES:
            with self.subTest(name=name):
                self.assertEqual(self.run_theme(name).returncode, 0)
                result = subprocess.run(["kitty", "+runpy", code], env=self.env,
                                        capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stderr, "")
                options = json.loads(result.stdout)
                self.assertEqual(options["dim"], 0.6)
                self.assertEqual(options["opacity"], 0.94)
                if name != "midnightvoid":
                    self.assertEqual(options["floor"], [3.0, "ratio"])

    def test_theme_data_parses(self):
        for name in NAMES:
            with self.subTest(name=name):
                theme = ROOT / name
                for file in ("hunk.toml", "yazi.toml", "vicinae.toml"):
                    with (theme / file).open("rb") as stream:
                        tomllib.load(stream)
                with (theme / "syntax.tmTheme").open("rb") as stream:
                    plistlib.load(stream)
                json.loads((theme / "pi.json").read_text())

    def test_all_theme_files_resolve(self):
        files = ("kitty.conf", "delta.gitconfig", "lazygit.yml", "hunk.toml",
                 "yazi.toml", "syntax.tmTheme", "pi.json", "vicinae.toml",
                 "marta.theme", "marta.ettyTheme", "colors.sh", "btop.theme", "tmux.conf")
        for name in NAMES:
            for file in files:
                with self.subTest(name=name, file=file):
                    self.assertTrue((ROOT / name / file).is_file())


if __name__ == "__main__":
    unittest.main()
