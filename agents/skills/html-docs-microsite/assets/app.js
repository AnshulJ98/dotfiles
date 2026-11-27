(() => {
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const pages = [...document.querySelectorAll(".page")];
  const navLinks = [...document.querySelectorAll("#nav a")];
  const nav = $("nav");
  const results = $("results");
  const q = $("q");
  const docTitle = document.title;
  document.querySelector(".skip-link").addEventListener("click", (e) => {
    e.preventDefault();
    $("main").focus();
  });

  const storageKey = "hdm:" + docTitle + ":" + location.pathname;
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {}
  let currentPage, section;
  let locked = false;
  let pending = 0;
  function save() {
    saved = { ...saved, page: currentPage?.id, section };
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {}
  }
  function mark(id) {
    if (id === section) return;
    section = id;
    for (const a of document.querySelectorAll("#nav a, .toc a"))
      a.classList.toggle("here", a.getAttribute("href") === "#" + id);
    save();
  }
  function spy() {
    pending = 0;
    if (locked || !currentPage) return;
    const headings = [...currentPage.querySelectorAll("h2[id], h3[id]")];
    const height = document.documentElement.scrollHeight;
    const remaining = Math.max(0, height - innerHeight - scrollY);
    const top =
      document.querySelector(".topbar").getBoundingClientRect().bottom + 8;
    const line =
      top + (innerHeight - top) * (1 - Math.min(1, remaining / innerHeight));
    const above = headings.filter((h) => h.getBoundingClientRect().top <= line);
    mark((remaining < 1 ? headings.at(-1) : above.at(-1) || headings[0])?.id);
  }
  function schedule() {
    pending ||= requestAnimationFrame(spy);
  }
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  const release = () => {
    locked = false;
    schedule();
  };
  addEventListener("wheel", release, { passive: true });
  addEventListener("touchstart", release, { passive: true });
  addEventListener("keydown", (e) => {
    if (/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key))
      release();
  });
  $("main").addEventListener("pointerdown", release);
  const branches = nav.querySelectorAll(".pg:has(.chev)");
  for (const node of branches) node.classList.add("closed");
  nav.addEventListener("click", (e) => {
    const b = e.target.closest(".chev");
    if (b) {
      const closed = b.closest(".node").classList.toggle("closed");
      b.setAttribute("aria-expanded", String(!closed));
    }
  });
  function reveal() {
    for (const b of nav.querySelectorAll(".chev")) {
      if (b.closest(".node").querySelector("a.active"))
        b.closest(".node").classList.remove("closed");
      const expanded = !b.closest(".node").classList.contains("closed");
      b.setAttribute("aria-expanded", String(expanded));
    }
  }

  // Storage is optional in sandboxed viewers.
  function toggle(id, attr, value, labels, after) {
    const button = $(id);
    const initial = root.getAttribute(attr) === value;
    button.textContent = labels[initial ? 1 : 0];
    button.setAttribute("aria-pressed", String(initial));
    button.addEventListener("click", () => {
      const on = root.getAttribute(attr) !== value;
      if (on) root.setAttribute(attr, value);
      else root.removeAttribute(attr);
      button.textContent = labels[on ? 1 : 0];
      button.setAttribute("aria-pressed", String(on));
      if (after) after(on);
      saved[attr.slice(5)] = on;
      save();
    });
  }
  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (saved.width) root.dataset.width = "wide";
  if (saved.outline) root.dataset.outline = "off";
  scheme.content = root.dataset.mode === "dark" ? "dark" : "only light";
  toggle("t-outline", "data-outline", "off", ["Hide outline", "Show outline"]);
  toggle("t-width", "data-width", "wide", ["Wide", "Standard"]);
  toggle("t-mode", "data-mode", "dark", ["Dark", "Light"], (dark) => {
    scheme.content = dark ? "dark" : "only light";
    for (const sync of diagramModes) sync();
  });

  function route() {
    let id = "";
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      // Malformed fragments fall back to the first page.
    }
    const restoring = !location.hash;
    if (restoring) id = saved.section || saved.page || "";
    const target =
      pages
        .flatMap((p) => [p, ...p.querySelectorAll("[id]")])
        .find((el) => id && el.id === id) || pages[0];
    const page = target.closest(".page");
    const notice = $("route-notice");
    notice.replaceChildren();
    notice.hidden =
      restoring || !id || target !== pages[0] || id === pages[0].id;
    if (!notice.hidden) {
      notice.append(
        document.createTextNode("The link #" + id + " was not found "),
      );
      const dismiss = document.createElement("button");
      dismiss.textContent = "Dismiss";
      dismiss.type = "button";
      dismiss.addEventListener("click", () => {
        notice.hidden = true;
      });
      notice.append(dismiss);
    }
    for (const p of pages) {
      p.hidden = p !== page;
      p.classList.toggle("active", p === page);
    }
    for (const a of navLinks)
      a.classList.toggle("active", a.getAttribute("href") === "#" + page.id);
    currentPage = page;
    reveal();
    locked = target.matches("h2, h3");
    mark(locked ? target.id : undefined);
    save();
    if (!locked) schedule();
    document.title = page.dataset.title + " · " + docTitle;
    page.querySelector("h1")?.focus({ preventScroll: true });
    if (target === page) scrollTo(0, 0);
    else target.scrollIntoView();
  }
  addEventListener("hashchange", route);
  route();
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (a && a.hash === location.hash) route();
  });

  // Search: sections are cut at h2/h3 and scanned with includes(); built on first use.
  let index;
  function buildIndex() {
    index = [];
    for (const page of pages) {
      let entry = { id: page.id, title: page.dataset.title, text: "" };
      for (const el of page.querySelector(".content").children) {
        if (/^H[23]$/.test(el.tagName)) {
          index.push(entry);
          entry = {
            id: el.id,
            title: page.dataset.title + " › " + el.textContent,
            text: "",
          };
        } else if (!el.matches(".pager")) {
          const copy = el.cloneNode(true);
          copy
            .querySelectorAll(".bar, .stage")
            .forEach((node) => node.remove());
          entry.text += " " + copy.textContent;
        }
      }
      index.push(entry);
    }
    for (const e of index) e.lower = (e.title + " " + e.text).toLowerCase();
  }
  const escapeHtml = (s) =>
    s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  q.addEventListener("input", () => {
    const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    nav.hidden = terms.length > 0;
    results.hidden = terms.length === 0;
    if (terms.length === 0) return;
    if (!index) buildIndex();
    const hits = index
      .filter((e) => terms.every((t) => e.lower.includes(t)))
      .slice(0, 20);
    results.innerHTML =
      hits.length === 0
        ? "<li>No matches</li>"
        : hits
            .map((e) => {
              const at = Math.max(
                0,
                e.text.toLowerCase().indexOf(terms[0]) - 30,
              );
              const raw = e.text.slice(at, at + 110).trim();
              const pattern = new RegExp(
                terms[0].replace(/[.*+?^$(){}|[\]\\]/g, "\\$&"),
                "ig",
              );
              let end = 0;
              let snippet = "";
              for (const match of raw.matchAll(pattern)) {
                snippet +=
                  escapeHtml(raw.slice(end, match.index)) +
                  "<mark>" +
                  escapeHtml(match[0]) +
                  "</mark>";
                end = match.index + match[0].length;
              }
              snippet += escapeHtml(raw.slice(end));
              return (
                '<li><a href="#' +
                e.id +
                '">' +
                escapeHtml(e.title) +
                "<small>" +
                snippet +
                "</small></a></li>"
              );
            })
            .join("");
  });
  addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== q) {
      e.preventDefault();
      q.focus();
    }
    if (e.key === "Escape") {
      q.value = "";
      q.dispatchEvent(new Event("input"));
      q.blur();
    }
  });

  // Viewer for diagrams and images. The percentage is relative to the natural size (what d2 drew, or the image's
  // pixels); a fitted one never goes above 100%.
  // Inline, "fitted" is plain CSS (the frame's width). In fullscreen it also has to fit the height, so it is computed.
  const natural = (el) =>
    el.viewBox
      ? el.viewBox.baseVal
      : { width: el.naturalWidth, height: el.naturalHeight };
  function control(bar, stage, fitHeight) {
    const pct = bar.querySelector(".pct");
    const c = { el: null, zoom: null };
    const scale = () =>
      c.el.getBoundingClientRect().width / natural(c.el).width;
    c.draw = () => {
      if (!c.el || !stage.clientWidth || !natural(c.el).width) return;
      const box = natural(c.el);
      let zoom = c.zoom;
      const pad = 2 * parseFloat(getComputedStyle(stage).paddingLeft);
      if (zoom === null && fitHeight)
        zoom = Math.min(
          1,
          (stage.clientWidth - pad) / box.width,
          (stage.clientHeight - pad) / box.height,
        );
      c.el.style.maxWidth = zoom === null ? box.width + "px" : "none";
      c.el.style.width = zoom === null ? "" : box.width * zoom + "px";
      pct.textContent = Math.round(scale() * 100) + "%";
    };
    c.step = (direction) => {
      const quarters = scale() * 4;
      // Inline, keep the frame at its fitted height so the page does not jump; the diagram scrolls inside it.
      if (c.zoom === null && !fitHeight)
        stage.style.height = stage.offsetHeight + "px";
      const next =
        direction > 0
          ? Math.floor(quarters + 0.01) + 1
          : Math.ceil(quarters - 0.01) - 1;
      c.zoom = Math.min(8, Math.max(0.25, next / 4));
      c.draw();
    };
    c.actual = () => {
      c.zoom = 1;
      c.draw();
    };
    c.reset = () => {
      c.zoom = null;
      if (!fitHeight) stage.style.height = "";
      c.draw();
      stage.scrollTo(0, 0);
    };
    bar.addEventListener("click", (e) => {
      const act = e.target.dataset.act;
      if (act === "in") c.step(1);
      else if (act === "out") c.step(-1);
      else if (act === "reset") c.reset();
      else if (act === "actual") c.actual();
    });
    new ResizeObserver(() => {
      if (c.zoom === null) c.draw();
    }).observe(stage);
    return c;
  }

  // Fullscreen is a <dialog>, not the Fullscreen API: the SharePoint viewer's sandbox does not allow that API.
  const viewer = document.querySelector("dialog#viewer");
  const viewerStage = viewer.querySelector(".stage");
  const full = control(viewer.querySelector(".bar"), viewerStage, true);
  const inline = [];
  const diagramModes = [];
  let afterClose = null;
  let trigger = null;
  let activeDiagram = null;
  function openFull(el, after) {
    full.el = el;
    full.zoom = null;
    afterClose = after;
    trigger = document.activeElement;
    viewerStage.append(el);
    viewer.showModal();
    viewer.querySelector("button").focus();
    full.draw();
  }
  function finishFull() {
    if (!afterClose) return;
    const el = full.el;
    full.el = null;
    const done = afterClose;
    afterClose = null;
    activeDiagram = null;
    done(el);
    trigger?.focus({ preventScroll: true });
  }
  viewer.addEventListener("keydown", (e) => {
    if (e.key === "+") full.step(1);
    else if (e.key === "-") full.step(-1);
    else if (e.key === "0") full.reset();
    else if (e.key === "1") full.actual();
    else return;
    e.preventDefault();
  });
  viewer.addEventListener("close", finishFull);
  viewer
    .querySelector('[data-act="close"]')
    .addEventListener("click", () => viewer.close());

  for (const figure of document.querySelectorAll(".diagram")) {
    figure.tabIndex = 0;
    const stage = figure.querySelector(".stage");
    const c = control(figure.querySelector(".bar"), stage, false);
    const variants = [...stage.querySelectorAll(":scope > svg")];
    const current = () =>
      variants.find(
        (svg) =>
          svg.dataset.variant ===
          (root.dataset.mode === "dark" ? "dark" : "light"),
      );
    c.el = current();
    inline.push(c);
    const sync = () => {
      if (activeDiagram === sync) {
        stage.append(full.el);
        full.el = current();
        viewerStage.append(full.el);
        full.zoom = null;
        full.draw();
      } else {
        c.el = current();
        c.reset();
      }
    };
    diagramModes.push(sync);
    const enter = () => {
      const svg = c.el;
      c.reset();
      stage.style.height = stage.offsetHeight + "px"; // hold the gap while the diagram is away
      c.el = null;
      // The diagram itself moves: a copy would repeat every id inside the SVG.
      activeDiagram = sync;
      openFull(svg, (returned) => {
        stage.append(returned);
        c.el = current();
        c.reset();
      });
    };
    figure.querySelector('[data-act="full"]').addEventListener("click", enter);
    stage.addEventListener("click", (e) => {
      if (e.target.closest("svg")) {
        figure.focus({ preventScroll: true });
        enter();
      }
    });
  }
  for (const figure of document.querySelectorAll(".image-figure")) {
    const stage = figure.querySelector(".stage");
    const img = stage.querySelector("img");
    const c = control(figure.querySelector(".bar"), stage, false);
    c.el = img;
    inline.push(c);
    img.addEventListener("load", c.draw);
    c.draw();
    const enter = () => {
      const copy = img.cloneNode();
      copy.addEventListener("load", () => full.draw());
      openFull(copy, () => copy.remove());
    };
    figure.querySelector('[data-act="full"]').addEventListener("click", enter);
    img.addEventListener("click", () => {
      figure.focus({ preventScroll: true });
      enter();
    });
  }
  addEventListener("keydown", (e) => {
    if (
      e.target.matches("figure.diagram, figure.image-figure") &&
      (e.key === "Enter" || e.key.toLowerCase() === "f")
    ) {
      e.preventDefault();
      e.target.querySelector('[data-act="full"]').click();
    }
  });

  // Paper is light and fitted, whatever the screen shows.
  let wasDark = false;
  addEventListener("beforeprint", () => {
    if (viewer.open) {
      viewer.close();
      finishFull();
    }
    wasDark = root.dataset.mode === "dark";
    if (wasDark) $("t-mode").click();
    for (const c of inline) c.reset();
  });
  addEventListener("afterprint", () => {
    if (wasDark) $("t-mode").click();
  });
  $("t-print").addEventListener("click", () => print());
})();
