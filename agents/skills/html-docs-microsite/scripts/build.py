# /// script
# requires-python = ">=3.11"
# dependencies = ["markdown-it-py==4.3.0", "mdit-py-plugins==0.7.0", "pygments==2.21.0"]
# ///
"""Build a folder of Markdown into one self-contained HTML file.

Run:   uv run scripts/build.py <folder> <out.html> [--theme slate|indigo|teal|graphite]
Needs: d2 on PATH and the d2-diagrams skill beside this one (or --styles); cwebp is optional.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import re
import subprocess
import sys
import tomllib
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from html import escape
from pathlib import Path
from urllib.parse import unquote

from markdown_it import MarkdownIt
from markdown_it.token import Token
from mdit_py_plugins.footnote import footnote_plugin
from mdit_py_plugins.front_matter import front_matter_plugin
from mdit_py_plugins.gfm import gfm_plugin
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound

SKILL = Path(__file__).resolve().parent.parent
ASSETS = SKILL / "assets"
# The diagram themes belong to the d2-diagrams skill, which is installed beside this one.
DEFAULT_STYLES = SKILL.parent / "d2-diagrams" / "styles"
MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}
RAW_IMG = re.compile(r'(<img\b[^>]*?\ssrc=")([^"]+)"')
# The SharePoint viewer's CSP blocks every one of these, silently.
EXTERNAL = re.compile(
    r'<(?:img|image|script|link|iframe|source|video|audio)\b[^>]*?\s(?:src|href|xlink:href)="(https?:[^"]+)"'
)
DIAGRAM_BAR = (
    '<div class="bar"><span class="pct"></span>'
    '<button type="button" data-act="out" aria-label="Zoom out">&minus;</button>'
    '<button type="button" data-act="in" aria-label="Zoom in">+</button>'
    '<button type="button" data-act="reset">Reset</button>'
    '<button type="button" data-act="full">Fullscreen</button></div>'
)


class BuildError(Exception):
    pass


def strip_order(name: str) -> str:
    return re.sub(r"^\d+[-_. ]*", "", name).removesuffix(".md")


def words(slug: str) -> str:
    text = re.sub(r"[-_]+", " ", slug)
    return text[:1].upper() + text[1:]


def slugify(text: str) -> str:
    return (
        re.sub(r"\s+", "-", re.sub(r"[^\w\- ]", "", text.lower()).strip()) or "section"
    )


def natural(name: str) -> list[int | str]:
    return [
        int(part) if part.isdigit() else part
        for part in re.split(r"(\d+)", name.lower())
    ]


def page_id(src: Path, file: Path) -> str:
    return "/".join(strip_order(part) for part in file.relative_to(src).parts)


def markdown_files(folder: Path) -> list[Path]:
    out: list[Path] = []
    for entry in sorted(folder.iterdir(), key=lambda p: natural(p.name)):
        if entry.is_dir():
            out += markdown_files(entry)
        elif entry.suffix == ".md":
            out.append(entry)
    return out


@dataclass
class Page:
    file: Path
    id: str
    group: str
    title: str
    toc: list[tuple[int, str, str]] = field(default_factory=list)  # level, id, text
    html: str = ""
    diagrams: int = 0
    titled: bool = False
    slugs: Counter[str] = field(default_factory=Counter)


class Site:
    def __init__(self, src: Path, style: Path) -> None:
        self.src = src
        self.style = style  # theme file without its .d2 suffix, as d2 imports want it
        files = markdown_files(src)
        if not files:
            raise BuildError(f"no .md files under {src}")
        self.ids = {f: page_id(src, f) for f in files}
        clash = [i for i, n in Counter(self.ids.values()).items() if n > 1]
        if clash:
            raise BuildError(
                "two files give the same page address: " + ", ".join(clash)
            )
        self.problems: list[str] = []
        self.links: list[
            tuple[Path, str, str]
        ] = []  # source file, href as written, target id
        self.anchors: set[str] = set(self.ids.values())
        self.stats: Counter[str] = Counter()
        self.md = self._markdown()
        self.pages = [self._page(f) for f in files]
        for file, href, target in self.links:
            if target not in self.anchors:
                self.problems.append(
                    f"{file.relative_to(src)}: link {href} points at a heading that does not exist"
                )

    def _markdown(self) -> MarkdownIt:
        md = (
            MarkdownIt("commonmark")
            .use(gfm_plugin)
            .use(footnote_plugin)
            .use(front_matter_plugin)
        )
        plain_fence = md.renderer.rules["fence"]
        site = self

        def fence(self, tokens, idx, options, env):
            if tokens[idx].info.strip() == "d2":
                return site._d2(tokens[idx].content, env["page"])
            language = tokens[idx].info.strip().split(maxsplit=1)
            if language:
                try:
                    lexer = get_lexer_by_name(
                        language[0], stripnl=False, ensurenl=False
                    )
                except ClassNotFound:
                    pass
                else:
                    return (
                        '<pre class="highlight"><code>'
                        + highlight(
                            tokens[idx].content,
                            lexer,
                            HtmlFormatter(
                                nowrap=True, classprefix="tok-", style="friendly"
                            ),
                        )
                        + "</code></pre>\n"
                    )
            return plain_fence(tokens, idx, options, env)

        def image(self, tokens, idx, options, env):
            tok = tokens[idx]
            alt = self.renderInlineAsText(tok.children or [], options, env)
            img = f'<img src="{site._embed(str(tok.attrGet("src")), env["page"])}" alt="{escape(alt)}">'
            if not tok.meta.get("block"):
                return img
            title = tok.attrGet("title")
            caption = f"<figcaption>{escape(str(title))}</figcaption>" if title else ""
            return f"<figure>{img}{caption}</figure>\n"

        def raw_html(self, tokens, idx, options, env):
            # pandoc's docx -> gfm output carries images as raw <img> tags.
            return RAW_IMG.sub(
                lambda m: m.group(1) + site._embed(m.group(2), env["page"]) + '"',
                tokens[idx].content,
            )

        md.add_render_rule("fence", fence)
        md.add_render_rule("image", image)
        md.add_render_rule("html_block", raw_html)
        md.add_render_rule("html_inline", raw_html)
        md.add_render_rule(
            "table_open",
            lambda self, tokens, idx, options, env: '<div class="table-wrap"><table>\n',
        )
        md.add_render_rule(
            "table_close", lambda self, tokens, idx, options, env: "</table></div>\n"
        )
        return md

    def _page(self, file: Path) -> Page:
        pid = self.ids[file]
        group = file.relative_to(self.src).parts[0] if file.parent != self.src else ""
        page = Page(file=file, id=pid, group=group, title=words(pid.split("/")[-1]))
        env = {
            "page": page,
            "docId": re.sub(r"[^A-Za-z0-9]+", "-", pid),
        }  # docId keeps footnote ids unique per page
        tokens = self.md.parse(file.read_text("utf-8"), env)
        self._prepare(tokens, page)
        page.html = self.md.renderer.render(tokens, self.md.options, env)
        return page

    def _prepare(self, tokens: list[Token], page: Page) -> None:
        for i, tok in enumerate(tokens):
            if tok.type == "heading_open":
                text = "".join(
                    c.content
                    for c in tokens[i + 1].children or []
                    if c.type in ("text", "code_inline")
                )
                level = int(tok.tag[1])
                if level == 1 and not page.titled:
                    page.title, page.titled = text, True
                    continue
                slug = slugify(text)
                page.slugs[slug] += 1
                if page.slugs[slug] > 1:
                    slug += f"-{page.slugs[slug] - 1}"
                hid = f"{page.id}--{slug}"
                tok.attrSet("id", hid)
                self.anchors.add(hid)
                if level in (2, 3):
                    page.toc.append((level, hid, text))
            elif tok.type == "inline":
                children = tok.children or []
                if (
                    len(children) == 1
                    and children[0].type == "image"
                    and tokens[i - 1].type == "paragraph_open"
                ):
                    # An image alone in a paragraph becomes a block-level figure.
                    children[0].meta["block"] = True
                    tokens[i - 1].hidden = tokens[i + 1].hidden = True
                for child in children:
                    if child.type == "link_open":
                        child.attrSet(
                            "href", self._link(str(child.attrGet("href")), page)
                        )

    def _link(self, href: str, page: Page) -> str:
        if href.startswith("#"):
            target = f"{page.id}--{href[1:]}"
        else:
            m = re.fullmatch(r"([^#:]+\.md)(?:#(.*))?", href)
            if not m:
                return href
            pid = self.ids.get((page.file.parent / unquote(m.group(1))).resolve())
            if pid is None:
                self.problems.append(
                    f"{page.file.relative_to(self.src)}: link {href} points at a file that does not exist"
                )
                return href
            target = pid + (f"--{m.group(2)}" if m.group(2) else "")
        self.links.append((page.file, href, target))
        return "#" + target

    def _d2(self, source: str, page: Page) -> str:
        page.diagrams += 1
        salt = hashlib.sha256(f"{page.id}:{page.diagrams}".encode()).hexdigest()
        variants = []
        for mode in ("light", "dark"):
            variants.append(self._render_d2(source, page, salt, mode))
        return f'<figure class="diagram">{DIAGRAM_BAR}<div class="stage">{"".join(variants)}</div></figure>\n'

    def _render_d2(self, source: str, page: Page, salt: str, mode: str) -> str:
        cmd = [
            "d2",
            "--no-xml-tag",
            "--omit-version",
            "--salt",
            salt + mode,
            "--theme",
            "0",
            "--pad",
            "16",
            "--layout",
            "elk",
            "-",
            "-",
        ]
        style = (
            self.style
            if mode == "light"
            else self.style.with_name(self.style.name + "-dark")
        )
        if not style.with_suffix(".d2").is_file():
            raise BuildError(f"missing {mode} diagram theme: {style}.d2")
        run = subprocess.run(
            cmd,
            input=f'...@"{style}"\n{source}'.encode(),
            capture_output=True,
            check=False,
        )
        if run.returncode != 0:
            where = f"{page.file.relative_to(self.src)}: d2 block {page.diagrams}"
            raise BuildError(
                f"{where} failed (line numbers are one too high: the style import is line 1)\n{run.stderr.decode()}"
            )
        svg = run.stdout.decode()
        box = re.search(r'viewBox="0 0 (\d+) (\d+)"', svg)
        width = box.group(1) if box else "800"
        if mode == "light":
            self.stats["d2"] += 1
        self.stats["d2_bytes"] += len(svg)
        svg = svg.replace('id="d2-svg"', f'id="d2-svg-{salt}-{mode}"').replace(
            "#d2-svg", f"#d2-svg-{salt}-{mode}"
        )
        return svg.replace(
            "<svg ", f'<svg data-variant="{mode}" style="max-width:{width}px" ', 1
        )

    def _embed(self, src: str, page: Page) -> str:
        if src.startswith("data:"):
            return src
        if re.match(r"https?:", src):
            self.problems.append(
                f"{page.file.relative_to(self.src)}: remote image {src} cannot be embedded"
            )
            return src
        path = (page.file.parent / unquote(src)).resolve()
        mime = MIME.get(path.suffix.lower())
        if mime is None or not path.is_file():
            raise BuildError(
                f"{page.file.relative_to(self.src)}: image {src} is missing or not a supported type"
            )
        data = path.read_bytes()
        self.stats["images"] += 1
        self.stats["image_bytes_in"] += len(data)
        if path.suffix.lower() in (".png", ".jpg", ".jpeg") and len(data) > 100_000:
            try:
                webp = subprocess.run(
                    ["cwebp", "-quiet", "-q", "82", str(path), "-o", "-"],
                    capture_output=True,
                    check=False,
                )
            except FileNotFoundError:
                webp = None
            if webp and webp.returncode == 0 and len(webp.stdout) < len(data):
                data, mime = webp.stdout, "image/webp"
        self.stats["image_bytes_out"] += len(data)
        return f"data:{mime};base64,{base64.b64encode(data).decode()}"

    def sidebar(self) -> str:
        out: list[str] = []
        group = None
        for page in self.pages:
            if page.group != group:
                group = page.group
                if group:
                    number = re.match(r"\d+", group)
                    label = (number.group() + " · " if number else "") + escape(
                        words(strip_order(group))
                    )
                    out.append(f'<p class="group">{label}</p>')
            out.append(f'<a href="#{page.id}">{escape(page.title)}</a>')
        return "\n".join(out)

    def articles(self) -> str:
        out: list[str] = []
        for i, page in enumerate(self.pages):
            toc = "\n".join(
                f'<a class="l{level}" href="#{hid}">{escape(text)}</a>'
                for level, hid, text in page.toc
            )
            pager = ""
            if i > 0:
                prev = self.pages[i - 1]
                pager += f'<a class="prev" href="#{prev.id}"><small>Previous</small>{escape(prev.title)}</a>'
            if i + 1 < len(self.pages):
                nxt = self.pages[i + 1]
                pager += f'<a class="next" href="#{nxt.id}"><small>Next</small>{escape(nxt.title)}</a>'
            out.append(
                f'<article class="page" id="{page.id}" data-title="{escape(page.title)}" hidden>'
                f'<div class="content">{page.html}<nav class="pager">{pager}</nav></div>'
                f'<nav class="toc">{"<p class=group>On this page</p>" + toc if toc else ""}</nav></article>'
            )
        return "\n".join(out)


def build(src: Path, out: Path, theme: str | None, styles: Path) -> int:
    src = src.resolve()
    config_file = src / "doc.toml"
    config = (
        tomllib.loads(config_file.read_text("utf-8")) if config_file.is_file() else {}
    )
    theme = theme or config.get("theme", "slate")
    if not (styles / f"{theme}.d2").is_file():
        known = ", ".join(
            sorted(
                p.stem
                for p in styles.glob("*.d2")
                if p.stem != "vocabulary" and not p.stem.endswith("-dark")
            )
        )
        raise BuildError(f"no theme {theme!r} in {styles} (found: {known or 'none'})")
    site = Site(src, styles.resolve() / theme)
    values = {
        "title": escape(config.get("title", words(strip_order(src.name)))),
        "subtitle": escape(config.get("subtitle", f"Built {date.today():%-d %b %Y}")),
        "theme": theme,
        "style": (ASSETS / "style.css").read_text("utf-8")
        + "\n"
        + HtmlFormatter(style="friendly", classprefix="tok-").get_style_defs(
            ':root:not([data-mode="dark"]) .highlight'
        )
        + "\n"
        + HtmlFormatter(style="github-dark", classprefix="tok-").get_style_defs(
            ':root[data-mode="dark"] .highlight'
        ),
        "script": (ASSETS / "app.js").read_text("utf-8"),
        "nav": site.sidebar(),
        "pages": site.articles(),
    }
    # One pass over the template only, so a page that mentions {{script}} is left alone.
    page = re.sub(
        r"\{\{(\w+)\}\}",
        lambda m: values[m.group(1)],
        (ASSETS / "template.html").read_text("utf-8"),
    )
    site.problems += [
        f"external resource will not load in the SharePoint viewer: {url}"
        for url in EXTERNAL.findall(page)
    ]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, "utf-8")
    s = site.stats

    def kb(n: int) -> str:
        return f"{n / 1024:.1f} KB"

    print(
        f"theme {theme}, pages {len(site.pages)}, d2 {s['d2']} ({kb(s['d2_bytes'])}), images {s['images']} "
        f"({kb(s['image_bytes_in'])} -> {kb(s['image_bytes_out'])}), output {kb(len(page.encode()))} -> {out}"
    )
    if site.problems:
        print("\n".join(site.problems), file=sys.stderr)
        return 1
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Build a folder of Markdown into one self-contained HTML file."
    )
    ap.add_argument("src", type=Path, help="folder of Markdown files")
    ap.add_argument("out", type=Path, help="HTML file to write")
    ap.add_argument(
        "--theme",
        help="slate (default), indigo, teal or graphite; doc.toml can set it too",
    )
    ap.add_argument(
        "--styles", type=Path, default=DEFAULT_STYLES, help="folder of d2 theme files"
    )
    args = ap.parse_args()
    try:
        return build(args.src, args.out, args.theme, args.styles)
    except BuildError as err:
        print(f"build failed: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
