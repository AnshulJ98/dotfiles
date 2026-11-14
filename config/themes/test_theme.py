"""Switcher integration tests; app commands are faked, files and symlinks are real."""
import json
import os
import plistlib
import re
import tomllib
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
# Themes whose prompt follows Midnight Void's balance: a frame and fill that recede, saturated git colours.
QUIET_PROMPT = ("void-ink",)
NAMES = ("ayu-ink", "ayu-neutral", "coffee-sky", "coffee-slate", "dark-2026", "midnightvoid",
         "tango", "void-ink", "void-neutral")


def luminance(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in channels]
    return sum(v * weight for v, weight in zip(linear, (0.2126, 0.7152, 0.0722)))


def contrast(a, b):
    x, y = sorted((luminance(a), luminance(b)))
    return (y + 0.05) / (x + 0.05)


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
                for text in ("Usage:", "theme [name]", "theme void-ink", "/reload"):
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

    def test_decorations_are_visible_without_a_terminal_contrast_floor(self):
        # No theme sets kitty's text_fg_override_threshold (it repaints prompt caps and
        # borders), so every border and rule has to reach 3:1 in the theme files themselves.
        patterns = {
            "lazygit.yml": r"inactiveBorderColor: \['(#\w{6})'\]",
            "delta.gitconfig": r"(?:file|hunk-header)-decoration-style = \"(#\w{6})\"",
            "yazi.toml": r"(?m)^(?:border_style|border|separator_style)\s*=\s*\{ fg = \"(#\w{6})\"",
            "hunk.toml": r"(?m)^border = \"(#\w{6})\"",
            "btop.theme": r"theme\[(?:meter_bg|div_line)\]=\"(#\w{6})\"",
            "tmux.conf": r"pane-border-style \"fg=(#\w{6})\"",
        }
        for name in NAMES:
            if name == "midnightvoid":
                continue
            background = re.search(r"(?m)^background\s+(#\w{6})", (ROOT / name / "kitty.conf").read_text())[1]
            pi = json.loads((ROOT / name / "pi.json").read_text())
            colors = {"pi.json": [pi["vars"].get(pi["colors"][key], pi["colors"][key])
                                  for key in ("border", "borderMuted", "mdHr", "mdCodeBlockBorder")]}
            for file, pattern in patterns.items():
                colors[file] = re.findall(pattern, (ROOT / name / file).read_text())
            for file, found in colors.items():
                with self.subTest(theme=name, file=file):
                    self.assertTrue(found)
                    for color in found:
                        self.assertGreaterEqual(contrast(color, background), 3, color)
            # p10k draws its frame in colour 238 on the background and its separators in 242 on its 234 fill.
            kitty = dict(re.findall(r"(?m)^(color23[48]|color242)\s+(#\w{6})", (ROOT / name / "kitty.conf").read_text()))
            with self.subTest(theme=name, file="kitty.conf"):
                if name not in QUIET_PROMPT:
                    self.assertGreaterEqual(contrast(kitty["color238"], background), 3)
                self.assertGreaterEqual(contrast(kitty["color242"], kitty["color234"]), 3)

    def test_quiet_prompts_keep_the_midnight_void_balance(self):
        # Midnight Void's prompt reads well because its chrome recedes (fill 1.02:1 and frame 1.72:1 on
        # the background) and its git colours are saturated. A 3:1 frame made the others look heavy.
        for name in QUIET_PROMPT:
            with self.subTest(theme=name):
                settings = dict(re.findall(r"(?m)^(background|color\d+)\s+(#\w{6})",
                                           (ROOT / name / "kitty.conf").read_text()))
                background, fill = settings["background"], settings["color234"]
                self.assertLessEqual(contrast(fill, background), 1.12)
                self.assertGreaterEqual(contrast(settings["color238"], background), 1.7)
                self.assertLessEqual(contrast(settings["color238"], background), 2.0)
                greys = [luminance(settings[f"color{index}"]) for index in range(232, 256)]
                self.assertEqual(greys, sorted(greys))
                for index in (76, 178):  # git clean and modified
                    self.assertGreaterEqual(contrast(settings[f"color{index}"], fill), 8)

    def test_void_ink_pi_keeps_cyan_teal_and_yellow_out_of_prose_and_the_editor_rule(self):
        pi = json.loads((ROOT / "void-ink" / "pi.json").read_text())

        def color(key):
            return pi["vars"].get(pi["colors"][key], pi["colors"][key]).lower()

        loud = {pi["vars"][name].lower() for name in ("blue", "turquoise", "yellow")}
        for key in ("mdCode", "mdHeading", "mdListBullet", "mdQuoteBorder"):
            self.assertNotIn(color(key), loud, key)
        # The editor rule shows the thinking level: one colour per level, none of them a loud line.
        levels = [color("thinking" + level) for level in ("Off", "Minimal", "Low", "Medium", "High", "Xhigh", "Max")]
        self.assertEqual(len(set(levels)), len(levels))
        self.assertFalse(loud & set(levels))

    def test_ayu_ink_default_text_is_white_in_the_terminal_and_the_editor(self):
        settings = dict(line.split() for line in (ROOT / "ayu-ink" / "kitty.conf").read_text().splitlines()
                        if line.strip() and not line.startswith("#") and len(line.split()) == 2)
        channels = [int(settings["foreground"][i:i + 2], 16) for i in (1, 3, 5)]
        self.assertLessEqual(max(channels) - min(channels), 16)
        self.assertEqual(settings["color7"], settings["foreground"])
        editor = (ROOT.parent / "nvim/colors/ayu-ink.lua").read_text()
        self.assertIn("h(0, 'Normal', { fg = '%s' })" % settings["foreground"], editor)

    def test_minimal_theme_text_is_legible_without_terminal_boosting(self):
        for name in ("dark-2026", "tango"):
            settings = dict(line.split() for line in (ROOT / name / "kitty.conf").read_text().splitlines()
                            if line.strip() and not line.startswith("#") and len(line.split()) == 2)
            for index in (*range(1, 8), *range(9, 16)):
                for background in ("background", "selection_background"):
                    with self.subTest(theme=name, color=index, background=background):
                        self.assertGreaterEqual(contrast(settings[f"color{index}"], settings[background]), 4.5)
            self.assertGreaterEqual(contrast(settings["color8"], settings["background"]), 4.5)
            self.assertNotEqual(settings["color0"], settings["background"])

    @unittest.skipUnless(shutil.which("bat"), "bat is not installed")
    def test_minimal_syntax_themes_distinguish_json_keys_from_values(self):
        config = self.base / "bat"
        (config / "themes").mkdir(parents=True)
        for name in ("dark-2026", "tango"):
            shutil.copyfile(ROOT / name / "syntax.tmTheme", config / "themes" / f"{name}.tmTheme")
        env = dict(os.environ, BAT_CONFIG_DIR=str(config), BAT_CACHE_PATH=str(config / "cache"),
                   COLORTERM="truecolor")
        built = subprocess.run([shutil.which("bat"), "cache", "--build"], env=env,
                               capture_output=True, text=True, timeout=20)
        self.assertEqual(built.returncode, 0, built.stderr)
        for name in ("dark-2026", "tango"):
            syntax = plistlib.loads((ROOT / name / "syntax.tmTheme").read_bytes())
            key = next(rule["settings"]["foreground"] for rule in syntax["settings"]
                       if rule.get("name") == "JSON and YAML keys")
            expected_key = tuple(int(key[i:i + 2], 16) for i in (1, 3, 5))
            for language, sample in (("json", '{"label":"value"}\n'), ("yaml", "label: value\n")):
                result = subprocess.run(
                    [shutil.which("bat"), "--color=always", "--paging=never", "--style=plain",
                     "--theme", name, "--language", language],
                    input=sample, env=env, capture_output=True, text=True, timeout=10,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                foreground = None
                colors = {}
                for token in re.finditer(r"\x1b\[([0-9;]*)m|([^\x1b]+)", result.stdout):
                    if token[1] is not None:
                        color = re.search(r"38;2;(\d+);(\d+);(\d+)", token[1])
                        if color:
                            foreground = tuple(map(int, color.groups()))
                    else:
                        for word in ("label", "value"):
                            if word in token[2]:
                                colors[word] = foreground
                with self.subTest(theme=name, language=language):
                    self.assertEqual(colors.get("label"), expected_key)
                    self.assertIsNotNone(colors.get("value"))
                    self.assertNotEqual(colors["label"], colors["value"])

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
                     ("void-ink", "unexpected")):
            with self.subTest(args=args):
                result = self.run_theme(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(os.readlink(self.themes / "current"), "midnightvoid")
                self.assertFalse((self.base / "apps.log").exists())

    def test_reload_failure_is_reported_without_reverting_selection(self):
        self.env["FAIL_APP"] = "vicinae"
        result = self.run_theme("void-ink")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("vicinae", result.stderr)
        self.assertEqual(os.readlink(self.themes / "current"), "void-ink")

    def test_busy_nvim_times_out_without_blocking_switch(self):
        # macOS Unix sockets have a short path limit; use /tmp for this endpoint.
        with tempfile.TemporaryDirectory(prefix="theme-socket-", dir="/tmp") as tmp:
            directory = Path(tmp) / "nvim.theme-test/editor"
            directory.mkdir(parents=True)
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as endpoint:
                endpoint.bind(str(directory / "nvim.1.0"))
                self.env["TMPDIR"] = tmp
                (self.bin / "nvim").write_text("#!/bin/sh\nexec /bin/sleep 30\n")
                result = self.run_theme("void-ink")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("nvim did not reload", result.stderr)
                self.assertEqual(os.readlink(self.themes / "current"), "void-ink")

    def test_installer_initialises_and_preserves_selection_on_rerun(self):
        dot = self.base / "dotfiles"
        (dot / "config/pi/themes").mkdir(parents=True)
        (dot / "config/vicinae").mkdir()
        (dot / "config/vicinae/base.json").write_text("{}\n")
        (dot / "config/themes").symlink_to(self.themes)
        self.env["DOT"] = str(dot)
        installer = ROOT.parents[1] / "install.sh"
        for selected in (None, "ayu-ink"):
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

    def test_installer_recovers_from_a_theme_deleted_from_the_repo(self):
        dot = self.base / "dotfiles"
        (dot / "config/pi/themes").mkdir(parents=True)
        (dot / "config/vicinae").mkdir()
        (dot / "config/vicinae/base.json").write_text("{}\n")
        (dot / "config/themes").symlink_to(self.themes)
        self.env["DOT"] = str(dot)
        bat = self.home / ".config/bat/themes"
        vicinae = self.home / ".local/share/vicinae/themes"
        bat.mkdir(parents=True)
        vicinae.mkdir(parents=True)
        (bat / "gone.tmTheme").symlink_to(dot / "config/themes/gone/syntax.tmTheme")
        (vicinae / "gone.toml").symlink_to(dot / "config/themes/gone/vicinae.toml")
        (bat / "mine.tmTheme").symlink_to(self.base / "elsewhere.tmTheme")
        (self.themes / "current").unlink()
        (self.themes / "current").symlink_to("gone")
        result = subprocess.run(["bash", str(ROOT.parents[1] / "install.sh")], env=self.env,
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        # One dangling theme makes bat skip the whole folder, which breaks delta and BAT_THEME=current.
        self.assertFalse((bat / "gone.tmTheme").is_symlink())
        self.assertFalse((vicinae / "gone.toml").is_symlink())
        self.assertTrue((bat / "mine.tmTheme").is_symlink())
        self.assertTrue((bat / "void-ink.tmTheme").exists())
        self.assertEqual(os.readlink(self.themes / "current"), "midnightvoid")

    @unittest.skipUnless(shutil.which("kitty"), "kitty is not installed")
    def test_kitty_loads_every_theme_without_changing_windows(self):
        kitty = self.base / "kitty"
        # local.conf is this machine's own settings; a fresh clone has none.
        shutil.copytree(ROOT.parent / "kitty", kitty, ignore=shutil.ignore_patterns("local.conf"))
        # kitty 0.50 internal parser: this test is the upgrade compatibility check.
        code = ("import json; from kitty.config import load_config; "
                + "o=load_config(" + repr(str(kitty / "kitty.conf")) + "); "
                + "print(json.dumps(dict(bg=repr(o.background), dim=o.dim_opacity, "
                + "floor=o.text_fg_override_threshold)))")
        for name in NAMES:
            with self.subTest(name=name):
                self.assertEqual(self.run_theme(name).returncode, 0)
                result = subprocess.run(["kitty", "+runpy", code], env=self.env,
                                        capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stderr, "")
                options = json.loads(result.stdout)
                self.assertEqual(options["dim"], 0.6)
                self.assertEqual(options["floor"][0], 0)

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
