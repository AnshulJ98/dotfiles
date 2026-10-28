#!/usr/bin/env node
// map.mjs: mechanical input for a module map (reading order, fan-in, exports, internals) for
// TypeScript, JavaScript and Python. Zero model tokens.
//
// Usage: node map.mjs <repo> <module-dir>    module-dir is relative to repo; prints to stdout.
//
// Edges come from ast-grep on PATH: static imports, re-exports, dynamic import(), require() and
// Python import/from. Relative specifiers, tsconfig/jsconfig `paths` aliases and Python imports
// from repo, repo/src and pyproject package-dir resolve; packages and built-ins are dropped.
// Exit 2 on a bad argument.
import { execFile, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const posix = path.posix;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__"]);
const JS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const LANGS = { ".ts": "TypeScript", ".tsx": "Tsx", ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".py": "Python" };
const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isPlainName = (s) => /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(s);
const collapse = (s) => s.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

function fail(message) {
  process.stderr.write(`map: ${message}\n`);
  process.exit(2);
}

function checkDir(p) {
  let st;
  try {
    st = fs.statSync(p);
  } catch {
    fail(`no such directory: ${p}`);
  }
  if (!st.isDirectory()) fail(`not a directory: ${p}`);
  return p;
}

function isSource(rel) {
  const parts = rel.split("/");
  const base = parts.at(-1);
  if (parts.slice(0, -1).some((p) => SKIP_DIRS.has(p)) || !LANGS[posix.extname(base)]) return false;
  return !(base.endsWith(".d.ts") || /\.(test|spec)\./.test(base) || base.endsWith("_test.py") || /^test_.*\.py$/.test(base));
}

// Repo-relative source paths, git's view when repo is a work tree root, a walk otherwise.
function listFiles(repo) {
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: repo, encoding: "utf8" });
  const isGit = top.status === 0 && fs.realpathSync(top.stdout.trim()) === fs.realpathSync(repo);
  const files = [];
  if (isGit) {
    const ls = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: repo, encoding: "utf8", maxBuffer: 1 << 30 });
    for (const f of ls.stdout.split("\0")) if (f && isSource(f) && fs.existsSync(path.join(repo, f))) files.push(f);
  } else {
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(repo, dir), { withFileTypes: true })) {
        const rel = dir ? `${dir}/${e.name}` : e.name;
        if (e.isDirectory() && !SKIP_DIRS.has(e.name)) walk(rel);
        else if (e.isFile() && isSource(rel)) files.push(rel);
      }
    };
    walk("");
  }
  const sha = isGit ? spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout?.trim() : "";
  return { files: [...new Set(files)].sort(byPath), sha: sha || "no-git" };
}

// --- ast-grep rules, as JSON (valid YAML) documents ---
const kinds = (...ks) => ks.map((kind) => ({ kind }));
const inExport = { kind: "export_statement", inside: { kind: "program" } };

function jsRules(lang) {
  const ts = lang !== "JavaScript";
  const decls = ["function_declaration", "generator_function_declaration", "class_declaration", ...(ts ? ["abstract_class_declaration"] : [])];
  const varDecl = { any: kinds("lexical_declaration", "variable_declaration"), inside: inExport };
  return {
    edges: {
      imp: { kind: "string", inside: { kind: "import_statement", field: "source" } },
      rex: { kind: "string", inside: { kind: "export_statement", field: "source" } },
      dyn: { pattern: "import($SRC)" },
      req: { pattern: "require($SRC)" },
    },
    detail: {
      exp: inExport,
      // Where an export's header ends: a declaration's body, an exported arrow's body, a const's value.
      cut: {
        any: kinds(...decls, "function_expression", "generator_function", "class", "arrow_function", ...(ts ? ["internal_module"] : [])),
        inside: inExport,
        has: { field: "body", pattern: "$B" },
      },
      arrow: { kind: "arrow_function", inside: { field: "value", kind: "variable_declarator", inside: varDecl }, has: { field: "body", pattern: "$B" } },
      value: { kind: "variable_declarator", inside: varDecl, has: { field: "value", pattern: "$B" } },
      top: { any: kinds(...decls), inside: { kind: "program" }, has: { field: "name", pattern: "$N" } },
      topvar: { kind: "variable_declarator", inside: { kind: "lexical_declaration", inside: { kind: "program" } }, has: { field: "name", pattern: "$N" } },
      call: { pattern: "$FN($$$)" },
    },
  };
}

