# ImageMagick SVG decoding

`kitten icat foo.svg` (and every other ImageMagick consumer of SVG) failed on
this machine with:

```
identify: unable to read font `' @ error/annotate.c/RenderFreetype/1695.
```

kitty shells out to `magick identify`; a non-zero exit is reported verbatim as
a kitten failure. The SVG is not the problem — every SVG failed, including a
five-line handwritten one.

## Root cause

1. Homebrew builds ImageMagick **without librsvg**. `magick -version` lists
   `freetype heic jng jpeg lcms ltdl lzma png tiff webp xml zlib zstd` and no
   `rsvg`; `brew deps imagemagick` confirms it.
2. `coders/svg.c:3376-3394` (upstream tag 7.1.2-31) tries the `svg:decode`
   delegate first, then `RenderRSVGImage` (compiled out here), then falls back
   to the internal MSVG renderer.
3. The stock `svg:decode` entry, at
   `/opt/homebrew/Cellar/imagemagick/*/etc/ImageMagick-7/delegates.xml:118`,
   invokes **inkscape**, which is not installed. So decoding lands on MSVG.
4. MSVG cannot resolve `@font-face` families. Every d2 export declares one
   (`d2-1161411761-font-regular` etc.), so MSVG calls FreeType with an empty
   font name, errors, and exits 1.

`brew "resvg"` was an earlier attempt at this problem. It cannot work: nothing
in the chain ever calls `resvg`.

## The fix

`delegates.xml` here re-points `svg:decode` at `rsvg-convert` (from librsvg,
declared in the Brewfile). Four non-obvious constraints, all verified on
ImageMagick 7.1.2-31:

- **Precedence needs the environment variable.** `MagickCore/delegate.c:2188`
  appends entries in load order and `GetDelegateInfo` returns the first match.
  `magick -debug configure` shows `$HOME/.config/ImageMagick` searched *last*,
  behind the Homebrew copy, so a file there loses to the inkscape entry.
  `$MAGICK_CONFIGURE_PATH` is searched first, which is why `home/.zshrc`
  exports it. Keep only `delegates.xml` in this directory: everything in it
  shadows the system configuration, `policy.xml` included.

- **At most two `%s`.** `coders/svg.c:324-326` builds the command with
  `FormatLocaleString` and passes positional arguments (input, output, density,
  background, opacity). Consuming more conversions than are passed reads past
  the argument list and aborts the process with SIGABRT, machine-wide, on every
  `magick` invocation. The count is not stable across releases: six arguments
  through 7.1.0, five since 7.1.1. Only input and output are used here, because
  a decoder cannot exist without both.

- **The program name must be unquoted.** `rsvg-convert '%s' --output '%s'`
  works; `'rsvg-convert' '%s' --output '%s'` does not resolve through `$PATH`
  and silently falls back to MSVG. The stock entries quote their program names,
  which is likely why the inkscape one would fail even with inkscape installed.

- **No backticks or unbalanced quotes in comments.** ImageMagick's config
  loader is a hand-rolled tokenizer, not an XML parser: it treats a backtick as
  a quote delimiter, so an unbalanced one inside `<!-- -->` swallows the
  terminator and the delegate below it never registers. This file exists so the
  explanation can use backticks.

## Verifying

```sh
config/imagemagick/check.sh
```

Renders a fixture SVG with an unresolvable `@font-face` family, which is the
exact failure class, through both stages kitty runs (`identify`, then a
rasterise). Fatal if the delegate is broken; a warning only when the current
shell has not picked up the export yet. `install.sh` runs it.

## Blast radius

Every SVG raster produced by ImageMagick in a process that inherits the export
now comes from librsvg instead of MSVG: different antialiasing, and embedded
WOFF fonts are ignored in favour of a system fallback, so d2 label text is a
substitute sans face at slightly different metrics. If `rsvg-convert`
disappears, decoding falls back to MSVG and the original error returns; nothing
crashes.
