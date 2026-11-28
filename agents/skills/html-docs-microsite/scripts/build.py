# /// script
# requires-python = ">=3.11"
# dependencies = ["markdown-it-py==4.3.0", "mdit-py-plugins==0.7.0", "pygments==2.21.0"]
# ///
"""Build a folder of Markdown into one self-contained HTML file.

Run:   uv run scripts/build.py <folder> <out.html> [--theme slate|indigo|teal|graphite]
Needs: d2 on PATH for diagrams; styles are bundled. cwebp is optional.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import os
import re
import subprocess
import sys
import tempfile
import tomllib
from collections import Counter
from dataclasses import dataclass, field
from html import escape, unescape
from pathlib import Path
from urllib.parse import unquote, urlsplit

from markdown_it import MarkdownIt
from markdown_it.token import Token
from mdit_py_plugins.container import container_plugin
from mdit_py_plugins.front_matter import front_matter_plugin
from mdit_py_plugins.gfm import gfm_plugin
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound

SKILL = Path(__file__).resolve().parent.parent
ASSETS = SKILL / "assets"
# Master themes live in d2-diagrams/styles; keep this bundled copy in sync.
DEFAULT_STYLES = SKILL / "assets" / "d2-styles"
MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}
TAG = re.compile(
    r"<(img|image|script|link|iframe|source|video|audio|a)\b[^>]*>", re.IGNORECASE
)
ATTR = re.compile(
    r"""\s(src|href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=`<>]+))""",
    re.IGNORECASE,
)
IMG_ATTR = re.compile(
    r"""\s(src|alt|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=`<>]+))""",
    re.IGNORECASE,
)
RAW_TEXT = re.compile(r"<(title|textarea|style|xmp|plaintext)(?=[\s/>])", re.IGNORECASE)
DIAGRAM_BAR = (
    '<div class="bar"><button type="button" data-act="out" title="Zoom out (-)" aria-label="Zoom out">&minus;</button>'
    '<span class="pct"></span><button type="button" data-act="in" title="Zoom in (+)" aria-label="Zoom in">+</button>'
    '<button type="button" data-act="actual" title="Actual size (1)">1:1</button>'
    '<button type="button" data-act="reset" title="Fit (0)">Fit</button>'
    '<button type="button" data-act="full" title="Fullscreen (f)">Fullscreen</button></div>'
)


def map_text(html, transform, headings=False):
    """Transform prose, never attributes, code, existing links or SVG markup."""
    skip = ["code", "pre", "a", "svg", "script", "style"]
    if headings:
        skip += ["h1", "h2", "h3", "h4", "h5", "h6"]
    out, stack = [], []
    for part in re.split(r"(<[^>]+>)", html):
        tag = re.match(r"<(/?)([\w]+)", part.lower())
        if tag:
            closing, name = tag.groups()
            if closing and stack and stack[-1] == name:
                stack.pop()
            elif not closing and name in skip and not part.endswith("/>"):
                stack.append(name)
        out.append(part if part.startswith("<") or stack else transform(part))
    return "".join(out)


def strip_tags(html: str) -> str:
    return unescape(re.sub(r"<[^>]+>", "", html)).strip()


class BuildError(Exception):
    pass


def strip_order(name: str) -> str:
    return re.sub(r"\.md$", "", re.sub(r"^\d+[-_. ]*", "", name), flags=re.IGNORECASE)


def is_glossary(file: Path) -> bool:
    return strip_order(file.name).lower() == "glossary"


def words(slug: str) -> str:
    text = re.sub(r"[-_]+", " ", slug)
    return text[:1].upper() + text[1:]


def initials(title: str) -> str:
    """Brand mark default: first letters of up to three words, small words skipped."""
    small = {"a", "an", "and", "for", "in", "of", "on", "the", "to", "with"}
    found = re.findall(r"[^\W_]+", title)
    return "".join(w[0].upper() for w in found if w.lower() not in small)[:3]


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
    return (
        re.sub(
            r"[^a-z0-9-]+",
            "-",
            "-".join(strip_order(part) for part in file.relative_to(src).parts).lower(),
        ).strip("-")
        or "page"
    )


def markdown_files(folder: Path) -> list[Path]:
    out: list[Path] = []
    for entry in sorted(folder.iterdir(), key=lambda p: natural(p.name)):
        if entry.is_dir():
            out += markdown_files(entry)
        elif entry.suffix.lower() == ".md":
            out.append(entry)
    return out


def image_dimensions(data: bytes) -> tuple[int, int] | None:
    """Read raster headers, including the WebP bytes produced by cwebp."""
    width = height = 0
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        if data[12:16] == b"IHDR":
            width = int.from_bytes(data[16:20], "big")
            height = int.from_bytes(data[20:24], "big")
    elif data[:6] in (b"GIF87a", b"GIF89a") and len(data) >= 10:
        width = int.from_bytes(data[6:8], "little")
        height = int.from_bytes(data[8:10], "little")
    elif data.startswith(b"\xff\xd8"):
        pos = 2
        while pos + 4 <= len(data):
            if data[pos] != 0xFF:
                break
            pos += 1
            while pos < len(data) and data[pos] == 0xFF:
                pos += 1
            if pos >= len(data):
                break
            marker = data[pos]
            pos += 1
            if marker in (0xD9, 0xDA):
                break
            if marker == 0x01 or 0xD0 <= marker <= 0xD8:
                continue
            size = int.from_bytes(data[pos : pos + 2], "big")
            if size < 2 or pos + size > len(data):
                break
            if (
                marker
                in (
                    0xC0,
                    0xC1,
                    0xC2,
                    0xC3,
                    0xC5,
                    0xC6,
                    0xC7,
                    0xC9,
                    0xCA,
                    0xCB,
                    0xCD,
                    0xCE,
                    0xCF,
                )
                and size >= 7
            ):
                height = int.from_bytes(data[pos + 3 : pos + 5], "big")
                width = int.from_bytes(data[pos + 5 : pos + 7], "big")
                break
            pos += size
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        pos = 12
        while pos + 8 <= len(data):
            kind = data[pos : pos + 4]
            size = int.from_bytes(data[pos + 4 : pos + 8], "little")
            chunk = data[pos + 8 : pos + 8 + size]
            if len(chunk) != size:
                break
            if kind == b"VP8 " and size >= 10 and chunk[3:6] == b"\x9d\x01\x2a":
                width = int.from_bytes(chunk[6:8], "little") & 0x3FFF
                height = int.from_bytes(chunk[8:10], "little") & 0x3FFF
            elif kind == b"VP8L" and size >= 5 and chunk[0] == 0x2F:
                bits = int.from_bytes(chunk[1:5], "little")
                width, height = (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
            elif kind == b"VP8X" and size >= 10:
                width = int.from_bytes(chunk[4:7], "little") + 1
                height = int.from_bytes(chunk[7:10], "little") + 1
            if width and height:
                break
            pos += 8 + size + (size % 2)
    return (width, height) if width > 0 and height > 0 else None


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
    slugs: set[str] = field(default_factory=set)


class Site:
    def __init__(self, src: Path, style: Path, full_res: bool = False) -> None:
        self.src = src
        self.style = style  # theme file without its .d2 suffix, as d2 imports want it
        self.full_res = full_res
        self.image_cache: dict[Path, str] = {}
        self.image_counts: Counter[Path] = Counter()
        self.image_symbols: dict[Path, tuple[str, int, int]] = {}
        files = sorted(markdown_files(src), key=is_glossary)
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
        for file in files:
            self._count_images(self.md.parse(file.read_text("utf-8")), file)
        self.pages = [self._page(f) for f in files]
        self._references()
        for file, href, target in self.links:
            if target not in self.anchors:
                self.problems.append(
                    f"{file.relative_to(src)}: link {href} points at a heading that does not exist"
                )

    def _markdown(self) -> MarkdownIt:
        md = MarkdownIt("commonmark").use(gfm_plugin).use(front_matter_plugin)
        container_plugin(md, "tabs")
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
            img = site._image(
                str(tok.attrGet("src")),
                alt,
                env["page"],
                figure=bool(tok.meta.get("block")),
            )
            if not tok.meta.get("block"):
                return img
            title = tok.attrGet("title") or alt
            caption = f"<figcaption>{escape(str(title))}</figcaption>" if title else ""
            return f'<figure class="image-figure" tabindex="0">{DIAGRAM_BAR}<div class="stage">{img}</div>{caption}</figure>\n'

        def raw_html(self, tokens, idx, options, env):
            tok = tokens[idx]
            return site._raw_html(
                tok.content, env["page"], tok.block or bool(tok.meta.get("block"))
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

    def _count_images(self, tokens: list[Token], file: Path) -> None:
        for tok in tokens:
            sources = []
            if tok.type == "image":
                sources.append(str(tok.attrGet("src")))
            elif tok.type in ("html_block", "html_inline"):
                for tag in TAG.finditer(tok.content):
                    if tag.group(1).lower() == "img":
                        sources.extend(
                            unescape(next(v for v in a.groups()[1:] if v is not None))
                            for a in ATTR.finditer(tag.group(0))
                            if a.group(1).lower() == "src"
                        )
            for src in sources:
                if not src.startswith("data:") and not re.match(r"https?:", src):
                    self.image_counts[(file.parent / unquote(src)).resolve()] += 1
            if tok.children and tok.type != "image":
                self._count_images(tok.children, file)

    def _page(self, file: Path) -> Page:
        pid = self.ids[file]
        group = file.relative_to(self.src).parts[0] if file.parent != self.src else ""
        page = Page(file=file, id=pid, group=group, title=words(pid.split("/")[-1]))
        env = {
            "page": page,
            "docId": re.sub(r"[^A-Za-z0-9]+", "-", pid),
        }  # docId keeps footnote ids unique per page
        source = file.read_text("utf-8")
        tokens = self.md.parse(source, env)
        if len(file.relative_to(self.src).parts) >= 5:
            print(
                f"warning: {file.relative_to(self.src)}: nested 4+ folders deep",
                file=sys.stderr,
            )
        self._guard_raw_text(tokens, page)
        self._prepare(tokens, page, len(source.splitlines()))
        if not page.titled:
            raise BuildError(f"{file.relative_to(self.src)}: missing H1 title")
        page.html = self.md.renderer.render(tokens, self.md.options, env)
        if page.diagrams:
            print(
                f"page {file.relative_to(self.src)}: {page.diagrams} diagrams",
                file=sys.stderr,
            )
        return page

    def _guard_raw_text(self, tokens: list[Token], page: Page) -> None:
        for tok in tokens:
            if tok.type == "html_block":
                parts = [(tok.content, 0)]
            elif tok.type == "inline":
                parts = []
                offset = 0
                for child in tok.children or []:
                    if child.type == "html_inline":
                        pos = tok.content.find(child.content, offset)
                        if pos >= 0:
                            parts.append((child.content, tok.content[:pos].count("\n")))
                            offset = pos + len(child.content)
            else:
                continue
            for content, offset in parts:
                match = RAW_TEXT.search(content)
                if match:
                    line = (
                        (tok.map[0] if tok.map else 0)
                        + offset
                        + content[: match.start()].count("\n")
                        + 1
                    )
                    raise BuildError(
                        f"{page.file.relative_to(self.src)}:{line}: raw <{match.group(1)}> is not allowed"
                    )

    def _raw_html(self, content: str, page: Page, block: bool = False) -> str:
        figures = set()
        if block:
            if re.fullmatch(r"\s*<img\b[^>]*>\s*", content, re.IGNORECASE):
                figures.add(content.index("<"))
            figures.update(
                m.start(1)
                for m in re.finditer(
                    r"<p\b[^>]*>\s*(<img\b[^>]*>)\s*</p\s*>",
                    content,
                    re.IGNORECASE,
                )
            )

        def tag(match: re.Match[str]) -> str:
            name = match.group(1).lower()
            if name == "img":
                attrs = {
                    a.group(1).lower(): unescape(
                        next(v for v in a.groups()[1:] if v is not None)
                    )
                    for a in IMG_ATTR.finditer(match.group(0))
                }
                if "src" in attrs:
                    return self._image(
                        attrs["src"],
                        attrs.get("alt", ""),
                        page,
                        match.group(0),
                        figure=match.start() in figures,
                    )

            def attr(a: re.Match[str]) -> str:
                key = a.group(1).lower()
                value = next(v for v in a.groups()[1:] if v is not None)
                if name == "a" and key == "href":
                    return f' href="{escape(self._link(unescape(value), page))}"'
                elif name != "a" and re.match(r"https?:", value, re.IGNORECASE):
                    self.problems.append(
                        f"{page.file.relative_to(self.src)}: external resource will not load in the SharePoint viewer: {value}"
                    )
                return a.group(0)

            return ATTR.sub(attr, match.group(0))

        return TAG.sub(tag, content)

    def _warn_link(self, href: str, page: Page) -> None:
        url = urlsplit(href)
        if (
            url.path
            and not url.scheme
            and not url.netloc
            and not url.path.startswith("/")
            and not url.path.lower().endswith(".md")
        ):
            print(
                f"warning: {page.file.relative_to(self.src)}: relative link {href} will not be embedded",
                file=sys.stderr,
            )

    def _prepare(self, tokens: list[Token], page: Page, line_count: int) -> None:
        wrapped = []
        tabs = None
        panel = False

        def fail(token: Token, message: str) -> None:
            line = token.map[0] + 1
            raise BuildError(f"{page.file.relative_to(self.src)}:{line}: {message}")

        def panel_token(nesting: int) -> Token:
            token = Token(
                "tab_panel_open" if nesting == 1 else "tab_panel_close", "div", nesting
            )
            token.block = True
            if nesting == 1:
                token.attrSet("class", "tab-panel")
            return token

        for tok in tokens:
            if tok.type == "container_tabs_open":
                if tabs is not None:
                    fail(tok, "nested tabs")
                tabs, panel = tok, False
            elif tok.type == "container_tabs_close":
                # mdit-py-plugins 0.7.0: implicit closes have empty/partial markup;
                # map[1] reaches EOF rather than a closing marker (regression tested).
                if tabs.map[1] >= line_count or not re.fullmatch(
                    rf":{{{len(tabs.markup)},}}[ \t]*", tok.markup
                ):
                    fail(tabs, "unclosed :::")
                if not panel:
                    fail(tabs, "empty tabs")
                wrapped.append(panel_token(-1))
                tabs = None
            elif tabs is not None:
                if (
                    tok.type == "heading_open"
                    and tok.tag == "h4"
                    and tok.level == tabs.level + 1
                ):
                    if panel:
                        wrapped.append(panel_token(-1))
                    wrapped.append(panel_token(1))
                    panel = True
                elif not panel:
                    fail(tok, "content before first ####")
            wrapped.append(tok)
        tokens[:] = wrapped
        for i, tok in enumerate(tokens):
            if tok.type == "heading_open":
                text = "".join(
                    c.content
                    for c in tokens[i + 1].children or []
                    if c.type in ("text", "code_inline")
                )
                level = int(tok.tag[1])
                if level == 1 and not page.titled:
                    tok.attrSet("tabindex", "-1")
                    page.title, page.titled = text, True
                    continue
                base = slugify(text)
                slug = base
                suffix = 0
                while slug in page.slugs:
                    suffix += 1
                    slug = f"{base}-{suffix}"
                page.slugs.add(slug)
                hid = f"{page.id}--{slug}"
                tok.attrSet("id", hid)
                self.anchors.add(hid)
                if level in (2, 3):
                    page.toc.append((level, hid, text))
            elif tok.type == "fence" and tok.info.strip() == "mermaid":
                warning = f"warning: {page.file.relative_to(self.src)}:{tok.map[0] + 1}: render Mermaid to SVG/PNG first (mmdc -i x.mmd -o x.svg)"
                print(warning, file=sys.stderr)
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
                if (
                    len(children) == 1
                    and children[0].type == "html_inline"
                    and re.fullmatch(
                        r"<img\b[^>]*>", children[0].content, re.IGNORECASE
                    )
                    and tokens[i - 1].type == "paragraph_open"
                ):
                    children[0].meta["block"] = True
                for child in children:
                    if child.type == "link_open":
                        child.attrSet(
                            "href", self._link(str(child.attrGet("href")), page)
                        )

    def _link(self, href: str, page: Page) -> str:
        self._warn_link(href, page)
        if href.startswith("#"):
            target = f"{page.id}--{slugify(unquote(href[1:]))}"
        else:
            m = re.fullmatch(r"([^#:]+\.md)(?:#(.*))?", href, re.IGNORECASE)
            if not m:
                return href
            pid = self.ids.get((page.file.parent / unquote(m.group(1))).resolve())
            if pid is None:
                self.problems.append(
                    f"{page.file.relative_to(self.src)}: link {href} points at a file that does not exist"
                )
                return href
            target = pid + (f"--{slugify(unquote(m.group(2)))}" if m.group(2) else "")
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
        try:
            run = subprocess.run(
                cmd,
                input=f'...@"{style}"\n{source}'.encode(),
                capture_output=True,
                check=False,
                timeout=60,
            )
        except FileNotFoundError as err:
            raise BuildError("d2 not found on PATH") from err
        except subprocess.TimeoutExpired as err:
            raise BuildError(
                f"{page.file.relative_to(self.src)}: d2 block {page.diagrams} timed out after 60 seconds"
            ) from err
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

    def _image(
        self, src: str, alt: str, page: Page, raw: str = "", *, figure: bool = False
    ) -> str:
        uri = self._embed(src, page)
        if figure and uri.startswith("data:") and ";base64," in uri:
            dimensions = image_dimensions(base64.b64decode(uri.split(",", 1)[1]))
            if dimensions is not None and dimensions[0] < 1600:
                print(
                    f"warning: {page.file.relative_to(self.src)}: image {src} is {dimensions[0]}px wide; figures read best at 1600px or more",
                    file=sys.stderr,
                )
        symbol = None
        if not src.startswith("data:") and not re.match(r"https?:", src):
            symbol = self.image_symbols.get((page.file.parent / unquote(src)).resolve())
        if symbol is None:
            if raw:
                return ATTR.sub(
                    lambda a: (
                        f' src="{escape(uri)}"'
                        if a.group(1).lower() == "src"
                        else a.group(0)
                    ),
                    raw,
                )
            return f'<img src="{escape(uri)}" alt="{escape(alt)}">'
        sid, width, height = symbol
        extra, classes = "", "img"
        if raw:
            for attr in IMG_ATTR.finditer(raw):
                if attr.group(1).lower() == "class":
                    classes += " " + unescape(
                        next(v for v in attr.groups()[1:] if v is not None)
                    )
            extra = IMG_ATTR.sub("", raw)[4:].rstrip(">/").rstrip()
        return (
            f'<svg class="{escape(classes)}" viewBox="0 0 {width} {height}" '
            f'role="img" aria-label="{escape(alt)}"{extra}>'
            f'<use href="#{sid}"/></svg>'
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
        if path in self.image_cache:
            return self.image_cache[path]
        data = path.read_bytes()
        self.stats["images"] += 1
        self.stats["image_bytes_in"] += len(data)
        if (
            not self.full_res
            and path.suffix.lower() in (".png", ".jpg", ".jpeg")
            and len(data) > 100_000
        ):
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
            elif webp and webp.returncode != 0:
                print(f"warning: cwebp failed for {path}", file=sys.stderr)
        self.stats["image_bytes_out"] += len(data)
        uri = f"data:{mime};base64,{base64.b64encode(data).decode()}"
        self.image_cache[path] = uri
        if self.image_counts[path] >= 2:
            dimensions = image_dimensions(data)
            if dimensions is not None:
                self.image_symbols[path] = (
                    f"img-{len(self.image_symbols) + 1}",
                    *dimensions,
                )
        return uri

    def _references(self) -> None:
        rules, refs, terms = {}, {}, {}
        block = r"(?s)<blockquote>\s*<p>\[!RULE\] ([A-Z]{2,8}-\d{2,})(?:\n|</p>\s*<p>|(?=</p>))(.*?)</p>\s*</blockquote>"
        for page in self.pages:

            def define(m, page=page):
                rid, body = m.groups()
                if rid in rules:
                    name = page.file.relative_to(self.src)
                    self.problems.append(f"{name}: duplicate rule {rid}")
                anchor = "rule-" + rid.lower()
                rules[rid] = (body, page)
                refs[rid] = (anchor, strip_tags(body), page, [])
                return f'<div class="rule" id="{anchor}"><p><a class="rule-id" href="#rules--{rid.lower()}">{rid}</a> {body.lstrip()}</p></div>'

            page.html = re.sub(block, define, page.html)
            parts = page.file.relative_to(self.src).parts
            if any("decisions" in d.lower() for d in parts[:-1]) and re.match(
                r"\d{3}-", parts[-1]
            ):
                refs["ADR-" + parts[-1][:3]] = (page.id, page.title, page, [])
            if is_glossary(page.file):
                for level, hid, term in page.toc:
                    if level == 2:
                        pattern = r'(?s)id="%s"[^>]*>.*?</h2>\s*<p>(.*?)</p>'
                        m = re.search(pattern % re.escape(hid), page.html)
                        terms[term.lower()] = (hid, strip_tags(m[1]) if m else "", page)
        prefixes = sorted({rid.split("-")[0] for rid in rules})
        if prefixes:
            print("rule prefixes: " + ", ".join(prefixes), file=sys.stderr)
        rule_prefixes = "|".join(prefixes) or r"(?!)"
        # ADR mentions link only when the doc has a decisions folder, like rule prefixes.
        adr = r"|ADR-\d{3}" if any(k.startswith("ADR-") for k in refs) else ""
        pattern = rf"\b(?:(?:{rule_prefixes})-\d{{2,}}{adr})\b"
        names = "|".join(map(re.escape, sorted(terms, key=len, reverse=True)))
        term_pattern = re.compile(r"(?i)\b(" + names + r")(?:es|s)?\b")

        def link_page(page):
            def cite(m):
                rid = m[0]
                if rid not in refs:
                    name = page.file.relative_to(self.src)
                    self.problems.append(f"{name}: undefined reference {rid}")
                    return rid
                anchor, title, owner, cited = refs[rid]
                if page.id != "rules" and page is not owner and page.id not in cited:
                    cited.append(page.id)
                return (
                    f'<a class="ref" href="#{anchor}" title="{escape(title)}">{rid}</a>'
                )

            page.html = map_text(page.html, lambda text: re.sub(pattern, cite, text))
            used = set()

            def term_link(m):
                key = m[1].lower()
                hid, definition, owner = terms[key]
                if key in used or page is owner:
                    return m[0]
                used.add(key)
                return f'<a class="term" href="#{hid}" title="{escape(definition)}">{m[0]}</a>'

            if terms:
                link_terms = lambda text: term_pattern.sub(term_link, text)
                page.html = map_text(page.html, link_terms, headings=True)

        for page in self.pages:
            link_page(page)
        titles = {p.id: p.title for p in self.pages}

        def citations(ids):
            links = (f'<a href="#{p}">{escape(titles[p])}</a>' for p in ids)
            return ", ".join(links) or "—"

        for rid, (_, _, owner, cited) in refs.items():
            if re.fullmatch(r"ADR-\d{3}", rid):
                owner.html += f'<aside class="citedby"><h2>Cited by</h2>{citations(cited)}</aside>'
        if rules:
            if "rules" in self.anchors:
                self.problems.append("generated Rules id conflicts with source: rules")
            rows = "".join(
                f'<tr id="rules--{rid.lower()}"><td><a href="#{refs[rid][0]}">{rid}</a></td><td>{body}</td><td><a href="#{owner.id}">{escape(owner.title)}</a></td><td>{citations(refs[rid][3])}</td></tr>'
                for rid, (body, owner) in sorted(rules.items())
            )
            html = f'<h1 tabindex="-1">Rules</h1><div class="table-wrap"><table><thead><tr><th>Id</th><th>Text</th><th>Defined in</th><th>Cited by</th></tr></thead><tbody>{rows}</tbody></table></div>'
            register = Page(self.src / "rules.md", "rules", "", "Rules", html=html)
            link_page(register)
            self.pages.append(register)

    def folder_label(self, folder: Path) -> str:
        return words(strip_order(folder.name))

    def page_label(self, page: Page) -> str:
        # Sidebar names come from file names; the H1 stays the page heading.
        stem = page.file.stem
        num = re.match(r"\d+", stem)
        label = words(strip_order(stem))
        return f"{num[0]} {label}" if num and not is_glossary(page.file) else label

    def sidebar(self) -> str:
        tree = {}
        for page in self.pages:
            node = tree
            parts = page.file.relative_to(self.src).parts[:-1]
            if is_glossary(page.file):
                parts = ()
            for part in parts:
                node = node.setdefault(part, {})
            node[page.file.name] = page

        def sections(page):
            return "".join(
                f'<a class="l{level}" href="#{hid}">{escape(text)}</a>'
                for level, hid, text in page.toc
            )

        def row(label, href="", children="", kind="pg", number=""):
            # A leading number ("00 Hello") is shown faint, apart from the words.
            own = re.fullmatch(r"(\d+)\s+(\S.*)", label, re.DOTALL)
            if own:
                number, label = own.groups()
            text = escape(label)
            if number:
                text = f'<span class="num">{escape(number)}</span>' + text
            head = f"<span>{text}</span>"
            if href:
                head = f'<a href="#{href}">{text}</a>'
            chev = '<span class="gap"></span>'
            if children or kind == "dir":
                full = f"{number} {label}" if number else label
                chev = f'<button class="chev" type="button" aria-expanded="true" aria-label="Toggle {escape(full)}">›</button>'
            cls = "sections" if kind == "pg" else ""
            return f'<div class="node {kind}"><div class="row">{chev}{head}</div><div class="kids {cls}">{children}</div></div>'

        def render(node, folder=self.src):
            out = []
            order = lambda n: (n == "rules.md", is_glossary(Path(n)), natural(n))
            for name in sorted(node, key=order):
                item = node[name]
                if isinstance(item, Page):
                    kids = ""
                    if any(t[0] == 2 for t in item.toc):
                        kids = sections(item)
                    out.append(row(self.page_label(item), item.id, kids))
                    continue
                pages = [p for p in item.values() if isinstance(p, Page)]
                indexes = [p for p in pages if p.file.name.startswith("00-")]
                landing = indexes[0] if indexes else None
                label = self.folder_label(folder / name)
                children = render(
                    {n: p for n, p in item.items() if p is not landing}, folder / name
                )
                kids = children
                if landing and landing.toc:
                    kids = f'<div class="sections">{sections(landing)}</div>' + kids
                href = landing.id if landing else ""
                prefix = re.match(r"\d+", name)
                out.append(row(label, href, kids, "dir", prefix[0] if prefix else ""))
            return "".join(out)

        return '<div class="tree">' + render(tree) + "</div>"

    def articles(self) -> str:
        out: list[str] = []
        if self.image_symbols:
            symbols = "".join(
                f'<symbol id="{sid}" viewBox="0 0 {width} {height}">'
                f'<image href="{self.image_cache[path]}" width="{width}" height="{height}"/></symbol>'
                for path, (sid, width, height) in self.image_symbols.items()
            )
            out.append(
                '<svg hidden aria-hidden="true" style="position:absolute;width:0;height:0">'
                + symbols
                + "</svg>"
            )
        for i, page in enumerate(self.pages):
            toc = "\n".join(
                f'<a class="l{level}" href="#{hid}">{escape(text)}</a>'
                for level, hid, text in page.toc
            )
            label = (
                ""
                if page.file.parent == self.src or is_glossary(page.file)
                else self.folder_label(page.file.parent) + " / "
            )
            eyebrow = f'<p class="eyebrow">{escape(label.upper())}{i + 1} OF {len(self.pages)}</p>'
            box = (
                f'<details class="otp"><summary>On this page</summary><div>{toc}</div></details>'
                if any(t[0] == 2 for t in page.toc)
                else ""
            )
            body = page.html.replace("<h1", eyebrow + "<h1", 1)
            body = body.replace("</h1>", "</h1>" + box, 1)
            pager = ""
            if i > 0:
                prev = self.pages[i - 1]
                pager += f'<a class="prev" href="#{prev.id}"><small>Previous</small>{escape(prev.title)}</a>'
            if i + 1 < len(self.pages):
                nxt = self.pages[i + 1]
                pager += f'<a class="next" href="#{nxt.id}"><small>Next</small>{escape(nxt.title)}</a>'
            out.append(
                f'<article class="page" id="{page.id}" data-title="{escape(page.title)}">'
                f'<div class="content">{body}<nav class="pager">{pager}</nav></div>'
                f'<nav class="toc">{"<p class=group>On this page</p>" + toc if toc else ""}</nav></article>'
            )
        return "\n".join(out)


def build(
    src: Path, out: Path, theme: str | None, styles: Path, full_res: bool = False
) -> int:
    src = src.resolve()
    config_file = src / "doc.toml"
    allowed = "title, subtitle, theme, brand, footer"
    try:
        config = (
            tomllib.loads(config_file.read_text("utf-8"))
            if config_file.is_file()
            else {}
        )
    except tomllib.TOMLDecodeError as err:
        raise BuildError(f"{config_file}: {err}; allowed keys: {allowed}") from err
    unknown = set(config) - set(allowed.split(", "))
    if unknown:
        raise BuildError(
            f"{config_file}: unknown keys: {unknown}; allowed keys: {allowed}"
        )
    title = config.get("title", words(strip_order(src.name)))
    brand = config.get("brand")
    if brand is None:
        brand = initials(str(title))
    elif not isinstance(brand, str) or len(brand) > 4:
        raise BuildError(f"{config_file}: brand must be 0-4 characters")
    footer = config.get("footer", "")
    if not isinstance(footer, str):
        raise BuildError(f"{config_file}: footer must be plain text")
    theme = theme or config.get("theme", "slate")
    if theme not in {"slate", "indigo", "teal", "graphite"}:
        raise BuildError(
            f"no theme {theme!r} in CSS; choose slate, indigo, teal or graphite"
        )
    if not (styles / f"{theme}.d2").is_file():
        known = ", ".join(
            sorted(
                p.stem
                for p in styles.glob("*.d2")
                if p.stem != "vocabulary" and not p.stem.endswith("-dark")
            )
        )
        raise BuildError(f"no theme {theme!r} in {styles} (found: {known or 'none'})")
    site = Site(src, styles.resolve() / theme, full_res)
    values = {
        "title": escape(title),
        "subtitle": escape(config.get("subtitle", "")),
        "theme": theme,
        "brand": f'<span class="mark" aria-hidden="true">{escape(brand)}</span>'
        if brand
        else "",
        "footer": f'<div class="side-foot">{escape(footer)}</div>' if footer else "",
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
    if site.problems:
        print("\n".join(site.problems), file=sys.stderr)
        return 1
    out.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=out.parent, delete=False
        ) as temp:
            temp_path = Path(temp.name)
            temp.write(page)
        os.replace(temp_path, out)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
    s = site.stats

    def kb(n: int) -> str:
        return f"{n / 1024:.1f} KB"

    print(
        f"theme {theme}, pages {len(site.pages)}, d2 {s['d2']} ({kb(s['d2_bytes'])}), images {s['images']} "
        f"({kb(s['image_bytes_in'])} -> {kb(s['image_bytes_out'])}), output {kb(len(page.encode()))} -> {out}"
    )
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
    ap.add_argument(
        "--full-res",
        action="store_true",
        help="embed original image bytes without WebP conversion",
    )
    args = ap.parse_args()
    try:
        return build(args.src, args.out, args.theme, args.styles, args.full_res)
    except BuildError as err:
        print(f"build failed: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
