# /// script
# requires-python = ">=3.11"
# dependencies = ["markdown-it-py==4.3.0", "mdit-py-plugins==0.7.0"]
# ///
"""Run with uv run tests/test_build.py. Uses real files and the real d2 CLI."""

from __future__ import annotations

import contextlib
import io
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILL / "scripts"))
import build as builder


class NamesTest(unittest.TestCase):
    def test_order_prefixes(self) -> None:
        for name, expected in [
            ("01-introduction.md", "introduction"),
            ("12_architecture.md", "architecture"),
            ("plain.md", "plain"),
        ]:
            with self.subTest(name=name):
                self.assertEqual(builder.strip_order(name), expected)

    def test_heading_slugs(self) -> None:
        for text, expected in [
            ("Request Flow", "request-flow"),
            ("API: `v2`!", "api-v2"),
            ("", "section"),
            ("Café", "café"),
        ]:
            with self.subTest(text=text):
                self.assertEqual(builder.slugify(text), expected)

    def test_natural_order(self) -> None:
        self.assertEqual(
            sorted(["10-last", "2-middle", "1-first"], key=builder.natural),
            ["1-first", "2-middle", "10-last"],
        )


class BuildTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.src = self.root / "docs"
        self.src.mkdir()
        self.out = self.root / "out" / "doc.html"

    def source(self, name: str, content: str) -> None:
        path = self.src / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def render(self, theme: str | None = None) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = builder.build(self.src, self.out, theme, builder.DEFAULT_STYLES)
        return code, self.out.read_text("utf-8"), stderr.getvalue()

    def test_pages_headings_and_links(self) -> None:
        self.source("01-start.md", "# Start\n[Go](02-services.md#request-flow)\n")
        self.source("02-services.md", "# Services\n## Request flow\n## Request flow\n")
        code, html, errors = self.render()
        self.assertEqual((code, errors), (0, ""))
        for fragment in [
            'id="start"',
            'id="services"',
            'href="#services--request-flow"',
            'id="services--request-flow-1"',
            'data-theme="slate"',
        ]:
            self.assertIn(fragment, html)
        self.assertLess(html.index('id="start"'), html.index('id="services"'))

    def test_missing_file_and_heading_fail(self) -> None:
        for link in ["missing.md", "#missing"]:
            with self.subTest(link=link):
                self.source("01-start.md", f"# Start\n[Broken]({link})")
                code, _, errors = self.render()
                self.assertEqual(code, 1)
                self.assertIn(link, errors)

    def test_duplicate_page_addresses_fail(self) -> None:
        self.source("01-start.md", "# One")
        self.source("02-start.md", "# Two")
        with self.assertRaisesRegex(builder.BuildError, "same page address"):
            self.render()

    def test_empty_source_fails(self) -> None:
        with self.assertRaisesRegex(builder.BuildError, "no .md files"):
            self.render()

    def test_unknown_theme_fails(self) -> None:
        self.source("start.md", "# Start")
        with self.assertRaisesRegex(builder.BuildError, "no theme"):
            self.render("missing")

    def test_command_line_theme_overrides_config(self) -> None:
        self.source("doc.toml", 'title = "A & B"\nsubtitle = "Review"\ntheme = "teal"')
        self.source("start.md", "# Start")
        _, configured, _ = self.render()
        _, overridden, _ = self.render("indigo")
        self.assertIn('data-theme="teal"', configured)
        self.assertIn('data-theme="indigo"', overridden)
        self.assertIn("<title>A &amp; B</title>", configured)

    def test_local_images_and_raw_img_are_embedded(self) -> None:
        self.source(
            "pic.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'
        )
        self.source(
            "start.md",
            '# Start\n![Picture](pic.svg "Caption")\n\n<img src="pic.svg" alt="Raw">',
        )
        code, html, _ = self.render()
        self.assertEqual(code, 0)
        self.assertEqual(html.count("data:image/svg+xml;base64,"), 2)
        self.assertIn("<figcaption>Caption</figcaption>", html)

    def test_missing_image_fails(self) -> None:
        self.source("start.md", "# Start\n![Missing](missing.png)")
        with self.assertRaisesRegex(builder.BuildError, "image missing.png"):
            self.render()

    def test_remote_resources_fail(self) -> None:
        for content in [
            "![Remote](https://example.com/pic.png)",
            '<script src="https://example.com/app.js"></script>',
            '<link href="https://example.com/style.css" rel="stylesheet">',
        ]:
            with self.subTest(content=content):
                self.source("start.md", "# Start\n" + content)
                code, _, errors = self.render()
                self.assertEqual(code, 1)
                self.assertIn("example.com", errors)

    def test_gfm_and_frontmatter(self) -> None:
        self.source(
            "start.md",
            "---\nsecret: hidden\n---\n# Start\n> [!NOTE]\n> Read this\n\n- [x] Done\n\n~~old~~\n\n| A | B |\n|---|---|\n| 1 | 2 |",
        )
        code, html, _ = self.render()
        self.assertEqual(code, 0)
        self.assertNotIn("secret: hidden", html)
        for fragment in [
            'class="markdown-alert',
            'type="checkbox"',
            "<s>old</s>",
            "<table>",
        ]:
            self.assertIn(fragment, html)

    def test_footnotes_have_unique_ids_across_pages(self) -> None:
        for name in ["01-first.md", "02-second.md"]:
            self.source(name, "# Page\nText[^n]\n\n[^n]: Note")
        code, html, _ = self.render()
        self.assertEqual(code, 0)
        self.assertIn('id="fn-first-1"', html)
        self.assertIn('id="fn-second-1"', html)

    def test_template_markers_in_source_are_preserved(self) -> None:
        self.source("start.md", "# Start\nThe placeholder is {{script}}.")
        _, html, _ = self.render()
        self.assertIn("The placeholder is {{script}}.", html)

    @unittest.skipUnless(shutil.which("d2"), "d2 CLI not installed")
    def test_real_d2_themes_render(self) -> None:
        self.source(
            "start.md",
            "# Diagram\n```d2\na: API\nb: Worker { class: target }\na -> b: call\n```",
        )
        for theme in ["slate", "indigo", "teal", "graphite"]:
            with self.subTest(theme=theme):
                code, html, errors = self.render(theme)
                self.assertEqual((code, errors), (0, ""))
                self.assertIn('<figure class="diagram">', html)
                self.assertIn("<svg", html)
                self.assertNotIn("prefers-color-scheme", html)

    @unittest.skipUnless(shutil.which("d2"), "d2 CLI not installed")
    def test_bad_d2_fails(self) -> None:
        self.source("start.md", "# Diagram\n```d2\na: {\n```")
        with self.assertRaisesRegex(builder.BuildError, "d2 block 1"):
            self.render()


if __name__ == "__main__":
    unittest.main()