const pyTop = { any: [{ kind: "module" }, { kind: "decorated_definition", inside: { kind: "module" } }] };
const RULES = {
  TypeScript: jsRules("TypeScript"),
  Tsx: jsRules("Tsx"),
  JavaScript: jsRules("JavaScript"),
  Python: {
    edges: { pyimp: { any: kinds("import_statement", "import_from_statement") } },
    detail: {
      pydef: {
        any: kinds("function_definition", "class_definition"),
        inside: pyTop,
        all: [{ has: { field: "name", pattern: "$N" } }, { has: { field: "body", pattern: "$B" } }],
      },
      all: {
        kind: "assignment",
        inside: { kind: "expression_statement", inside: { kind: "module" } },
        all: [{ has: { field: "left", regex: "^__all__$" } }, { has: { field: "right", pattern: "$V" } }],
      },
      call: { pattern: "$FN($$$)" },
    },
  },
};

const exec = promisify(execFile);
async function scan(repo, lang, rules, files) {
  if (files.length === 0) return [];
  const yaml = Object.entries(rules).map(([id, rule]) => JSON.stringify({ id, language: lang, rule })).join("\n---\n");
  // Every match carries its whole source line, so a minified bundle can emit megabytes per match:
  // chunk by source bytes to keep each JSON reply well under V8's string limit.
  const chunks = [[]];
  let bytes = 0;
  for (const f of files) {
    const size = fs.statSync(path.join(repo, f)).size;
    if (chunks.at(-1).length && (bytes + size > 4e6 || chunks.at(-1).length >= 1000)) {
      chunks.push([]);
      bytes = 0;
    }
    chunks.at(-1).push(f);
    bytes += size;
  }
  const outs = await Promise.all(
    chunks.map((c) =>
      exec("ast-grep", ["scan", "--inline-rules", yaml, "--json=compact", "--", ...c], { cwd: repo, maxBuffer: 1 << 29 }).then(({ stdout }) =>
        JSON.parse(stdout || "[]").map(slim),
      ),
    ),
  );
  return outs.flat();
}
function slim(m) {
  return {
    rule: m.ruleId,
    file: posix.normalize(m.file),
    text: m.text,
    start: m.range.byteOffset.start,
    end: m.range.byteOffset.end,
    lines: m.range.end.line - m.range.start.line + 1,
    mv: m.metaVariables?.single ?? {},
  };
}
const at = (mv) => mv.range.byteOffset.start;

