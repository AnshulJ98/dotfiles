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


class ImageDimensionsTest(unittest.TestCase):
    def test_raster_headers(self) -> None:
        def webp(kind: bytes, chunk: bytes) -> bytes:
            body = b"WEBP" + kind + len(chunk).to_bytes(4, "little") + chunk
            return b"RIFF" + len(body).to_bytes(4, "little") + body

        cases = [
            (
                "png",
                b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
                + (640).to_bytes(4, "big")
                + (320).to_bytes(4, "big"),
            ),
            ("gif87", b"GIF87a\x80\x02\x40\x01"),
            ("gif89", b"GIF89a\x80\x02\x40\x01"),
            ("jpeg", b"\xff\xd8\xff\xe0\x00\x04ab\xff\xc0\x00\x07\x08\x01\x40\x02\x80"),
            ("progressive", b"\xff\xd8\xff\xc2\x00\x07\x08\x01\x40\x02\x80"),
            ("vp8", webp(b"VP8 ", b"\x00\x00\x00\x9d\x01\x2a\x80\x02\x40\x01")),
            (
                "vp8l",
                webp(b"VP8L", b"\x2f" + (639 | (319 << 14)).to_bytes(4, "little")),
            ),
            (
                "vp8x",
                webp(
                    b"VP8X",
                    b"\x00" * 4
                    + (639).to_bytes(3, "little")
                    + (319).to_bytes(3, "little"),
                ),
            ),
        ]
        for name, data in cases:
            with self.subTest(format=name):
                self.assertEqual(builder.image_dimensions(data), (640, 320))
                self.assertIsNone(builder.image_dimensions(data[:-1]))
        for data in [
            b"",
            b"<svg/>",
            b"broken",
            b"GIF89a" + b"\x00" * 4,
            b"\xff\xd8\xff\xe0\x00\x00",
            b"\xff\xd8\xff" * 3,
        ]:
            with self.subTest(data=data):
                self.assertIsNone(builder.image_dimensions(data))


