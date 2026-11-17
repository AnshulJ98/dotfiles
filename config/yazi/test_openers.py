import os
import shlex
import subprocess
import tempfile
import tomllib
import unittest
from pathlib import Path


class ImageOpenerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.bin = Path(self.directory.name)
        for name, body in {
            "mpv": 'printf "%s\\0" "$@"',
            "rsvg-convert": "exit 0",
        }.items():
            script = self.bin / name
            script.write_text("#!/bin/sh\n" + body + "\n")
            script.chmod(0o755)

    def test_transfer_mode_and_arguments(self):
        with Path(__file__).with_name("yazi.toml").open("rb") as stream:
            config = tomllib.load(stream)
        cases = [
            ("local", {}, "yes"),
            ("empty_ssh_variables", {"SSH_CONNECTION": "", "SSH_TTY": ""}, "yes"),
            ("ssh_connection", {"SSH_CONNECTION": "client 1 server 22"}, "no"),
            ("ssh_tty", {"SSH_TTY": "/dev/pts/1"}, "no"),
            (
                "both_ssh_variables",
                {"SSH_CONNECTION": "client 1 server 22", "SSH_TTY": "/dev/pts/1"},
                "no",
            ),
        ]
        # Fake only external processes; execute the configured shell command.
        for opener in ("image", "svg"):
            filename = f"a diagram's image.{opener}"
            command = config["opener"][opener][0]["run"]
            command = command.replace("%s1", shlex.quote(filename)).replace(
                "%s", shlex.quote(filename)
            )
            for name, ssh, mode in cases:
                with self.subTest(opener=opener, connection=name):
                    env = {
                        key: value
                        for key, value in os.environ.items()
                        if key not in ("SSH_CONNECTION", "SSH_TTY")
                    }
                    env["PATH"] = str(self.bin) + os.pathsep + env["PATH"]
                    result = subprocess.run(
                        ["/bin/sh", "-c", command],
                        env=env | ssh,
                        capture_output=True,
                        check=True,
                        timeout=5,
                    )
                    actual = result.stdout.decode().rstrip("\0").split("\0")
                    expected = [
                        "--vo=kitty",
                        f"--vo-kitty-use-shm={mode}",
                        "--really-quiet",
                        "--image-display-duration=inf",
                    ]
                    if opener == "image":
                        expected.append("--loop-playlist=inf")
                    expected.extend(
                        [
                            f"--input-conf={Path.home()}/.config/yazi/mpv-image.conf",
                            filename if opener == "image" else "-",
                        ]
                    )
                    self.assertEqual(actual, expected)


if __name__ == "__main__":
    unittest.main()
