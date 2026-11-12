"""Kitty's plain keymap and launcher; independent of Herdr."""
from pathlib import Path
import shlex
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[3]


class KeyConfigTests(unittest.TestCase):
    def test_plain_keys(self):
        maps = [shlex.split(line) for line in (ROOT / "config/kitty/kitty.conf").read_text().splitlines()
                if line.startswith("map ")]
        plain = {parts[1]: parts[2:] for parts in maps if parts[1] != "--when-focus-on"}
        self.assertEqual(plain["cmd+t"], ["new_tab_with_cwd"])
        self.assertEqual(plain["cmd+w"], ["close_window"])
        self.assertEqual(plain["cmd+shift+w"], ["close_tab"])
        self.assertEqual(plain["cmd+0"], ["change_font_size", "all", "0"])
        self.assertEqual(plain["cmd+alt+l"], [
            "launch", "--type=tab", "--tab-title", "hunk", "--add-to-session=!",
            "--cwd=current", "/opt/homebrew/bin/hunk", "diff",
        ])

    def test_rename_and_scrollback(self):
        maps = [shlex.split(line) for line in (ROOT / "config/kitty/kitty.conf").read_text().splitlines()
                if line.startswith("map ")]
        plain = {parts[1]: parts[2:] for parts in maps if parts[1] != "--when-focus-on"}
        self.assertEqual(plain.get("cmd+shift+i"), ["set_tab_title"])
        self.assertEqual(plain.get("cmd+alt+e"), ["kitty_scrollback_nvim"])
        self.assertEqual(plain["cmd+alt+e"], plain["kitty_mod+h"])

    def test_keys_popup_lists_kitty_command_keys(self):
        maps = [line.split(None, 2) for line in (ROOT / "config/kitty/kitty.conf").read_text().splitlines()
                if line.startswith("map ") and "--when-focus-on" not in line]
        mapped = {m[1].replace("kitty_mod", "ctrl+shift") for m in maps
                  if len(m) == 3 and not m[2].startswith("send_text")}
        listed = set()
        for line in (ROOT / "config/kitty/keys.txt").read_text().splitlines():
            key, _, where = (line.split("\t") + ["", ""])[:3]
            if not line or line.startswith("#") or where:
                continue  # a heading, or a key bound outside kitty.conf
            head, _, last = key.rpartition("+")
            lasts = [str(n) for n in range(1, 10)] if last == "1..9" else last.split("|")
            listed |= {f"{head}+{name}" for name in lasts}
        self.assertEqual(listed, mapped)

    def test_aerospace_workspace_and_plain_launchers(self):
        config = tomllib.loads((ROOT / "config/aerospace/aerospace.toml").read_text())
        bindings = config["mode"]["main"]["binding"]
        self.assertEqual(bindings["cmd-enter"], "exec-and-forget $HOME/.config/kitty/bin/kmain")
        self.assertEqual(bindings["cmd-alt-enter"], "exec-and-forget open -n /Applications/kitty.app")


if __name__ == "__main__":
    unittest.main(verbosity=2)
