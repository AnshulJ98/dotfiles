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
TAG = re.compile(
    r"<(img|image|script|link|iframe|source|video|audio|a)\b[^>]*>", re.IGNORECASE
)
ATTR = re.compile(
    r"""\s(src|href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=`<>]+))""",
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
    slugs: set[str] = field(default_factory=set)


class Site:
    def __init__(self, src: Path, style: Path, full_res: bool = False) -> None:
        self.src = src
        self.style = style  # theme file without its .d2 suffix, as d2 imports want it
        self.full_res = full_res
        self.image_cache: dict[Path, str] = {}
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
        self._references()
        for file, href, target in self.links:
            if target not in self.anchors:
                self.problems.append(
                    f"{file.relative_to(src)}: link {href} points at a heading that does not exist"
                )

    def _markdown(self) -> MarkdownIt:
        md = MarkdownIt("commonmark").use(gfm_plugin).use(front_matter_plugin)
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
            title = tok.attrGet("title") or alt
            caption = f"<figcaption>{escape(str(title))}</figcaption>" if title else ""
            return f'<figure class="image-figure" tabindex="0">{DIAGRAM_BAR}<div class="stage">{img}</div>{caption}</figure>\n'

        def raw_html(self, tokens, idx, options, env):
            return site._raw_html(tokens[idx].content, env["page"])

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
        if len(file.relative_to(self.src).parts) >= 5:
            print(
                f"warning: {file.relative_to(self.src)}: nested 4+ folders deep",
                file=sys.stderr,
            )
        self._guard_raw_text(tokens, page)
        self._prepare(tokens, page)
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

    def _raw_html(self, content: str, page: Page) -> str:
        def tag(match: re.Match[str]) -> str:
            name = match.group(1).lower()

            def attr(a: re.Match[str]) -> str:
                key = a.group(1).lower()
                value = next(v for v in a.groups()[1:] if v is not None)
                if name == "img" and key == "src":
                    return ' src="' + escape(self._embed(value, page), quote=True) + '"'
                if name == "a" and key == "href":
                    self._warn_link(value, page)
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
            m = re.fullmatch(r"([^#:]+\.md)(?:#(.*))?", href)
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
                return f'<div class="rule" id="{anchor}"><a class="rule-id" href="#rules--{rid.lower()}">{rid}</a><p>{body}</p></div>'

            page.html = re.sub(block, define, page.html)
            parts = page.file.relative_to(self.src).parts
            if any("decisions" in d.lower() for d in parts[:-1]) and re.match(
                r"\d{3}-", parts[-1]
            ):
                refs["ADR-" + parts[-1][:3]] = (page.id, page.title, page, [])
            if strip_order(page.file.name).lower() == "glossary":
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

    def sidebar(self) -> str:
        tree = {}
        for page in self.pages:
            node = tree
            for part in page.file.relative_to(self.src).parts[:-1]:
                node = node.setdefault(part, {})
            node[page.file.name] = page

        def sections(page):
            return "".join(
                f'<a class="l{level}" href="#{hid}">{escape(text)}</a>'
                for level, hid, text in page.toc
            )

        def row(label, href="", children="", kind="pg"):
            head = f"<span>{escape(label)}</span>"
            if href:
                head = f'<a href="#{href}">{escape(label)}</a>'
            chev = '<span class="gap"></span>'
            if children or kind == "dir":
                chev = f'<button class="chev" type="button" aria-expanded="true" aria-label="Toggle {escape(label)}">›</button>'
            cls = "sections" if kind == "pg" else ""
            return f'<div class="node {kind}"><div class="row">{chev}{head}</div><div class="kids {cls}">{children}</div></div>'

        def render(node):
            out = []
            order = lambda name: (name == "rules.md", natural(name))
            for name in sorted(node, key=order):
                item = node[name]
                if isinstance(item, Page):
                    kids = ""
                    if any(t[0] == 2 for t in item.toc):
                        kids = sections(item)
                    out.append(row(item.title, item.id, kids))
                    continue
                pages = [p for p in item.values() if isinstance(p, Page)]
                indexes = [p for p in pages if p.file.name.startswith("00-")]
                landing = indexes[0] if indexes else None
                label = words(strip_order(name))
                if landing and len(landing.title) <= 28:
                    label = landing.title
                number = re.match(r"\d+", name)
                if number and not re.match(r"\d", label):
                    label = number[0] + " · " + label
                children = render({n: p for n, p in item.items() if p is not landing})
                kids = children
                if landing and landing.toc:
                    kids = f'<div class="sections">{sections(landing)}</div>' + kids
                href = landing.id if landing else ""
                out.append(row(label, href, kids, "dir"))
            return "".join(out)

        return '<div class="tree">' + render(tree) + "</div>"

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
                f'<article class="page" id="{page.id}" data-title="{escape(page.title)}">'
                f'<div class="content">{page.html}<nav class="pager">{pager}</nav></div>'
                f'<nav class="toc">{"<p class=group>On this page</p>" + toc if toc else ""}</nav></article>'
            )
        return "\n".join(out)


def build(
    src: Path, out: Path, theme: str | None, styles: Path, full_res: bool = False
) -> int:
    src = src.resolve()
    config_file = src / "doc.toml"
    allowed = "title, subtitle, theme"
    try:
        config = (
            tomllib.loads(config_file.read_text("utf-8"))
            if config_file.is_file()
            else {}
        )
    except tomllib.TOMLDecodeError as err:
        raise BuildError(f"{config_file}: {err}; allowed keys: {allowed}") from err
    if set(config) - {"title", "subtitle", "theme"}:
        raise BuildError(
            f"{config_file}: unknown keys: {set(config) - {'title', 'subtitle', 'theme'}}; allowed keys: {allowed}"
        )
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
        "title": escape(config.get("title", words(strip_order(src.name)))),
        "subtitle": escape(config.get("subtitle", "")),
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
