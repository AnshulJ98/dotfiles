"""Load the built example the way SharePoint's HTML viewer does, and self-test it there.

The CSP and the sandbox attribute are copied from github.com/SharePoint/sharepoint-html SKILL.md (read 2026-11-27).
The self-test names pages of example/, so build that folder first:
  uv run scripts/build.py example /tmp/microsite/example.html
  python3 tests/sandbox_check.py /tmp/microsite/example.html   -> example.sandbox.html and harness.html beside it
Then serve that folder over http and open harness.html; the result JSON appears in <pre id="result">.
"""

import sys
from pathlib import Path

CSP = (
    "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; "
    "img-src data: blob:; font-src data: blob:; connect-src 'none'; worker-src 'none'; "
    "object-src 'none'; base-uri 'none'; form-action 'none'"
)
PROBE = (
    f'<meta http-equiv="Content-Security-Policy" content="{CSP}">'
    "<script>window.__errors=[];addEventListener('error',e=>__errors.push(String(e.message)));"
    "addEventListener('securitypolicyviolation',e=>__errors.push('CSP '+e.violatedDirective+' '+e.blockedURI));</script>"
)
# Runs inside the sandboxed frame: drives the page and reports to the harness.
SELF_TEST = r"""
async function selfTest() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const css = (el, p) => getComputedStyle(el)[p];
  const visible = () => [...document.querySelectorAll(".page")].filter((p) => !p.hidden).map((p) => p.id);
  const out = { origin: location.origin };
  try {
    try { localStorage.getItem("x"); out.localStorage = "allowed"; } catch (e) { out.localStorage = e.name; }
    out.firstPage = visible();
    location.hash = "#architecture/diagram-style";
    await wait(300);
    out.afterHashChange = visible();
    const content = $(".page:not([hidden]) .content");
    const toc = $(".page:not([hidden]) .toc");
    out.width = { standard: content.clientWidth };
    $("#t-width").click(); await wait(50);
    out.width.wide = content.clientWidth;
    $("#t-width").click();
    out.outline = { before: css(toc, "display") };
    $("#t-outline").click();
    out.outline.afterHide = css(toc, "display");
    $("#t-outline").click();
    const look = () => ({ scheme: css(document.documentElement, "colorScheme"), page: css(document.body, "backgroundColor"),
      stage: css($(".page:not([hidden]) .stage"), "backgroundColor"), diagram: css($(".page:not([hidden]) .stage > svg[data-variant='" + (document.documentElement.dataset.mode === "dark" ? "dark" : "light") + "'] svg > rect"), "fill") });
    $("#t-mode").click();
    out.dark = look();
    $("#t-mode").click();
    out.light = look();
    const fig = $(".page:not([hidden]) .diagram");
    const stage = fig.querySelector(".stage");
    const pct = fig.querySelector(".pct");
    const press = (scope, act) => scope.querySelector('[data-act="' + act + '"]').click();
    const scrolls = (el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
    await wait(100);
    const zoom = { fitted: pct.textContent, frameHeight: stage.offsetHeight };
    press(fig, "in"); press(fig, "in");
    Object.assign(zoom, { inTwice: pct.textContent, scrollsInside: scrolls(stage), frameHeightKept: stage.offsetHeight === zoom.frameHeight });
    press(fig, "out");
    zoom.outOnce = pct.textContent;
    press(fig, "reset");
    zoom.reset = pct.textContent;
    out.zoom = zoom;
    const viewer = $("#viewer");
    const vstage = viewer.querySelector(".stage");
    const active = () => document.documentElement.dataset.mode === "dark" ? "dark" : "light";
    const idsUnique = () => { const ids = [...document.querySelectorAll("svg[id], svg [id]")].map((e) => e.id); return new Set(ids).size === ids.length; };
    $("#t-mode").click();
    const variants = { darkBefore: active(), darkVisible: css(stage.querySelector('[data-variant="dark"]'), "display") !== "none" };
    press(fig, "full"); await wait(50);
    variants.darkInViewer = vstage.querySelector("svg")?.dataset.variant;
    $("#t-mode").click(); await wait(50);
    variants.lightInViewer = vstage.querySelector("svg")?.dataset.variant;
    variants.uniqueIds = idsUnique();
    press(viewer, "close"); await wait(50);
    variants.lightReturned = !!stage.querySelector('[data-variant="light"]');
    dispatchEvent(new Event("resize")); await wait(50);
    variants.resizeFit = !!pct.textContent;
    $("#t-mode").click();
    press(fig, "full"); await wait(50);
    dispatchEvent(new Event("beforeprint")); await wait(50);
    variants.printClosed = !viewer.open && !!stage.querySelector('[data-variant="dark"]');
    variants.printLight = active() === "light";
    dispatchEvent(new Event("afterprint")); await wait(50);
    variants.restoredDark = active() === "dark";
    variants.idsAfterPrint = idsUnique();
    $("#t-mode").click();
    out.variants = variants;
    press(fig, "full"); await wait(100);
    const full = { open: viewer.open, hasDiagram: !!vstage.querySelector("svg"), fit: viewer.querySelector(".pct").textContent, wholeDiagramVisible: !scrolls(vstage) };
    press(viewer, "in"); press(viewer, "in"); press(viewer, "in");
    Object.assign(full, { inThrice: viewer.querySelector(".pct").textContent, scrollsInside: scrolls(vstage) });
    press(viewer, "reset");
    full.fitAgain = viewer.querySelector(".pct").textContent;
    press(viewer, "close"); await wait(50);
    Object.assign(full, { closed: !viewer.open, diagramBackInPage: !!stage.querySelector("svg"), pageLabel: pct.textContent });
    out.fullscreen = full;
    stage.querySelector("svg").dispatchEvent(new MouseEvent("click", { bubbles: true })); await wait(100);
    const byClick = { diagramClickOpens: viewer.open && !!vstage.querySelector("svg") };
    press(viewer, "close"); await wait(50);
    byClick.diagramBack = !!stage.querySelector("svg");
    location.hash = "#architecture/diagrams-and-images"; await wait(300);
    const img = $(".page:not([hidden]) .content img");
    const imageFilter = css(img, "filter");
    $("#t-mode").click();
    out.imageUnchangedInDark = css(img, "filter") === imageFilter;
    $("#t-mode").click();
    img.click(); await wait(200);
    Object.assign(byClick, { imageClickOpens: viewer.open && !!vstage.querySelector("img"), imageFit: viewer.querySelector(".pct").textContent, wholeImageVisible: !scrolls(vstage) });
    press(viewer, "in"); press(viewer, "in");
    Object.assign(byClick, { imageZoomed: viewer.querySelector(".pct").textContent, imageScrolls: scrolls(vstage) });
    // Cleanup runs on the asynchronously dispatched close event, not at close() itself.
    const imageClosed = new Promise((resolve) => viewer.addEventListener("close", resolve, { once: true }));
    press(viewer, "close"); await imageClosed;
    Object.assign(byClick, { closed: !viewer.open, copyRemoved: !vstage.querySelector("img"), imageStillInPage: !!$(".page:not([hidden]) .content img") });
    out.clickToFullscreen = byClick;
    const q = $("#q");
    q.value = "data uri";
    q.dispatchEvent(new Event("input"));
    out.searchHits = document.querySelectorAll("#results a").length;
    const images = [...document.querySelectorAll("img")];
    await Promise.all(images.map((i) => i.decode().catch(() => undefined)));
    out.images = images.map((i) => i.naturalWidth + "x" + i.naturalHeight);
  } catch (e) { out.testCrashed = String(e); }
  out.errors = window.__errors;
  parent.postMessage(JSON.stringify(out, null, 1), "*");
}
addEventListener("load", () => selfTest());
"""


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python3 sandbox_check.py <built.html>", file=sys.stderr)
        return 2
    built = Path(sys.argv[1])
    head, body_close, tail = (
        built.read_text("utf-8")
        .replace("<head>", "<head>" + PROBE, 1)
        .rpartition("</body>")
    )
    copy = built.with_suffix(".sandbox.html")
    copy.write_text(f"{head}<script>{SELF_TEST}</script>{body_close}{tail}", "utf-8")
    (built.parent / "harness.html").write_text(
        '<!doctype html><meta charset="utf-8"><title>sandbox harness</title><body style="margin:0">'
        '<pre id="result" style="margin:0;padding:4px;font-size:11px;white-space:pre-wrap">waiting</pre>'
        f'<iframe id="doc" sandbox="allow-scripts" src="{copy.name}" style="width:100vw;height:92vh;border:0"></iframe>'
        "<script>addEventListener('message',e=>{document.getElementById('result').textContent=e.data})</script>",
        "utf-8",
    )
    print(f"wrote {copy.name} and harness.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
