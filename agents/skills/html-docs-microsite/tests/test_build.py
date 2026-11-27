# /// script
# requires-python = ">=3.11"
# dependencies = ["markdown-it-py==4.3.0", "mdit-py-plugins==0.7.0", "pygments==2.21.0"]
# ///
"""Run with uv run tests/test_build.py. Uses real files and the real d2 CLI."""

from __future__ import annotations

import base64
import contextlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from html import unescape
from pathlib import Path
from unittest.mock import patch

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

    def render(
        self, theme: str | None = None, full_res: bool = False
    ) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = builder.build(
                self.src, self.out, theme, builder.DEFAULT_STYLES, full_res
            )
        return (
            code,
            self.out.read_text("utf-8") if self.out.exists() else "",
            stderr.getvalue(),
        )

    def browser(self, html: str, script: str, fragment: str = "") -> object:
        default = Path.home() / "Library/Caches/ms-playwright"
        cache = Path(os.environ.get("PLAYWRIGHT_BROWSERS_PATH", str(default)))
        pattern = "chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell"
        shells = sorted(cache.glob(pattern))
        if not shells:
            self.skipTest(f"headless Chromium shell absent in {cache}")
        path = self.root / "browser.html"
        probe = f'<pre id="t"></pre><script>(() => {{ const t=document.getElementById("t"), q=document.getElementById("q"), results=document.querySelector("ol#results"); {script} }})()</script>'
        path.write_text(html.replace("</body>", probe + "</body>"), encoding="utf-8")
        args = [str(shells[-1]), "--disable-gpu", "--virtual-time-budget=2000"]
        args += ["--dump-dom", path.as_uri() + fragment]
        run = subprocess.run(
            args, capture_output=True, text=True, timeout=30, check=True
        )
        match = re.search(r'<pre id="t">(.*?)</pre>', run.stdout, re.DOTALL)
        self.assertIsNotNone(match, run.stderr)
        return json.loads(unescape(match.group(1)))

    def site(self) -> str:
        self.source(
            "01-start.md",
            "# Start\n\nBefore section amp lt gt & < and >.\n\n## First section\n\nSection body.\n",
        )
        self.source(
            "02-results.md", "# Results\n\n## Second section\n\n![tiny](tiny.png)\n"
        )
        png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII="
        (self.src / "tiny.png").write_bytes(base64.b64decode(png))
        code, html, errors = self.render(full_res=True)
        self.assertEqual((code, errors), (0, ""))
        return html

    def test_feature_registers_and_tree(self) -> None:
        body = "# Landing\n## First\n> [!RULE] OBS-01\n> Keep records.\n\n## Last"
        self.source("01-a/02-b/03-c/00-index.md", body)
        self.source("glossary.md", "# Glossary\n\n## Record\n\nAn entry.")
        self.source("decisions/001-store.md", "# Store\n\nChosen storage.")
        cites = "OBS-01 ADR-001 Records record. `OBS-99` [OBS-98](https://example.com)"
        self.source("z.md", "# Citer\n\n" + cites)
        code, html, errors = self.render()
        self.assertEqual(code, 0)
        self.assertIn("rule prefixes: OBS", errors)
        self.assertIn('id="rule-obs-01"', html)
        self.assertIn('href="#decisions-store"', html)
        self.assertIn('class="citedby"', html)
        self.assertIn('title="An entry.">Records</a> record.', html)
        self.assertIn("<th>Cited by</th>", html)
        result = self.browser(
            html,
            """
        const nav=document.querySelector("#nav"), dirs=nav.querySelectorAll(".dir");
        const link=nav.querySelector('a[href="#a-b-c-index"]'), node=link.closest(".node"), b=node.querySelector(".chev");
        const hash=location.hash; b.click(); const closed=node.classList.contains("closed");
        link.click();
        setTimeout(()=>{ const active=nav.querySelector("a.active"), last=nav.querySelector('a[href="#a-b-c-index--last"]');
          const open=!node.classList.contains("closed"); last.click();
          setTimeout(()=>{ scrollTo(0,0); t.textContent=JSON.stringify([dirs.length,nav.querySelectorAll('a[href="#a-b-c-index"]').length,closed,hash==="",open,last.classList.contains("here"),document.querySelector("#route-notice").hidden]); },100);
        },100);
        """,
        )
        self.assertEqual(result, [4, 1, True, True, True, True, True])
        self.assertNotRegex(html, r"history\.(?:pushState|replaceState)")
        self.assertIn("localStorage", html.split("</head>")[0])

    def test_reference_failures_and_mermaid(self) -> None:
        self.source("decisions/001-d.md", "# D")
        for body, error in [
            ("ADR-999", "ADR-999"),
            ("> [!RULE] SEC-100\n> One.\n\nSEC-101", "SEC-101"),
            ("> [!RULE] OBS-01\n> One.\n\nOBS-99", "OBS-99"),
            ("> [!RULE] OBS-01\n> One.\n\n" * 2, "duplicate rule OBS-01"),
        ]:
            with self.subTest(error=error):
                self.source("start.md", "# Start\n\n" + body)
                code, _, errors = self.render()
                self.assertEqual(code, 1)
                self.assertIn(error, errors)
                self.assertIn("start.md", errors)
        shutil.rmtree(self.src / "decisions", ignore_errors=True)
        self.source("start.md", "# Start\n\nHTTP-2 ADR-007\n\n```mermaid\na-->b\n```")
        code, html, errors = self.render()
        self.assertEqual(code, 0)
        self.assertIn("start.md:5", errors)
        self.assertIn("mmdc -i x.mmd -o x.svg", errors)
        self.assertNotIn('id="rules"', html)
        self.assertIn("HTTP-2 ADR-007", html)

    def test_footnote_and_storage_throwing(self) -> None:
        self.source("first.md", "# First")
        self.source("second.md", "# Second\n\nText[^n]\n\n[^n]: Note")
        _, html, _ = self.render()
        blocker = '<script>Object.defineProperty(window,"localStorage",{get(){throw Error("blocked")}})</script>'
        html = html.replace("<head>", "<head>" + blocker)
        probe = 't.textContent=JSON.stringify([document.querySelector(".page:not([hidden])").id,document.querySelector("#route-notice").hidden])'
        result = self.browser(html, probe, "#fn-second-1")
        self.assertEqual(result, ["second", True])

    def test_scroll_spy_and_restore(self) -> None:
        self.source("a.md", "# A\n## First\nBody.\n### Middle\nBody.\n## Last\nBody.")
        self.source("b.md", "# B")
        _, html, _ = self.render()
        html = html.replace("<p>", '<p style="height:1000px">')
        # dump-dom's virtual clock need not advance compositor frames; drive this clock boundary.
        clock = (
            "window.testFrames=[]; window.requestAnimationFrame=f=>testFrames.push(f);"
        )
        controlled = html.replace(
            'document.documentElement.classList.add("js");', clock
        )
        script = """
        testFrames.splice(0).forEach(f=>f()); const first=[...document.querySelectorAll("a.here")].map(a=>a.hash);
        scrollTo(0,document.documentElement.scrollHeight); dispatchEvent(new Event("scroll")); dispatchEvent(new Event("scroll"));
        const pending=testFrames.length; testFrames.splice(0).forEach(f=>f());
        t.textContent=JSON.stringify([first,[...document.querySelectorAll("a.here")].map(a=>a.hash),pending]);
        """
        self.assertEqual(
            self.browser(controlled, script), [["#a--first"] * 2, ["#a--last"] * 2, 1]
        )
        marker = 'document.documentElement.classList.add("js");'
        for fragment, section, expected in [
            ("", "a--middle", "a"),
            ("#b", "a--middle", "b"),
            ("", "stale", "a"),
        ]:
            with self.subTest(fragment=fragment, section=section):
                state = {"page": "b", "section": section, "mode": True}
                state.update(width=True, outline=True)
                state = json.dumps(state)
                seed = f'try{{localStorage.setItem("hdm:"+document.title+":"+location.pathname,JSON.stringify({state}))}}catch{{}};'
                seeded = html.replace(marker, seed + marker)
                probe = 'setTimeout(()=>{t.textContent=JSON.stringify([document.querySelector(".page:not([hidden])").id,document.querySelector("#route-notice").hidden,document.documentElement.dataset.mode]);},150)'
                result = self.browser(seeded, probe, fragment)
                self.assertEqual(result, [expected, True, "dark"])

    def test_route_page_named_like_ui_id(self) -> None:
        html = self.site()
        result = self.browser(
            html,
            't.textContent=JSON.stringify([...document.querySelectorAll(".page")].filter(p=>!p.hidden).map(p=>p.id))',
            "#results",
        )
        self.assertEqual(result, ["results"])

    def test_route_malformed_hash(self) -> None:
        html = self.site()
        result = self.browser(
            html,
            't.textContent=JSON.stringify(document.querySelector(".page:not([hidden])").id)',
            "#%E0",
        )
        self.assertEqual(result, "start")

    def test_route_unknown_hash_banner(self) -> None:
        html = self.site()
        result = self.browser(
            html,
            'const n=document.querySelector("#route-notice"); const before=n.textContent; n.querySelector("button").click(); t.textContent=JSON.stringify([before,n.hidden,document.querySelector(".page:not([hidden])").id])',
            "#%3Cx%3E",
        )
        self.assertEqual(result, ["The link #<x> was not found Dismiss", True, "start"])

    def test_pages_visible_without_js(self) -> None:
        html = self.site()
        self.assertNotRegex(html, r'<article class="page"[^>]* hidden')

    def test_image_figure_has_toolbar(self) -> None:
        html = self.site()
        result = self.browser(
            html,
            'const f=document.querySelector(".image-figure"); t.textContent=JSON.stringify([f.tabIndex,...[...f.querySelectorAll("button")].map(b=>[b.dataset.act,b.title])])',
        )
        self.assertEqual(result[0], 0)
        self.assertEqual(
            [b[0] for b in result[1:]], ["out", "in", "actual", "reset", "full"]
        )
        self.assertTrue(all(b[1] for b in result[1:]))

    def test_viewer_keys(self) -> None:
        html = self.site()
        script = """
        const f=document.querySelector(".image-figure"); f.focus();
        f.dispatchEvent(new KeyboardEvent("keydown",{key:"f",bubbles:true}));
        const d=document.querySelector("#viewer"), p=d.querySelector(".pct");
        const key=k=>d.dispatchEvent(new KeyboardEvent("keydown",{key:k,bubbles:true}));
        const fit=p.textContent; key("+"); const plus=p.textContent; key("0");
        const reset=p.textContent; key("1"); const actual=p.textContent;
        t.textContent=JSON.stringify([fit,plus,reset,actual,d.contains(document.activeElement)]);
        """
        result = self.browser(html, script, "#results")
        self.assertGreater(int(result[1][:-1]), int(result[0][:-1]))
        self.assertEqual(result[0], result[2])
        self.assertEqual(result[3:], ["100%", True])

    def test_fit_never_upscales_small_image(self) -> None:
        html = self.site()
        result = self.browser(
            html,
            'const f=document.querySelector(".image-figure"); f.querySelector("[data-act=full]").click(); t.textContent=JSON.stringify(document.querySelector("#viewer .pct").textContent)',
            "#results",
        )
        self.assertLessEqual(int(result[:-1]), 100)

    def test_search_snippet_has_no_toolbar_text(self) -> None:
        html = self.site()
        result = self.browser(
            html,
            'q.value="section"; q.dispatchEvent(new Event("input")); t.textContent=JSON.stringify(results.textContent)',
        )
        self.assertNotIn("Fullscreen", result)
        self.assertNotIn("100%", result)

    def test_search_escapes_entities(self) -> None:
        html = self.site()
        for term in ("amp", "lt", "gt"):
            with self.subTest(term=term):
                result = self.browser(
                    html,
                    f'q.value="{term}"; q.dispatchEvent(new Event("input")); t.textContent=JSON.stringify(results.innerHTML)',
                )
                self.assertIn(f"<mark>{term}</mark>", result)
                self.assertNotIn(f"&<mark>{term}</mark>;", result)

    def test_search_finds_text_before_first_h2(self) -> None:
        html = self.site()
        result = self.browser(
            html,
            'q.value="Before section"; q.dispatchEvent(new Event("input")); t.textContent=JSON.stringify(results.textContent)',
        )
        self.assertIn("Before section", result)

    def test_sidebar_lists_active_page_sections(self) -> None:
        html = self.site()
        result = self.browser(
            html,
            't.textContent=JSON.stringify([...document.querySelectorAll("#nav .sections")].map(e=>[getComputedStyle(e).display,e.textContent]))',
            "#results",
        )
        self.assertEqual(result[0][0], "none")
        self.assertNotEqual(result[1][0], "none")
        self.assertIn("Second section", result[1][1])

    def test_accessibility_attributes(self) -> None:
        html = self.site()
        self.assertIn('<a class="skip-link"', html)
        self.assertIn('aria-label="Search documentation"', html)
        self.assertIn('aria-label="Figure viewer"', html)
        self.assertEqual(html.count('aria-pressed="false"'), 3)
        self.assertIn('<h1 tabindex="-1">', html)

    def test_route_focuses_h1(self) -> None:
        html = self.site()
        result = self.browser(
            html,
            "t.textContent=JSON.stringify([document.activeElement.tagName,document.activeElement.textContent])",
            "#results",
        )
        self.assertEqual(result, ["H1", "Results"])

    def test_page_named_viewer_does_not_replace_dialog(self) -> None:
        self.source("01-start.md", "# Start")
        self.source("02-viewer.md", "# Viewer")
        code, html, errors = self.render()
        self.assertEqual((code, errors), (0, ""))
        result = self.browser(
            html,
            'const p=document.querySelector("article#viewer"); t.textContent=JSON.stringify([p.hidden,getComputedStyle(p).display,document.activeElement.textContent])',
            "#viewer",
        )
        self.assertEqual(result, [False, "grid", "Viewer"])

    def test_sandbox_check_generic(self) -> None:
        self.site()
        run = subprocess.run(
            [sys.executable, str(SKILL / "tests/sandbox_check.py"), str(self.out)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertTrue((self.out.parent / "harness.html").exists())
        self.assertTrue(self.out.with_suffix(".sandbox.html").exists())

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

    def test_missing_d2_is_build_error(self) -> None:
        self.source("start.md", "# Start\n\n```d2\na -> b\n```")
        with (
            patch.object(builder.subprocess, "run", side_effect=FileNotFoundError()),
            self.assertRaisesRegex(builder.BuildError, "d2.*PATH"),
        ):
            self.render()

    def test_d2_has_timeout(self) -> None:
        self.source("start.md", "# Start\n\n```d2\na -> b\n```")
        with patch.object(
            builder.subprocess,
            "run",
            side_effect=builder.subprocess.TimeoutExpired("d2", 60),
        ) as run:
            with self.assertRaisesRegex(builder.BuildError, "timed out"):
                self.render()
            self.assertEqual(run.call_args.kwargs["timeout"], 60)

    def test_theme_must_have_css(self) -> None:
        self.source("start.md", "# Start")
        styles = self.root / "styles"
        styles.mkdir()
        (styles / "custom.d2").write_text("")
        with self.assertRaisesRegex(builder.BuildError, "theme"):
            builder.build(self.src, self.out, "custom", styles)

    def test_alt_is_used_for_caption_and_escaped(self) -> None:
        self.source("pic.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>')
        self.source("start.md", '# Start\n\n![A "quote" & <tag>](pic.svg)')
        _, html, _ = self.render()
        self.assertIn('alt="A &quot;quote&quot; &amp; &lt;tag&gt;"', html)
        self.assertIn(
            "<figcaption>A &quot;quote&quot; &amp; &lt;tag&gt;</figcaption>", html
        )

    def test_missing_h1_fails(self) -> None:
        self.source("start.md", "## Not a title")
        with self.assertRaisesRegex(builder.BuildError, "start.md"):
            self.render()

    def test_default_subtitle_is_empty(self) -> None:
        self.source("start.md", "# Start")
        _, html, _ = self.render()
        self.assertIn("<small></small>", html)

    def test_bad_config_fails_with_allowed_keys(self) -> None:
        self.source("start.md", "# Start")
        for config in ["bad =", 'unknown = "x"']:
            with self.subTest(config=config):
                self.source("doc.toml", config)
                with self.assertRaisesRegex(
                    builder.BuildError, "title.*subtitle.*theme"
                ):
                    self.render()

    def test_heading_suffix_collisions(self) -> None:
        self.source("start.md", "# Start\n## foo\n## foo-1\n## foo")
        _, html, _ = self.render()
        ids = re.findall(r'id="(start--foo[^"]*)"', html)
        self.assertEqual(len(ids), 3)
        self.assertEqual(len(set(ids)), 3)

    def test_page_ids_are_safe(self) -> None:
        self.source('01-A "quoted" name.md', "# Start")
        _, html, _ = self.render()
        match = re.search(r'<article class="page" id="([^"]+)"', html)
        self.assertIsNotNone(match)
        self.assertRegex(match.group(1), r"^[a-z0-9-]+$")

    def test_fragments_are_normalized(self) -> None:
        self.source("start.md", "# Start\n[Go](#Request%20Flow)\n## Request Flow")
        code, html, errors = self.render()
        self.assertEqual((code, errors), (0, ""))
        self.assertIn('href="#start--request-flow"', html)

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

    def test_raw_text_elements_fail(self) -> None:
        for tag in ["title", "textarea", "style", "xmp", "plaintext"]:
            for body in [f"before <{tag}>bad", f"<{tag}>bad"]:
                with self.subTest(tag=tag, body=body):
                    self.source("start.md", f"# Start\n\n{body}")
                    with self.assertRaisesRegex(
                        builder.BuildError, rf"start.md:3:.*{tag}"
                    ):
                        self.render()
        self.source("start.md", "# Start\n\n```html\n<title>safe\n```\n\n`<title>`")
        self.assertEqual(self.render()[0], 0)

    def test_full_res_keeps_original_bytes(self) -> None:
        data = b"x" * 100001
        (self.src / "pic.png").write_bytes(data)
        self.source("start.md", "# Start\n![pic](pic.png)")
        with patch.object(builder.subprocess, "run") as run:
            code, html, _ = self.render(full_res=True)
        self.assertEqual(code, 0)
        self.assertIn(base64.b64encode(data).decode(), html)
        run.assert_not_called()

    def test_image_used_twice_encoded_once(self) -> None:
        (self.src / "pic.png").write_bytes(b"x" * 100001)
        self.source("start.md", "# Start\n![one](pic.png)\n![two](./pic.png)")
        with patch.object(
            builder.subprocess,
            "run",
            return_value=subprocess.CompletedProcess([], 0, b"webp", b""),
        ) as run:
            code, html, _ = self.render()
        self.assertEqual(code, 0)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(html.count("data:image/webp;base64,"), 2)

    def test_cwebp_failure_warns(self) -> None:
        (self.src / "pic.png").write_bytes(b"x" * 100001)
        self.source("start.md", "# Start\n![pic](pic.png)")
        with patch.object(
            builder.subprocess,
            "run",
            return_value=subprocess.CompletedProcess([], 1, b"", b"error"),
        ):
            code, _, errors = self.render()
        self.assertEqual(code, 0)
        self.assertIn("warning", errors)
        self.assertIn("pic.png", errors)

    def test_failed_build_writes_nothing(self) -> None:
        self.source("start.md", "# Start\n[bad](missing.md)")
        code, _, _ = self.render()
        self.assertEqual(code, 1)
        self.assertFalse(self.out.exists())
        run = subprocess.run(
            [
                sys.executable,
                str(SKILL / "scripts/build.py"),
                str(self.src),
                str(self.out),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(run.returncode, 1)
        self.assertFalse(self.out.exists())
        self.out.parent.mkdir(parents=True, exist_ok=True)
        self.out.write_text("previous")
        self.assertEqual(self.render()[0], 1)
        self.assertEqual(self.out.read_text(), "previous")

    def test_remote_image_reported_once(self) -> None:
        for image in [
            "![x](https://example.com/x.png)",
            "<img src='https://example.com/x.png'>",
        ]:
            with self.subTest(image=image):
                self.source("start.md", "# Start\n" + image)
                code, _, errors = self.render()
                self.assertEqual(code, 1)
                self.assertEqual(errors.count("https://example.com/x.png"), 1)

    def test_single_quoted_src_is_embedded(self) -> None:
        self.source("pic.svg", "<svg/>")
        self.source("start.md", "# Start\n<img src='pic.svg'>\n<img src=pic.svg>")
        code, html, _ = self.render()
        self.assertEqual(code, 0)
        self.assertEqual(html.count("data:image/svg+xml;base64,"), 2)

    def test_non_md_relative_link_warns(self) -> None:
        self.source(
            "start.md",
            "# Start\n[PDF](file.pdf)\n<a href='pic.png'>image</a>\n[Web](https://example.com)",
        )
        code, _, errors = self.render()
        self.assertEqual(code, 0)
        for href in ["file.pdf", "pic.png"]:
            self.assertIn(f"start.md: relative link {href}", errors)
        self.assertNotIn("example.com", errors)

    @unittest.skipUnless(shutil.which("d2"), "d2 CLI not installed")
    def test_progress_lines_for_d2_pages(self) -> None:
        self.source("01-one.md", "# One\n```d2\na -> b\n```")
        self.source("02-two.md", "# Two\n```d2\nc -> d\n```")
        code, _, errors = self.render()
        self.assertEqual(code, 0)
        self.assertIn("page 01-one.md: 1 diagrams", errors)
        self.assertIn("page 02-two.md: 1 diagrams", errors)

    @unittest.skipUnless(shutil.which("d2"), "d2 CLI not installed")
    def test_example_builds(self) -> None:
        with (
            contextlib.redirect_stdout(io.StringIO()),
            contextlib.redirect_stderr(io.StringIO()),
        ):
            code = builder.build(
                SKILL / "example", self.out, None, builder.DEFAULT_STYLES
            )
        self.assertEqual(code, 0)
        self.assertTrue(self.out.exists())

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
        self.assertEqual(html.count('id="fn-first-1"'), 1)
        self.assertEqual(html.count('id="fn-second-1"'), 1)

    def test_inline_app_script_is_emitted(self) -> None:
        self.source("start.md", "# Start")
        _, html, _ = self.render()
        self.assertIn("const root = document.documentElement;", html)
        self.assertNotIn("{{script}}", html)
        self.assertNotRegex(html, r"\{\s*\{\s*script;")

    def test_template_markers_in_source_are_preserved(self) -> None:
        self.source("start.md", "# Start\nThe placeholder is {{script}}.")
        _, html, _ = self.render()
        self.assertIn("The placeholder is {{script}}.", html)

    def test_highlighting_and_plain_fallback(self) -> None:
        self.source(
            "start.md",
            "# Start\n\n"
            "```python\n  print('<script>')\n\n```\n\n"
            "```typescript\nconst x: string = '<script>';\n```\n\n"
            "```unknown-lexer\n<script>&\n```\n\n"
            "```\n<script>&\n```",
        )
        _, html, _ = self.render()
        blocks = re.findall(r"<pre[^>]*><code[^>]*>(.*?)</code></pre>", html, re.DOTALL)
        self.assertEqual(len(blocks), 4)
        self.assertEqual(
            [unescape(re.sub(r"<[^>]+>", "", block)) for block in blocks],
            [
                "  print('<script>')\n\n",
                "const x: string = '<script>';\n",
                "<script>&\n",
                "<script>&\n",
            ],
        )
        self.assertIn('class="tok-', blocks[0])
        self.assertIn('class="tok-', blocks[1])
        self.assertNotIn("<span", blocks[2])
        self.assertNotIn("<span", blocks[3])
        self.assertEqual(html.count(':root[data-mode="dark"] .highlight .tok-k '), 1)

    @unittest.skipUnless(shutil.which("d2"), "d2 CLI not installed")
    def test_real_d2_themes_render(self) -> None:
        self.source(
            "start.md",
            "# Diagram\n```d2\na: API\nb: Worker { class: target }\na -> b: call\n```",
        )
        for theme in ["slate", "indigo", "teal", "graphite"]:
            with self.subTest(theme=theme):
                code, html, errors = self.render(theme)
                self.assertEqual(code, 0)
                self.assertIn("page start.md: 1 diagrams", errors)
                self.assertIn('<figure class="diagram">', html)
                self.assertIn("<svg", html)
                # d2 SVGs must not switch on the OS setting; the page's own early script may.
                for svg in re.findall(r"<svg.*?</svg>", html, re.DOTALL):
                    self.assertNotIn("prefers-color-scheme", svg)
                self.assertEqual(html.count('<svg data-variant="light"'), 1)
                self.assertEqual(html.count('<svg data-variant="dark"'), 1)
                ids = re.findall(r'\bid="([^"]+)"', html)
                self.assertEqual(len(ids), len(set(ids)))
                self.assertIn("#302c25", html.lower())

    @unittest.skipUnless(shutil.which("d2"), "d2 CLI not installed")
    def test_dark_legacy_solid_fills_have_dark_labels(self) -> None:
        self.source(
            "start.md",
            "# Diagram\n```d2\n"
            "a: Primary { class: primary }\n"
            "b: Accent { class: accent }\n"
            "c: Database { class: database }\n"
            "d: Queue { class: queue }\n"
            "e: Ok { class: ok }\n```",
        )
        for theme in ["slate", "indigo", "teal", "graphite"]:
            with self.subTest(theme=theme):
                _, html, _ = self.render(theme)
                dark = html.split('data-variant="dark"', 1)[1].split("</figure>", 1)[0]
                for label in ["Primary", "Accent", "Database", "Queue", "Ok"]:
                    self.assertRegex(
                        dark, rf'<text[^>]*fill="#141413"[^>]*>{label}</text>'
                    )

    @unittest.skipUnless(shutil.which("d2"), "d2 CLI not installed")
    def test_bad_d2_fails(self) -> None:
        self.source("start.md", "# Diagram\n```d2\na: {\n```")
        with self.assertRaisesRegex(builder.BuildError, "d2 block 1"):
            self.render()


if __name__ == "__main__":
    unittest.main()
