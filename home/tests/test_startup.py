"""Startup guards; run with python3 -m unittest discover -s home/tests."""
import subprocess
import tempfile
import unittest
from pathlib import Path

HOME = Path(__file__).resolve().parents[1]


class StartupTests(unittest.TestCase):
    def run_zsh(self, text, directory):
        return subprocess.run(
            ["/bin/zsh", "-dfc", text], capture_output=True, text=True, check=False,
            env={"HOME": str(directory), "PATH": "/usr/bin:/bin"},
            cwd=directory, timeout=10,
        )

    def test_shell_colors_preserve_original_pointed_prompt_endcaps(self):
        script = (f'typeset -A FAST_HIGHLIGHT_STYLES; source "{HOME / ".p10k.zsh"}"; '
                  f'source "{HOME / ".zsh-colors.zsh"}"; '
                  'print -r -- "$POWERLEVEL9K_LEFT_PROMPT_LAST_SEGMENT_END_SYMBOL"; '
                  'print -r -- "$POWERLEVEL9K_RIGHT_PROMPT_FIRST_SEGMENT_START_SYMBOL"')
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_zsh(script, directory)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "\\uE0B0\n\\uE0B2\n")

    def test_homebrew_repository_is_hidden_without_hiding_nested_repositories(self):
        script = (f'source "{HOME / ".p10k.zsh"}"; '
                  'for workdir in "~" /opt/homebrew /opt/homebrew/personal_programs/project; do '
                  'if [[ $workdir == ${~POWERLEVEL9K_VCS_DISABLED_WORKDIR_PATTERN} ]]; then '
                  'print hidden; else print visible; fi; done')
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_zsh(script, directory)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "hidden\nhidden\nvisible\n")

    def test_missing_cargo_does_not_print_a_startup_error(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_zsh(f'source "{HOME / ".zshenv"}"; print ready', directory)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "ready\n")
        self.assertEqual(result.stderr, "")

    def test_missing_homebrew_does_not_print_a_login_error(self):
        with tempfile.TemporaryDirectory() as directory:
            # The executable path is an OS boundary; simulate a machine without it.
            text = (HOME / ".zprofile").read_text().replace("/opt/homebrew/bin/brew", directory + "/absent-brew")
            result = self.run_zsh(text + "\nprint ready", directory)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "ready\n")
        self.assertEqual(result.stderr, "")

    def test_autosuggestions_does_not_invoke_missing_homebrew(self):
        text = next(line for line in (HOME / ".zshrc").read_text().splitlines()
                    if "/share/zsh-autosuggestions/zsh-autosuggestions.zsh" in line)
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_zsh(text + "\nprint ready", directory)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "ready\n")
        self.assertEqual(result.stderr, "")


if __name__ == "__main__":
    unittest.main()