// --- resolution ---
function stripJsonc(s) {
  let out = "";
  for (let i = 0; i < s.length; ) {
    if (s[i] === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += s[j] === "\\" ? 2 : 1;
      out += s.slice(i, j + 1);
      i = j + 1;
    } else if (s.startsWith("//", i)) {
      while (i < s.length && s[i] !== "\n") i++;
    } else if (s.startsWith("/*", i)) {
      const e = s.indexOf("*/", i + 2);
      i = e < 0 ? s.length : e + 2;
    } else out += s[i++];
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

function makeResolver(repo, known) {
  const readJson = (rel) => {
    try {
      return JSON.parse(stripJsonc(fs.readFileSync(path.join(repo, rel), "utf8")));
    } catch {
      return null;
    }
  };
  const inRepo = (p) => p && !p.startsWith("../") && p !== ".." && !path.isAbsolute(p);

  // `paths` of one config plus one level of in-repo `extends`, with the dir they resolve against.
  function loadAliases(rel) {
    const cfg = readJson(rel);
    if (!cfg) return null;
    const dir = posix.dirname(rel);
    const opts = cfg.compilerOptions ?? {};
    let base = typeof opts.baseUrl === "string" ? posix.join(dir, opts.baseUrl) : undefined;
    let paths = opts.paths;
    let pathsDir = dir;
    if (typeof cfg.extends === "string" && (cfg.extends.startsWith(".") || path.isAbsolute(cfg.extends))) {
      let ext = path.relative(repo, path.resolve(repo, dir, cfg.extends)).split(path.sep).join("/");
      if (!ext.endsWith(".json")) ext += ".json";
      const parent = inRepo(ext) ? readJson(ext) : null;
      const popts = parent?.compilerOptions ?? {};
      const pdir = posix.dirname(ext);
      if (base === undefined && typeof popts.baseUrl === "string") base = posix.join(pdir, popts.baseUrl);
      if (paths === undefined && popts.paths) [paths, pathsDir] = [popts.paths, pdir];
    }
    return paths && typeof paths === "object" ? { paths, root: base ?? pathsDir } : null;
  }

  const configs = new Map();
  function aliasesFor(file) {
    const seen = [];
    let dir = posix.dirname(file);
    let found = null;
    for (;;) {
      if (configs.has(dir)) {
        found = configs.get(dir);
        break;
      }
      seen.push(dir);
      const cfg = ["tsconfig.json", "jsconfig.json"].map((n) => posix.join(dir, n)).find((f) => fs.existsSync(path.join(repo, f)));
      if (cfg) {
        found = loadAliases(cfg);
        break;
      }
      if (dir === ".") break;
      dir = posix.dirname(dir);
    }
    for (const d of seen) configs.set(d, found);
    return found;
  }

  function aliasTargets(alias, spec) {
    let best = null;
    for (const [key, targets] of Object.entries(alias.paths)) {
      if (!Array.isArray(targets)) continue;
      const star = key.indexOf("*");
      if (star < 0) {
        if (key === spec) return targets.map((t) => posix.join(alias.root, t));
        continue;
      }
      const [pre, suf] = [key.slice(0, star), key.slice(star + 1)];
      if (spec.length >= pre.length + suf.length && spec.startsWith(pre) && spec.endsWith(suf) && (!best || pre.length > best.pre.length)) {
        best = { pre, targets, mid: spec.slice(pre.length, spec.length - suf.length) };
      }
    }
    return best ? best.targets.map((t) => posix.join(alias.root, String(t).replace("*", best.mid))) : [];
  }

  function relative(p) {
    const cands = [];
    const twin = /\.(js|jsx|mjs|cjs)$/.exec(p);
    if (twin) cands.push(`${p.slice(0, -twin[0].length)}.ts`, `${p.slice(0, -twin[0].length)}.tsx`);
    cands.push(p, ...JS_EXTS.map((e) => p + e), ...JS_EXTS.map((e) => `${p}/index${e}`));
    return cands.find((c) => known.has(c)) ?? null;
  }

  function js(file, spec) {
    if (/^\.\.?(\/|$)/.test(spec)) return [relative(posix.join(posix.dirname(file), spec))];
    const alias = aliasesFor(file);
    for (const target of alias ? aliasTargets(alias, spec) : []) {
      const hit = relative(target);
      if (hit) return [hit];
    }
    return [];
  }

  const roots = [".", "src", ...pyprojectDirs(repo)];
  const first = (cands) => cands.find((c) => known.has(c));
  function py(file, text) {
    const t = text.replace(/\\\n/g, " ").replace(/#[^\n]*/g, "").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
    const names = (list) => list.split(",").map((s) => s.trim().split(" ")[0]).filter((n) => n && n !== "*");
    const from = /^from (\.*)([\p{L}\p{N}_.]*) import (.+)$/u.exec(t);
    if (!from) {
      const mods = names(t.replace(/^import /, "")).map((m) => m.replace(/\./g, "/"));
      return mods.map((m) => roots.map((r) => first([posix.join(r, `${m}.py`), posix.join(r, m, "__init__.py")])).find(Boolean));
    }
    const [, dots, mod, list] = from;
    const bases = dots ? [posix.join(posix.dirname(file), ...Array(dots.length - 1).fill(".."))] : roots;
    for (const base of bases) {
      const dir = posix.join(base, mod.replace(/\./g, "/"));
      const pkg = first([...(mod ? [`${dir}.py`] : []), posix.join(dir, "__init__.py")]);
      const hits = names(list).map((n) => first([posix.join(dir, `${n}.py`), posix.join(dir, n, "__init__.py")]) ?? pkg);
      if (pkg || hits.some(Boolean)) return hits.length ? hits : [pkg];
    }
    return [];
  }
  return { js, py };
}

// `[tool.setuptools] package-dir` when it is a one-line inline table or its own table; else none.
function pyprojectDirs(repo) {
  let text;
  try {
    text = fs.readFileSync(path.join(repo, "pyproject.toml"), "utf8");
  } catch {
    return [];
  }
  let section = "";
  let body = "";
  for (const line of text.split("\n")) {
    const head = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (head) section = head[1].trim();
    else if (section === "tool.setuptools") body += /^\s*package-dir\s*=\s*\{(.*)\}\s*$/.exec(line)?.[1] ?? "";
    else if (section === "tool.setuptools.package-dir") body += `${line}\n`;
  }
  return [...body.matchAll(/["'][^"']*["']\s*=\s*["']([^"']+)["']/g)].map((m) => posix.normalize(m[1]));
}

// --- per-file exports and internals ---
function jsDetail(ms) {
  const exps = ms.filter((m) => m.rule === "exp").sort((a, b) => a.start - b.start);
  const local = new Set();
  const exports = exps.map((e) => {
    const list = /^export\s+(?:type\s+)?\{([^}]*)\}\s*;?$/.exec(e.text);
    for (const part of list?.[1].split(",") ?? []) local.add(part.trim().replace(/^type\s+/, "").split(/\s+/)[0]);
    const cuts = [];
    for (const m of ms) {
      if (m.start < e.start || m.end > e.end) continue;
      if (m.rule === "cut") cuts.push(at(m.mv.B));
      if (m.rule === "value") {
        const arrow = ms.find((a) => a.rule === "arrow" && a.start === at(m.mv.B));
        cuts.push(arrow ? at(arrow.mv.B) : at(m.mv.B));
      }
    }
    if (cuts.length === 0) {
      const whole = e.text.trimEnd().replace(/;$/, "");
      const dflt = /^export\s+default\s+([\s\S]*)$/.exec(whole)?.[1].trim();
      if (dflt !== undefined && isPlainName(dflt)) local.add(dflt);
      return dflt === undefined || isPlainName(dflt) || /^interface\b/.test(dflt) ? whole : "export default";
    }
    const head = Buffer.from(e.text).subarray(0, Math.min(...cuts) - e.start).toString();
    return collapse(head.replace(/\s*(=>|=)\s*$/, ""));
  });
  const internals = ms
    .filter((m) => (m.rule === "top" || m.rule === "topvar") && isPlainName(m.mv.N.text) && !local.has(m.mv.N.text))
    .map((m) => ({ name: m.mv.N.text, lines: m.lines }));
  return { exports, internals };
}

function pyDetail(ms) {
  const v = ms.filter((m) => m.rule === "all").at(-1)?.mv.V?.text;
  const all = v?.startsWith("[") ? new Set([...v.matchAll(/(["'])(.*?)\1/g)].map((x) => x[2])) : null;
  const defs = ms
    .filter((m) => m.rule === "pydef")
    .sort((a, b) => a.start - b.start)
    .map((m) => {
      const head = Buffer.from(m.text).subarray(0, at(m.mv.B) - m.start).toString();
      const name = m.mv.N.text;
      return { name, lines: m.lines, header: collapse(head.trimEnd().replace(/:\s*#[^\n]*$/, ":").replace(/:$/, "")), exported: all ? all.has(name) : !name.startsWith("_") };
    });
  return { exports: defs.filter((d) => d.exported).map((d) => d.header), internals: defs.filter((d) => !d.exported) };
}

// Strongly connected components (Tarjan), each sorted by path.
function components(nodes, deps) {
  let next = 0;
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const out = [];
  const visit = (v) => {
    index.set(v, next);
    low.set(v, next++);
    stack.push(v);
    onStack.add(v);
    for (const w of deps.get(v)) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) !== index.get(v)) return;
    const comp = [];
    let w;
    do {
      w = stack.pop();
      onStack.delete(w);
      comp.push(w);
    } while (w !== v);
    out.push(comp.sort(byPath));
  };
  for (const v of nodes) if (!index.has(v)) visit(v);
  return out;
}

// Kahn over the condensation: a component is ready once everything it imports is placed.
function readingOrder(files, deps) {
  const comps = components(files, deps);
  const compOf = new Map(comps.flatMap((c, i) => c.map((f) => [f, i])));
  const pending = comps.map(() => 0);
  const dependents = comps.map(() => []);
  comps.forEach((c, i) => {
    const needs = new Set(c.flatMap((f) => deps.get(f).map((g) => compOf.get(g))).filter((j) => j !== i));
    pending[i] = needs.size;
    for (const j of needs) dependents[j].push(i);
  });
  const ready = comps.map((_, i) => i).filter((i) => pending[i] === 0);
  const order = [];
  while (ready.length) {
    ready.sort((a, b) => byPath(comps[a][0], comps[b][0]));
    const i = ready.shift();
    order.push(...comps[i]);
    for (const j of dependents[i]) if (--pending[j] === 0) ready.push(j);
  }
  return { order, cycles: comps.filter((c) => c.length > 1).sort((a, b) => byPath(a[0], b[0])) };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) fail("usage: node map.mjs <repo> <module-dir>");
  const repo = checkDir(path.resolve(args[0]));
  const moduleDir = path.relative(repo, checkDir(path.resolve(repo, args[1]))).split(path.sep).join("/") || ".";
  if (moduleDir === ".." || moduleDir.startsWith("../") || path.isAbsolute(moduleDir)) fail(`not inside ${repo}: ${args[1]}`);
  if (spawnSync("ast-grep", ["--version"]).error) fail("ast-grep not found on PATH (brew install ast-grep)");

  const { files, sha } = listFiles(repo);
  const inModule = (f) => moduleDir === "." || f.startsWith(`${moduleDir}/`);
  const moduleFiles = files.filter(inModule);
  const langOf = (f) => LANGS[posix.extname(f)];
  const ofLang = (list, lang) => list.filter((f) => langOf(f) === lang);
  const langs = Object.keys(RULES);
  const [edgeMatches, detailMatches] = await Promise.all(
    ["edges", "detail"].map(async (kind) =>
      (await Promise.all(langs.map((l) => scan(repo, l, RULES[l][kind], ofLang(kind === "edges" ? files : moduleFiles, l))))).flat(),
    ),
  );

  // Edges: importer -> imported -> kinds. A file importing itself is not an edge.
  const resolve = makeResolver(repo, new Set(files));
  const edges = new Map(files.map((f) => [f, new Map()]));
  for (const m of edgeMatches) {
    let targets;
    if (m.rule === "pyimp") targets = resolve.py(m.file, m.text);
    else {
      const lit = m.rule === "imp" || m.rule === "rex" ? m.text : m.mv.SRC?.text;
      targets = lit && /^["']/.test(lit) ? resolve.js(m.file, lit.slice(1, -1)) : [];
    }
    for (const to of targets) {
      if (!to || to === m.file) continue;
      const kindsSeen = edges.get(m.file).get(to) ?? new Set();
      edges.get(m.file).set(to, kindsSeen.add(m.rule));
    }
  }
  const importers = new Map();
  const reexporters = new Map();
  let edgeCount = 0;
  for (const [from, tos] of edges) {
    for (const [to, ks] of tos) {
      edgeCount++;
      importers.set(to, [...(importers.get(to) ?? []), from]);
      if (ks.has("rex")) reexporters.set(to, [...(reexporters.get(to) ?? []), from]);
    }
  }

  // Fan-in: direct importers, then importers of any barrel that re-exports the file (nested too).
  function fanIn(file) {
    const direct = [...(importers.get(file) ?? [])].sort(byPath);
    const listed = new Set([file, ...direct]);
    const seen = new Set([file]);
    const via = [];
    let frontier = [...(reexporters.get(file) ?? [])].sort(byPath);
    while (frontier.length) {
      const next = [];
      for (const barrel of frontier) {
        if (seen.has(barrel)) continue;
        seen.add(barrel);
        for (const imp of [...(importers.get(barrel) ?? [])].sort(byPath)) {
          if (!listed.has(imp)) via.push([imp, barrel]);
          listed.add(imp);
        }
        next.push(...(reexporters.get(barrel) ?? []));
      }
      frontier = next.sort(byPath);
    }
    via.sort((a, b) => byPath(a[0], b[0]));
    return [...direct, ...via.map(([imp, barrel]) => `${imp} (via ${barrel})`)];
  }

  const deps = new Map(moduleFiles.map((f) => [f, [...edges.get(f).keys()].filter(inModule)]));
  const { order, cycles } = readingOrder(moduleFiles, deps);

  const byFile = new Map(moduleFiles.map((f) => [f, []]));
  for (const m of detailMatches) byFile.get(m.file)?.push(m);
  const calls = { js: new Map(), py: new Map() };
  for (const m of detailMatches) {
    const name = m.rule === "call" ? m.mv.FN?.text : undefined;
    const family = calls[langOf(m.file) === "Python" ? "py" : "js"];
    if (name && isPlainName(name)) family.set(name, (family.get(name) ?? 0) + 1);
  }

  const now = new Date();
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  const out = [
    `# ${moduleDir} map input`,
    "",
    `Generated ${today} at ${sha}. ${moduleFiles.length} files in the module, ${edgeCount} edges repo-wide. Edges: static, dynamic, require, re-export (JS/TS, aliases from tsconfig/jsconfig paths) and import/from (Python).`,
    "",
    "## Reading order (leaves first)",
    "",
    ...order.map((f, i) => `${i + 1}. ${f}`),
  ];
  if (cycles.length) out.push("", "Cycles:", ...cycles.map((c) => `- ${[...c, c[0]].join(" -> ")}`));

  out.push("", "## Fan-in", "", "| file | in | imported by |", "|---|---|---|");
  const rows = moduleFiles.map((f) => ({ f, by: fanIn(f) })).sort((a, b) => b.by.length - a.by.length || byPath(a.f, b.f));
  for (const { f, by } of rows) out.push(`| ${f} | ${by.length} | ${by.length ? by.join(", ") : "entry or unused"} |`);

  out.push("", "## Exports");
  const internals = [];
  for (const f of order) {
    const isPy = langOf(f) === "Python";
    const detail = (isPy ? pyDetail : jsDetail)(byFile.get(f));
    const family = calls[isPy ? "py" : "js"];
    for (const d of detail.internals) internals.push({ ...d, file: f, calls: family.get(d.name) ?? 0 });
    const none = isPy ? "# no exports" : "// no exports";
    out.push("", `### ${f}`, "", isPy ? "```py" : "```ts", ...(detail.exports.length ? detail.exports : [none]), "```");
  }

  out.push(
    "",
    "## Internals",
    "",
    "_Top-level functions and consts the module does not export: candidates for where to start reading, not a judgment of what matters. Calls are in-module call sites; a function called once can still carry everything, so length is listed too._",
    "",
    "| internal | file | calls | lines |",
    "|---|---|---|---|",
  );
  internals.sort((a, b) => b.calls - a.calls || b.lines - a.lines || byPath(a.file, b.file) || byPath(a.name, b.name));
  for (const r of internals) out.push(`| ${r.name} | ${r.file} | ${r.calls} | ${r.lines} |`);
  if (internals.length === 0) out.push("| (none) | | | |");
  process.stdout.write(`${out.join("\n")}\n`);
}

main().catch((err) => {
  process.stderr.write(`map: ${(err.stderr || err.message || String(err)).trim()}\n`);
  process.exit(1);
});