class BundledStylesTest(unittest.TestCase):
    def test_bundled_d2_styles_match_master(self) -> None:
        master = SKILL.parent / "d2-diagrams" / "styles"
        if not master.is_dir():
            self.skipTest("master d2-diagrams/styles absent")
        bundled = SKILL / "assets" / "d2-styles"
        names = {p.name for p in master.glob("*.d2")} | {
            p.name for p in bundled.glob("*.d2")
        }
        for name in sorted(names):
            with self.subTest(file=name):
                message = f"resync assets/d2-styles from d2-diagrams/styles: {name}"
                self.assertTrue((master / name).is_file(), message)
                self.assertTrue((bundled / name).is_file(), message)
                self.assertEqual(
                    (master / name).read_bytes(),
                    (bundled / name).read_bytes(),
                    message,
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

    def browser(
        self, html: str, script: str, fragment: str = "", width: int = 1280
    ) -> object:
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
        args += [f"--window-size={width},900", "--dump-dom", path.as_uri() + fragment]
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
        self.assertEqual(
            (code, errors),
            (
                0,
                "warning: 02-results.md: image tiny.png is 1px wide; figures read best at 1600px or more\n",
            ),
        )
        return html

    def test_brand_renders_mark(self) -> None:
        self.source("start.md", "# Start")
        for brand in ("O", "OL", "<&>!", "ABCD"):
            with self.subTest(brand=brand):
                self.source("doc.toml", f"brand = '{brand}'")
                _, html, _ = self.render()
                top = html.split('<header class="topbar">')[1].split("</header>")[0]
                self.assertIn(
                    f'<span class="mark" aria-hidden="true">{builder.escape(brand)}</span>',
                    top,
                )
                self.assertLess(top.index('class="mark"'), top.index("<strong>"))

    def test_no_brand_no_mark(self) -> None:
        self.source("start.md", "# Start")
        self.assertNotIn('class="mark"', self.render()[1])

    def test_brand_over_4_chars_fails(self) -> None:
        self.source("start.md", "# Start")
        for value in ('"ABCDE"', '""', "123"):
            with self.subTest(value=value):
                self.source("doc.toml", "brand = " + value)
                with self.assertRaisesRegex(builder.BuildError, "brand"):
                    self.render()

    def test_footer_escaped_inside_sidebar_and_at_bottom(self) -> None:
        self.source("start.md", "# Start")
        self.source("doc.toml", 'footer = "Internal <only> & private"')
        _, html, _ = self.render()
        side = html.split('<aside class="sidebar"')[1].split("</aside>")[0]
        self.assertIn('class="side-foot">Internal &lt;only&gt; &amp; private</', side)
        result = self.browser(
            html,
            """
            const side=document.querySelector(".sidebar"), foot=side.querySelector(".side-foot");
            t.textContent=JSON.stringify(side.getBoundingClientRect().bottom-foot.getBoundingClientRect().bottom);
        """,
            width=1400,
        )
        self.assertGreaterEqual(result, 0)
        self.assertLessEqual(result, 24)

    def test_eyebrows_outline_box_and_glossary_order(self) -> None:
        self.source("00-overview/00-index.md", "# Guide & map\n\n## Welcome")
        self.source(
            "00-overview/01-glossary.md", "# Glossary\n\n## Term\n\nDefinition."
        )
        self.source("00-overview/02-topic.md", "# Topic\n\n## Part\n\n### Detail")
        self.source("01-end.md", "# End\n\n> [!RULE] DOC-01\n> Keep it.")
        _, html, _ = self.render()
        nav = html.split('<nav id="nav">')[1].split("</nav>")[0]
        self.assertNotIn("00 · ", nav)
        self.assertEqual(
            re.findall(r'class="page" id="([^"]+)"', html),
            ["overview-index", "overview-topic", "end", "overview-glossary", "rules"],
        )
        tail = (
            'href="#rules">Rules</a></div><div class="kids sections"></div></div></div>'
        )
        self.assertTrue(nav.endswith(tail))
        for pid, text in [
            ("overview-topic", "GUIDE &amp; MAP / 2 OF 5"),
            ("end", "3 OF 5"),
            ("overview-glossary", "4 OF 5"),
            ("rules", "5 OF 5"),
        ]:
            article = html.split(f'id="{pid}" data-title=')[1].split("</article>")[0]
            self.assertIn(f'<p class="eyebrow">{text}</p><h1', article)
        end = html.split('id="end" data-title=')[1].split("</article>")[0]
        self.assertIn('<a class="next" href="#overview-glossary">', end)
        self.assertNotIn('<details class="otp">', end)
        topic = html.split('id="overview-topic" data-title=')[1].split("</article>")[0]
        box = topic.split('<details class="otp">')[1].split("</details>")[0]
        self.assertIn("<summary>On this page</summary>", box)
        self.assertEqual(
            re.findall(r'href="([^"]+)"', box),
            ["#overview-topic--part", "#overview-topic--detail"],
        )
        self.assertLess(
            nav.index('href="#end"'), nav.index('href="#overview-glossary"')
        )
        self.assertLess(
            nav.index('href="#overview-glossary"'), nav.index('href="#rules"')
        )

    def test_outline_box_breakpoint(self) -> None:
        html = self.site()
        for width, display in [(1000, "block"), (1400, "none")]:
            with self.subTest(width=width):
                probe = 't.textContent=JSON.stringify(getComputedStyle(document.querySelector(".otp")).display)'
                self.assertEqual(self.browser(html, probe, width=width), display)

    def test_caption_style(self) -> None:
        css = (SKILL / "assets/style.css").read_text()
        caption = re.search(r"figcaption\s*{([^}]+)}", css)[1]
        for declaration in (
            "color: var(--fg)",
            "font-weight: 500",
            "margin-top: 0.45rem",
            "text-align: center",
        ):
            self.assertIn(declaration, caption)
        self.assertNotIn(
            "Figure ", self.site().split("<figcaption>")[1].split("</figcaption>")[0]
        )

    def test_narrow_drawer(self) -> None:
        html = self.site()
        result = self.browser(
            html,
            """
            const menu=document.getElementById("t-menu"), side=document.querySelector(".sidebar");
            const state=()=>[menu.getAttribute("aria-expanded"),getComputedStyle(side).visibility,document.activeElement.id];
            menu.click(); const opened=state();
            document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
            const escaped=state();
            menu.click(); document.getElementById("drawer-backdrop").click(); const backdrop=state();
            menu.click(); document.querySelector('#nav a[href="#results"]').click();
            setTimeout(()=>{
              const routed=[menu.getAttribute("aria-expanded"),document.querySelector(".page.active").id];
              menu.click(); q.value="Before section"; q.dispatchEvent(new Event("input"));
              results.querySelector("a").click();
              setTimeout(()=>{t.textContent=JSON.stringify([opened,escaped,backdrop,routed,
                menu.getAttribute("aria-expanded"),document.querySelector(".page.active").id,
                document.scrollingElement.scrollWidth<=innerWidth,
                getComputedStyle(document.querySelector(".topbar")).position,
                getComputedStyle(side.querySelector(".side-head")).display]);},0);
            },0);
        """,
            width=390,
        )
        self.assertEqual(result[0], ["true", "visible", "q"])
        self.assertEqual(result[1], ["false", "hidden", "t-menu"])
        self.assertEqual(result[2], ["false", "hidden", "t-menu"])
        self.assertEqual(result[3], ["false", "results"])
        self.assertEqual(result[4:], ["false", "start", True, "sticky", "block"])
        probe = 't.textContent=JSON.stringify([getComputedStyle(document.getElementById("t-menu")).display,getComputedStyle(document.querySelector(".side-head")).display])'
        self.assertEqual(self.browser(html, probe, width=1400), ["none", "none"])

    def test_narrow_topbar_fits_scroll_padding(self) -> None:
        # The browser's fragment scroll reserves --top; a taller bar hides the eyebrow.
        self.source(
            "doc.toml",
            'title = "A long document title for a phone"\nsubtitle = "A subtitle long enough to wrap the bar"\nbrand = "AB"',
        )
        self.source("start.md", "# Start")
        _, html, _ = self.render()
        probe = 'const top=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--top"))*16; t.textContent=JSON.stringify(document.querySelector(".topbar").getBoundingClientRect().height<=top+0.5)'
        self.assertEqual(self.browser(html, probe, width=390), True)

    def test_sidebar_highlights_and_three_level_alignment(self) -> None:
        for folder in ("01-one", "01-one/02-two", "01-one/02-two/03-three"):
            self.source(folder + "/00-index.md", "# Landing\n\n## Section")
            self.source(folder + "/01-leaf.md", "# Leaf")
            self.source(folder + "/02-branch.md", "# Branch\n\n## Part")
        _, html, _ = self.render()
        for fragment in ("#one-index--section", "#one-two-three-branch--part"):
            with self.subTest(fragment=fragment):
                result = self.browser(
                    html,
                    """
                    const a=document.querySelector("#nav a.active"), row=a.closest(".row");
                    let fill=a;
                    while(getComputedStyle(fill).backgroundColor==="rgba(0, 0, 0, 0)") fill=fill.parentElement;
                    const aligned=[...document.querySelectorAll("#nav .dir > .kids")].every(k=>{
                      const xs=[...k.querySelectorAll(":scope > .node > .row > a")].map(a=>a.getBoundingClientRect().x);
                      return Math.max(...xs)-Math.min(...xs)<=2;
                    });
                    t.textContent=JSON.stringify([Math.abs(fill.getBoundingClientRect().width-row.getBoundingClientRect().width),
                      getComputedStyle(document.querySelector("#nav a.here")).backgroundColor,aligned]);
                """,
                    fragment,
                )
                self.assertLessEqual(result[0], 2)
                self.assertEqual(result[1:], ["rgba(0, 0, 0, 0)", True])

    def tabs_site(self) -> str:
        self.source(
            "tabs.md",
            "# Tabs\n\n## Install\n\nOutsideonly.\n\n::: tabs\n"
            "#### Python\n\nFirstonly.\n\n### First details\n\nFirst body.\n"
            "#### TypeScript\n\nSecondonly.\n\n### Second details\n\n"
            "Second body.\n\n## Second section\n\nMore body.\n\n"
            "![sample](sample.svg)\n:::\n\n"
            "::: tabs\n#### Python\nAgain.\n#### TypeScript\nAgain.\n:::\n",
        )
        self.source(
            "sample.svg",
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><rect width="400" height="200"/></svg>',
        )
        code, html, errors = self.render()
        self.assertEqual((code, errors), (0, ""))
        return html

    def test_panels_wrapped_and_keep_h4_ids(self) -> None:
        html = self.tabs_site()
        self.assertEqual(html.count('<div class="tabs">'), 2)
        for slug in ("python", "typescript", "python-1", "typescript-1"):
            self.assertIn(f'<div class="tab-panel">\n<h4 id="tabs--{slug}">', html)
        self.assertIn('href="#tabs--second-details"', html)
        self.assertIn('href="#tabs--second-section"', html)

    def test_no_tab_panel_ships_hidden(self) -> None:
        html = self.tabs_site()
        self.assertEqual(html.count('<div class="tab-panel">'), 4)
        self.assertNotRegex(html, r'<div class="tab-panel"[^>]*(?:hidden|style=)')
        html = re.sub(r"<script>.*?</script>", "", html, flags=re.DOTALL)
        result = self.browser(
            html,
            't.textContent=JSON.stringify([...document.querySelectorAll(".tab-panel, .tab-panel > h4")].every(e=>e.getBoundingClientRect().height>0))',
        )
        self.assertTrue(result)

    def test_tabs_failures_name_file_and_line(self) -> None:
        cases = [
            ("content before first ####", "::: tabs\nBefore.\n#### A\n:::", 4),
            ("empty tabs", "::: tabs\n\n:::", 3),
            ("nested tabs", "::: tabs\n#### A\n::: tabs\n#### B\n:::\n:::", 5),
            ("unclosed :::", "::: tabs\n#### A\nBody.", 3),
            ("unclosed :::", "::: tabs\n#### A\n::: nonsense", 3),
            ("unclosed :::", "::: tabs\n#### A\n::", 3),
        ]
        for error, body, line in cases:
            with self.subTest(error=error, body=body):
                self.source("bad.md", "# Bad\n\n" + body)
                run = subprocess.run(
                    [
                        sys.executable,
                        str(SKILL / "scripts/build.py"),
                        str(self.src),
                        str(self.out),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    check=False,
                )
                self.assertEqual(run.returncode, 1)
                self.assertIn(f"bad.md:{line}:", run.stderr)
                self.assertIn(error, run.stderr)

    def test_tab_click_keys_and_accessibility(self) -> None:
        html = self.tabs_site()
        result = self.browser(
            html,
            """
        const box=document.querySelector(".tabs"), panels=[...box.querySelectorAll(".tab-panel")],
          buttons=[...box.querySelectorAll('[role="tab"]')];
        const state=()=>panels.map(p=>getComputedStyle(p).display!=="none");
        const initial=state(); buttons[1].click(); const clicked=state();
        buttons[1].dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));
        const right=state();
        buttons[0].dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true}));
        const end=state();
        buttons[1].dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}));
        const home=state();
        buttons[0].dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true}));
        const left=state();
        t.textContent=JSON.stringify([initial,clicked,right,end,home,left,
          box.classList.contains("is-tabbed"),box.firstElementChild.role,
          buttons.map((b,i)=>[b.id,b.getAttribute("aria-controls")===panels[i].id,
            panels[i].role,panels[i].getAttribute("aria-labelledby")===b.id,b.tabIndex]),
          getComputedStyle(panels[1].querySelector("h4")).display,
          document.querySelectorAll(".tabs")[1].querySelector('[aria-selected="true"]').textContent]);
        """,
        )
        self.assertEqual(result[:6], [[True, False], [False, True]] * 3)
        self.assertEqual(result[6:8], [True, "tablist"])
        self.assertEqual(
            result[8],
            [
                ["tab-tabs--python", True, "tabpanel", True, -1],
                ["tab-tabs--typescript", True, "tabpanel", True, 0],
            ],
        )
        self.assertEqual(result[9:], ["none", "Python"])

    def test_tab_deep_links_and_search(self) -> None:
        html = self.tabs_site()
        # Drive the resize boundary: dump-dom's virtual clock can outrun rendering.
        marker = 'document.documentElement.classList.add("js");'
        observer = "window.testResizes=[]; const NativeObserver=ResizeObserver; window.ResizeObserver=class extends NativeObserver { constructor(callback){super(callback); testResizes.push(callback);} };"
        html = html.replace(marker, observer + marker)
        for fragment in ("#tabs--typescript", "#tabs--second-details"):
            with self.subTest(fragment=fragment):
                result = self.browser(
                    html,
                    't.textContent=JSON.stringify(document.querySelector(".tabs [aria-selected=true]").id)',
                    fragment,
                )
                self.assertEqual(result, "tab-tabs--typescript")
        for action in (
            "document.querySelector('.toc a[href=\"#tabs--second-details\"]').click();",
            'q.value="secondonly"; q.dispatchEvent(new Event("input")); results.querySelector("a").click();',
        ):
            with self.subTest(action=action):
                result = self.browser(
                    html,
                    action
                    + """
                setTimeout(()=>{ const p=document.querySelectorAll(".tab-panel")[1];
                  const img=p.querySelector(".stage img");
                  testResizes.forEach(f=>f());
                  t.textContent=JSON.stringify([p.getAttribute("aria-labelledby"),
                    getComputedStyle(p).display!=="none",
                    img.getBoundingClientRect().width>0,
                    img.getBoundingClientRect().height>0,
                    p.querySelector(".pct").textContent===Math.round(100*img.getBoundingClientRect().width/img.naturalWidth)+"%",
                    [...results.querySelectorAll("a")].map(a=>a.hash),
                    results.querySelector("a")?.firstChild.textContent]); },200);
                """,
                )
                self.assertEqual(result[:4], ["tab-tabs--typescript", True, True, True])
                self.assertTrue(result[4])
                if action.startswith("q."):
                    self.assertEqual(
                        result[5:],
                        [["#tabs--typescript"], "Tabs › Install › TypeScript"],
                    )

    def test_restored_section_opens_its_tab(self) -> None:
        html = self.tabs_site()
        marker = 'document.documentElement.classList.add("js");'
        seed = 'localStorage.setItem("hdm:"+document.title+":"+location.pathname,JSON.stringify({page:"tabs",section:"tabs--second-details"}));'
        result = self.browser(
            html.replace(marker, seed + marker),
            't.textContent=JSON.stringify([document.querySelector(".tabs [aria-selected=true]").id,[...document.querySelectorAll("a.here")].map(a=>a.hash)])',
        )
        self.assertEqual(
            result, ["tab-tabs--typescript", ["#tabs--second-details"] * 2]
        )

    def test_spy_ignores_unselected_panels(self) -> None:
        html = self.tabs_site()
        html = html.replace(
            'document.documentElement.classList.add("js");',
            'document.documentElement.classList.add("js"); window.testFrames=[]; window.requestAnimationFrame=f=>testFrames.push(f);',
        )
        result = self.browser(
            html,
            """
        const marks=[];
        for(const y of [0,500,document.documentElement.scrollHeight]){
          scrollTo(0,y); dispatchEvent(new Event("scroll"));
          testFrames.splice(0).forEach(f=>f());
          marks.push([...document.querySelectorAll("a.here")].map(a=>a.hash));
        }
        t.textContent=JSON.stringify(marks);
        """,
        )
        self.assertTrue(
            all(
                mark == ["#tabs--install"] * 2 or mark == ["#tabs--first-details"] * 2
                for mark in result
            )
        )

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
            'const n=document.querySelector("#route-notice"); const before=[n.hidden,n.textContent]; n.querySelector("button")?.click(); t.textContent=JSON.stringify([document.querySelector(".page:not([hidden])").id,...before,n.hidden])',
            "#%E0",
        )
        self.assertEqual(
            result, ["start", False, "The link #%E0 was not found Dismiss", True]
        )

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

    def test_uppercase_md_link_is_rewritten(self) -> None:
        self.source("other.MD", "# Other\n\n## X")
        self.source("Mixed.Md", "# Mixed\n\n## X")
        self.source("start.md", "# Start\n[upper](other.MD#x)\n[mixed](Mixed.Md)")
        code, html, errors = self.render()
        self.assertEqual((code, errors), (0, ""))
        self.assertIn('href="#other--x"', html)
        self.assertIn('href="#mixed"', html)

    def test_broken_md_link_fails(self) -> None:
        self.source("other.md", "# Other")
        for href in ("missing.MD", "missing.Md", "Other.MD", "other.md#missing"):
            with self.subTest(href=href):
                self.source("start.md", f"# Start\n[bad]({href})")
                code, _, errors = self.render()
                self.assertEqual(code, 1)
                self.assertIn(f"start.md: link {href}", errors)

    def test_raw_a_href_to_md_is_rewritten(self) -> None:
        self.source("other.md", "# Other\n\n## X")
        for markup in (
            '<a href="other.md#x">Go</a>',
            "Before <a href='other.md#x'>Go</a> after.",
            "<div><a href=other.md#x>Go</a></div>",
            '<a href="other.md">Go</a>',
            '<a href="#local">Go</a>',
        ):
            with self.subTest(markup=markup):
                self.source("start.md", "# Start\n\n## Local\n\n" + markup)
                code, html, errors = self.render()
                self.assertEqual((code, errors), (0, ""))
                target = (
                    "start--local"
                    if "#local" in markup
                    else ("other--x" if "#x" in markup else "other")
                )
                self.assertIn(f'<a href="#{target}">Go</a>', html)

    def test_raw_a_href_to_missing_md_or_anchor_fails(self) -> None:
        self.source("other.md", "# Other")
        for href in ("missing.md", "other.md#missing", "#missing"):
            for wrapper in ("{}", "Before {} after.", "<div>{}</div>"):
                with self.subTest(href=href, wrapper=wrapper):
                    markup = wrapper.format(f'<a href="{href}">Bad</a>')
                    self.source("start.md", "# Start\n\n" + markup)
                    code, _, errors = self.render()
                    self.assertEqual(code, 1)
                    self.assertIn(f"start.md: link {href}", errors)

    def test_narrow_figure_warns(self) -> None:
        (self.src / "tiny.gif").write_bytes(bytes.fromhex("4749463839614001a000"))
        for markup in (
            "![Tiny](tiny.gif)",
            '<img src="tiny.gif">',
            '<p><img src="tiny.gif"></p>',
            '<div>\n<p><img src="tiny.gif"></p>\n</div>',
        ):
            with self.subTest(markup=markup):
                self.source("start.md", "# Start\n\n" + markup)
                code, _, errors = self.render()
                self.assertEqual(code, 0)
                self.assertEqual(
                    errors,
                    "warning: start.md: image tiny.gif is 320px wide; figures read best at 1600px or more\n",
                )

    def test_inline_narrow_image_does_not_warn(self) -> None:
        (self.src / "tiny.gif").write_bytes(bytes.fromhex("4749463839614001a000"))
        for markup in (
            "Before ![Tiny](tiny.gif) after.",
            'Before <img src="tiny.gif"> after.',
            '<p>Before <img src="tiny.gif"> after.</p>',
            "![Tiny](tiny.gif) ![Tiny](tiny.gif)",
        ):
            with self.subTest(markup=markup):
                self.source("start.md", "# Start\n\n" + markup)
                code, _, errors = self.render()
                self.assertEqual((code, errors), (0, ""))

    def test_1600px_figure_does_not_warn(self) -> None:
        (self.src / "wide.gif").write_bytes(bytes.fromhex("4749463839614006a000"))
        self.source(
            "start.md", '# Start\n\n![Wide](wide.gif)\n\n<p><img src="wide.gif"></p>'
        )
        code, _, errors = self.render()
        self.assertEqual((code, errors), (0, ""))

    def test_tab_title_deep_link_scrolls_tabs_into_view(self) -> None:
        html = self.tabs_site()
        html = html.replace("Outsideonly.", "Outsideonly." + "<p>Spacer</p>" * 100)
        result = self.browser(
            html,
            'addEventListener("load",()=>{const box=document.querySelector(".tabs"); t.textContent=JSON.stringify([box.getBoundingClientRect().top,innerHeight,box.querySelector("[aria-selected=true]").id]);})',
            "#tabs--typescript",
        )
        self.assertEqual(result[2], "tab-tabs--typescript")
        self.assertGreaterEqual(result[0], 0)
        self.assertLess(result[0], result[1])

    def test_dark_bar_text_contrast(self) -> None:
        result = self.browser(
            self.site(),
            """
            document.documentElement.dataset.mode="dark";
            const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;})
              .reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
            const rgb=c=>c.match(/[\\d.]+/g).map(Number);
            const contrast=el=>{
              let bg=el;
              while(rgb(getComputedStyle(bg).backgroundColor)[3]===0) bg=bg.parentElement;
              const a=luminance(rgb(getComputedStyle(el).color));
              const b=luminance(rgb(getComputedStyle(bg).backgroundColor));
              return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
            };
            const scores=()=>[...document.querySelectorAll(".bar button, .bar .pct")].map(contrast);
            const figure=scores();
            document.querySelector(".image-figure [data-act=full]").click();
            t.textContent=JSON.stringify([...figure,...scores()]);
            """,
            "#results",
        )
        self.assertTrue(result)
        for contrast in result:
            self.assertGreaterEqual(contrast, 4.5)

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

    def test_repeated_image_embedded_once_across_pages(self) -> None:
        self.site()
        alt = "A &quot;quote&quot; &amp; &lt;tag&gt;"
        self.source("01-start.md", '# Start\n\n![A "quote" & <tag>](tiny.png)')
        for second in [
            "![Second](../tiny.png)",
            '<img src="../tiny.png" alt="A &quot;quote&quot; &amp; &lt;tag&gt;" class="raw" title="Keep">',
            "<img src='../tiny.png' alt='Second'>",
            "<img src=../tiny.png alt=Second>",
        ]:
            with self.subTest(second=second):
                self.source("02-results.md", "# Results")
                self.source("nested/end.md", "# End\n\n" + second)
                code, html, errors = self.render()
                self.assertEqual(
                    (code, errors),
                    (
                        0,
                        (
                            "warning: 01-start.md: image tiny.png is 1px wide; figures read best at 1600px or more\n"
                            "warning: nested/end.md: image ../tiny.png is 1px wide; figures read best at 1600px or more\n"
                        ),
                    ),
                )
                self.assertEqual(html.count("data:image/png;base64,"), 1)
                self.assertEqual(html.count('<use href="#img-1"/>'), 2)
                self.assertEqual(html.count('<symbol id="img-1"'), 1)
                self.assertIn(f'aria-label="{alt}"', html)
                self.assertIn(f"<figcaption>{alt}</figcaption>", html)
                self.assertIn('viewBox="0 0 1 1"', html)
                self.assertLess(html.index("<symbol "), html.index("<article "))
                if 'class="raw"' in second:
                    self.assertIn('class="img raw"', html)
                    self.assertIn('title="Keep"', html)

    def test_single_image_stays_img_and_code_is_not_counted(self) -> None:
        self.site()
        self.source(
            "01-start.md",
            '# Start\n\n`![code](tiny.png)`\n\n```html\n<img src="tiny.png">\n```',
        )
        code, html, errors = self.render()
        self.assertEqual(
            (code, errors),
            (
                0,
                "warning: 02-results.md: image tiny.png is 1px wide; figures read best at 1600px or more\n",
            ),
        )
        self.assertEqual(html.count("data:image/png;base64,"), 1)
        self.assertIn('<img src="data:image/png;base64,', html)
        self.assertNotIn("<symbol ", html)

    def test_unreadable_dimensions_keep_repeated_img(self) -> None:
        (self.src / "pic.png").write_bytes(b"not an image")
        self.source("start.md", "# Start\n\n![One](pic.png)\n\n![Two](pic.png)")
        code, html, errors = self.render()
        self.assertEqual((code, errors), (0, ""))
        self.assertEqual(html.count('<img src="data:image/png;base64,'), 2)
        self.assertNotIn("<symbol ", html)

    def test_converted_dimensions_are_used(self) -> None:
        (self.src / "pic.png").write_bytes(b"x" * 100001)
        self.source("start.md", "# Start\n\n![One](pic.png)\n\n![Two](pic.png)")
        chunk = b"\x00" * 4 + (639).to_bytes(3, "little") + (319).to_bytes(3, "little")
        webp = b"RIFF\x16\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00" + chunk
        with patch.object(
            builder.subprocess,
            "run",
            return_value=subprocess.CompletedProcess([], 0, webp, b""),
        ) as run:
            code, html, errors = self.render()
        self.assertEqual(
            (code, errors),
            (
                0,
                "warning: start.md: image pic.png is 640px wide; figures read best at 1600px or more\n"
                * 2,
            ),
        )
        self.assertEqual(run.call_count, 1)
        self.assertEqual(html.count("data:image/webp;base64,"), 1)
        self.assertEqual(html.count('<use href="#img-1"/>'), 2)
        self.assertIn('viewBox="0 0 640 320"', html)
        self.assertIn('width="640" height="320"', html)

    def test_repeated_image_viewer(self) -> None:
        self.site()
        self.source(
            "02-results.md", "# Results\n\n![One](tiny.png)\n\n![Two](tiny.png)"
        )
        _, html, _ = self.render()
        result = self.browser(
            html,
            """
            addEventListener("load", () => {
              const images=[...document.querySelectorAll("#results svg.img")];
              const size=el=>{const b=el.getBoundingClientRect();return b.width>0&&b.height>0;};
              const inline=images.map(size);
              images[1].dispatchEvent(new MouseEvent("click",{bubbles:true}));
              const viewer=document.querySelector("dialog#viewer");
              const copy=viewer.querySelector("svg.img");
              const use=copy?.querySelector("use");
              const box=use?.getBBox();
              document.documentElement.dataset.mode="dark";
              t.textContent=JSON.stringify([inline,viewer.open,!!copy&&size(copy),
                !!box&&box.width>0&&box.height>0,use?.getAttribute("href"),
                getComputedStyle(images[1].parentElement).backgroundColor]);
            });
            """,
            "#results",
        )
        self.assertEqual(
            result, [[True, True], True, True, True, "#img-1", "rgb(255, 255, 255)"]
        )

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

    @unittest.skipUnless(shutil.which("d2"), "d2 CLI not installed")
    def test_skill_copy_builds_alone(self) -> None:
        copied = self.root / "html-docs-microsite"
        for folder in ("scripts", "assets", "example"):
            shutil.copytree(SKILL / folder, copied / folder)
        self.assertFalse((copied.parent / "d2-diagrams").exists())
        run = subprocess.run(
            [
                sys.executable,
                str(copied / "scripts/build.py"),
                str(copied / "example"),
                str(self.out),
            ],
            cwd=self.root,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertRegex(run.stdout, r"\bd2 5 \(")
        self.assertEqual(
            self.out.read_text("utf-8").count('<figure class="diagram">'), 5
        )

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
