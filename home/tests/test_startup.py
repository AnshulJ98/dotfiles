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
