# Build pipeline

The build is a script, so the same Markdown always gives the same HTML and a broken diagram fails the build, not the reader's browser.

```d2
direction: right
md: Markdown folder {shape: page}
build: build.py {
  parse: markdown-it-py
  d2: d2 CLI { class: external }
  img: Image embed
  parse -> d2: d2 code blocks
  parse -> img: image paths
}
themes: "d2-diagrams skill\nstyles/" {shape: page; class: external}
html: One HTML file {shape: page; class: focus}
md -> build.parse
themes -> build.d2: theme
build -> html: inline SVG, data URIs
```

## Steps

1. Walk the folder in filename order.
2. Parse each file with `markdown-it-py` into tokens.
3. Give headings their ids, and rewrite links between `.md` files to in-page addresses.
4. Replace each `d2` code block with the SVG that the `d2` CLI prints.
5. Replace each image path with a data URI.

### Failing early

A link to a file or heading that does not exist stops the build with the file name and the link. So does an image or script that would load from the network.

## Command

```bash
uv run scripts/build.py example /tmp/microsite/example.html --theme indigo
```

Known language code blocks are syntax highlighted at build time.
