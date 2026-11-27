---
name: html-docs-microsite
description: Turn Markdown files or a folder of technical docs into one self-contained HTML microsite with navigation, search, D2 diagrams and embedded images. Use when asked for HTML docs, a single-file HTML report, an offline documentation site, microhtml, or a shareable interactive version of a design document. Keep Markdown as the source and generate HTML. Not for marketing landing pages, hosted applications, or slide decks.
---

# HTML Docs Microsite

Keep content in Markdown. Run the bundled builder to produce one HTML file; do not ask the model to regenerate the HTML, CSS or JavaScript.

## Build

Requires Python 3.11+ and `uv`. Python dependencies are pinned in the script header and installed by `uv run`. D2 blocks require the `d2` CLI and the sibling `d2-diagrams/styles/` folder. Optional `cwebp` compresses large PNG/JPEG images; without it the originals are embedded.

Resolve `<skill>` to this skill's directory. Commands work from any working directory:

```sh
uv run <skill>/scripts/build.py <markdown-folder> <output.html>
uv run <skill>/scripts/build.py <markdown-folder> <output.html> --theme indigo
```

Pass `--full-res` to embed original image bytes without WebP conversion.

Theme names: `slate` (default), `indigo`, `teal`, `graphite`. To use a separately installed D2 style folder, pass `--styles /path/to/d2-diagrams/styles`.

An optional `doc.toml` at the source root sets metadata:

```toml
title = "Service design"
subtitle = "Architecture and delivery plan"
theme = "slate"
```

The command-line theme wins. Put the HTML outside the source folder.

## Author the source

1. Read the existing documents before changing them. Preserve facts, filenames and hierarchy; do not fill gaps with invented architecture.
2. Use numbered filenames and folders for reading order:
   `00-start-here/01-overview.md`, `01-architecture/01-services.md`.
   Every `.md` under the source folder is included, so use a dedicated document folder, not a repository root.
3. Give each file one first-level heading. It becomes the navigation title. Second- and third-level headings populate the right-hand outline.
4. Link to other source files using relative Markdown paths, for example
   `[Services](../01-architecture/01-services.md#request-flow)`.
   Heading fragments are lowercase, punctuation removed, spaces replaced by hyphens. Duplicate headings append `-1`, `-2`.
5. Keep images beside the source and use relative paths. A standalone image becomes a figure; its Markdown title becomes the caption.
6. Use GFM tables, task lists, alerts (`> [!NOTE]`), strikethrough and footnotes. YAML front matter is hidden, not used as metadata.
7. For Word or PDF input, use its document skill to extract content first. Review the Markdown and extracted images before building; this skill does not parse those formats.

## Diagrams and design

Use fenced `d2` blocks. Known language fences such as `python` and `typescript` are highlighted at build time; unknown or unlabelled fences remain escaped plain text. Load the `d2-diagrams` skill for syntax and the shared class vocabulary. The builder imports the selected theme into every diagram, so omit imports in the fence. Do not duplicate palettes or inline colours.

Use `target` for planned components, `external` for outside services, `focus` for the subject, `exception` for exceptional edges. Name tint meanings in a legend. Keep the diagram source, not a screenshot of it.

The bundled design uses warm neutrals, pastel accents, restrained rules and system fonts. Select a theme instead of restyling each document. Do not add CDN fonts, scripts, stylesheets, remote images or embedded frames: the output must work without a network.

## Reading and navigation

Without JavaScript, all pages remain visible in reading order.

The sidebar lists the active page's second-level sections; the right-hand outline also includes third-level headings.

Every figure has zoom and fullscreen controls. Focus a figure and press Enter or f for fullscreen; in the viewer use + and - to zoom, 0 to fit, 1 for 1:1, and Escape to close.

## Verify and deliver

- Run the builder and inspect its exit status. It rejects duplicate page addresses, missing images, broken Markdown links and missing heading fragments. It also detects common external resource tags. A failed build leaves the output file unchanged.
- Open the HTML locally and inspect the first page, a table, a diagram and an image. Check navigation and search. Click images or diagrams for fullscreen; check zoom, Fit/Reset and closing.
- Confirm the requested theme. The top bar toggles outline, standard/wide width, and light/dark page mode. Diagrams and highlighted code follow the selected mode; images are unchanged. View settings are deliberately not saved: sandboxed viewers may prohibit storage.
- Keep the Markdown folder as the editable source. Deliver the HTML path and the exact rebuild command.
- Do not promise SharePoint compatibility: a local sandbox emulation passes, but a real tenant has not been tested. No upload or deployment is part of this workflow.

## Example and checks

Build the included four-page example:

```sh
uv run <skill>/scripts/build.py <skill>/example /tmp/microsite/example.html
uv run <skill>/tests/test_build.py
```

For the browser sandbox probe, run `python3 <skill>/tests/sandbox_check.py /tmp/microsite/example.html`, then serve that output folder over HTTP and open `harness.html`. The probe selects the first available page, heading and figure; its JSON reports viewer actions and runtime/CSP errors.

Current limits: no browser Fullscreen API (the viewer uses a dialog), and no annotation-to-Markdown round trip. Raw HTML is trusted author content, not sanitized input. The external-resource check is a compatibility check, not a security boundary. Printing uses fitted light diagrams but long diagrams, tables and code may still paginate poorly. Narrow-screen work is deferred; the outline intentionally hides at narrow widths. Chrome 158 forced-dark checks pass in both modes; browser extensions and real SharePoint are untested.
