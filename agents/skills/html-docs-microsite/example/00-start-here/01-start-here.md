# Start here

This document was written as four Markdown files in two folders. One command turned them into the single HTML file you are reading.

> [!NOTE]
> Nothing on this page loads from the network. Styles, script, diagrams and images are all inside the file.

## What to read

- [Build pipeline](../01-architecture/01-build-pipeline.md): how Markdown becomes HTML.
- [Diagrams and images](../01-architecture/02-diagrams-and-images.md#images): D2 diagrams and embedded pictures.
- [Diagram style](../01-architecture/03-diagram-style.md): the themes and the class vocabulary.
- [What the folder gives the build](#what-the-folder-gives-the-build), further down this page.

## What the folder gives the build

| Source | Becomes |
| --- | --- |
| `00-start-here/` folder name | Sidebar group "00 · Start here" |
| `01-build-pipeline.md` file name | Page order and the address `#architecture/build-pipeline` |
| First `#` heading | Page title in the sidebar |
| `##` and `###` headings | "On this page" list and search sections |
| `doc.toml` (optional) | Title, subtitle and theme[^theme] |

## Try it

- Press `/` and type `webp`.
- Use **Hide outline**, **Wide** and **Dark** at the top right. Diagrams stay light in dark mode.
- On a diagram, use **+**, **−** and **Reset**, or open it with **Fullscreen**.
- Click a diagram or an image to open it fullscreen.

[^theme]: `--theme` on the command line wins over `doc.toml`.
