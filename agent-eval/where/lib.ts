// lib.ts: pure helpers for the /where spikes: parse a card, score run-to-run stability and anchoring, cut and splice sessions.
// No I/O here; run.ts owns files, pi and the clock.

export const RUNGS = ["target", "higher", "beyond", "slice", "this"] as const;
export type Rung = (typeof RUNGS)[number];
export const MARKS = ["✓", "?", "▸", "☐"] as const;
export type Mark = (typeof MARKS)[number];
const GROUPS = ["needs you", "I do next", "waiting"] as const;

export interface Check {
  rung: Rung;
  mark: Mark;
  text: string;
  right: string;
}
export interface Action {
  n: number;
  group: string;
  text: string;
}
export interface Card {
  rungs: { rung: Rung; text: string }[];
  checks: Check[];
  actions: Action[];
  rows: number;
  longRows: number;
  outside: number; // non-empty lines outside the code block
  openWithoutAction: number; // ☐ or ▸ checks whose right column names no action number
  parsed: boolean; // a code block with at least one rung
}

const width = (s: string) => [...s].length;
const cols = (s: string) => s.trim().split(/\s{2,}/);

export function parseCard(reply: string): Card {
  const lines = reply.split("\n");
  const open = lines.findIndex((l) => l.trim().startsWith("```"));
  const close =
    open < 0
      ? -1
      : lines.findIndex((l, i) => i > open && l.trim().startsWith("```"));
  const body =
    open < 0 ? [] : lines.slice(open + 1, close < 0 ? undefined : close);
  const outside = lines.filter(
    (l, i) => l.trim() && (i < open || (close >= 0 && i > close) || open < 0),
  ).length;
  const card: Card = {
    rungs: [],
    checks: [],
    actions: [],
    rows: body.filter((l) => l.trim()).length,
    longRows: body.filter((l) => width(l) > 100).length,
    outside,
    openWithoutAction: 0,
    parsed: false,
  };
  let rung: Rung | null = null;
  let group = "";
  for (const line of body) {
    if (!line.trim()) continue;
    const r = line.match(
      /^(target|higher|beyond|slice|this)\s+\S\s+(.+?)(?:,\s*done when:?)?\s*$/,
    );
    if (r) {
      rung = r[1] as Rung;
      card.rungs.push({ rung, text: r[2].trim() });
      continue;
    }
    const g = GROUPS.find((x) => line.startsWith(x));
    const rest = g ? line.slice(g.length) : line;
    const a = rest.match(/^\s*(\d+)\s+(?:●\s+)?(.+)$/);
    if (a && (g || group) && !/^\s{6,}[✓?▸☐]/.test(line)) {
      if (g) group = g;
      card.actions.push({ n: Number(a[1]), group, text: cols(a[2])[0] });
      continue;
    }
    const c = line.match(/^\s+([✓?▸☐])\s+(.+)$/);
    if (c && rung && !group) {
      const [text, ...right] = cols(c[2]);
      const check: Check = {
        rung,
        mark: c[1] as Mark,
        text,
        right: right.join(" "),
      };
      card.checks.push(check);
      if ((check.mark === "☐" || check.mark === "▸") && !/\d/.test(check.right))
        card.openWithoutAction++;
      continue;
    }
    if (/^(ideas|reply)\b/.test(line)) group = group || "tail";
  }
  card.parsed = card.rungs.length > 0;
  return card;
}

export function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3),
  );
}
export function jaccard(a: string, b: string): number {
  const x = words(a),
    y = words(b);
  if (!x.size && !y.size) return 1;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/** Greedy best match of items in a to items in b by text similarity, at or above min. */
export function matchByText<T extends { text: string }>(
  a: T[],
  b: T[],
  min = 0.5,
): [T, T, number][] {
  const pairs: [number, number, number][] = [];
  a.forEach((x, i) =>
    b.forEach((y, j) => {
      const s = jaccard(x.text, y.text);
      if (s >= min) pairs.push([i, j, s]);
    }),
  );
  pairs.sort((p, q) => q[2] - p[2]);
  const ua = new Set<number>(),
    ub = new Set<number>(),
    out: [T, T, number][] = [];
  for (const [i, j, s] of pairs)
    if (!ua.has(i) && !ub.has(j)) {
      ua.add(i);
      ub.add(j);
      out.push([a[i], b[j], s]);
    }
  return out;
}
/** Mean over items of each side of its best similarity on the other side (0 when one side is empty and the other not). */
export function setSimilarity(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const best = (xs: string[], ys: string[]) =>
    xs.reduce((s, x) => s + Math.max(...ys.map((y) => jaccard(x, y))), 0) /
    xs.length;
  return (best(a, b) + best(b, a)) / 2;
}
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
const round = (x: number) =>
  Number.isNaN(x) ? null : Math.round(x * 100) / 100;

export interface PairScore {
  sameRungs: boolean;
  rungSim: number;
  checkSim: number;
  markAgree: number;
  actionSim: number;
  numberAgree: number;
}

/** How much card b repeats card a: rung labels, rung wording, checks, marks on matched checks, actions, numbers on matched actions. */
export function comparePair(a: Card, b: Card): PairScore {
  const la = a.rungs.map((r) => r.rung).join(","),
    lb = b.rungs.map((r) => r.rung).join(",");
  const common = a.rungs.filter((r) => b.rungs.some((s) => s.rung === r.rung));
  const mc = matchByText(a.checks, b.checks);
  const ma = matchByText(a.actions, b.actions);
  return {
    sameRungs: la === lb,
    rungSim: mean(
      common.map((r) =>
        jaccard(r.text, b.rungs.find((s) => s.rung === r.rung)!.text),
      ),
    ),
    checkSim: setSimilarity(
      a.checks.map((c) => c.text),
      b.checks.map((c) => c.text),
    ),
    markAgree: mean(mc.map(([x, y]) => (x.mark === y.mark ? 1 : 0))),
    actionSim: setSimilarity(
      a.actions.map((c) => c.text),
      b.actions.map((c) => c.text),
    ),
    numberAgree: mean(ma.map(([x, y]) => (x.n === y.n ? 1 : 0))),
  };
}

export interface Stability {
  runs: number;
  parsed: number;
  sameRungs: number | null;
  rungSim: number | null;
  checkSim: number | null;
  markAgree: number | null;
  actionSim: number | null;
  numberAgree: number | null;
  checks: number[];
  actions: number[];
  longRows: number[];
  rows: number[];
  outside: number[];
  openWithoutAction: number[];
}

/** Run-to-run agreement over every pair of k cards for the same input. */
export function stability(cards: Card[]): Stability {
  const ok = cards.filter((c) => c.parsed);
  const pairs: PairScore[] = [];
  for (let i = 0; i < ok.length; i++)
    for (let j = i + 1; j < ok.length; j++)
      pairs.push(comparePair(ok[i], ok[j]));
  const m = (k: keyof PairScore) =>
    round(mean(pairs.map((p) => Number(p[k])).filter((x) => !Number.isNaN(x))));
  return {
    runs: cards.length,
    parsed: ok.length,
    sameRungs: m("sameRungs"),
    rungSim: m("rungSim"),
    checkSim: m("checkSim"),
    markAgree: m("markAgree"),
    actionSim: m("actionSim"),
    numberAgree: m("numberAgree"),
    checks: cards.map((c) => c.checks.length),
    actions: cards.map((c) => c.actions.length),
    longRows: cards.map((c) => c.longRows),
    rows: cards.map((c) => c.rows),
    outside: cards.map((c) => c.outside),
    openWithoutAction: cards.map((c) => c.openWithoutAction),
  };
}

// ---- sessions (pi session JSONL v3: one entry per line, id/parentId tree, leaf = last line)

interface EntryHead {
  type?: string;
  id?: string;
  parentId?: string | null;
  message?: { role?: string };
}
const head = (line: string) => JSON.parse(line) as EntryHead;

export interface Turn {
  line: number;
  kind: "user" | "compaction";
}
/** Line indexes (0-based) of user messages and compactions. */
export function turns(lines: string[]): Turn[] {
  const out: Turn[] = [];
  lines.forEach((l, i) => {
    if (!l.trim()) return;
    const e = head(l);
    if (e.type === "compaction") out.push({ line: i, kind: "compaction" });
    else if (e.type === "message" && e.message?.role === "user")
      out.push({ line: i, kind: "user" });
  });
  return out;
}

export interface Cuts {
  compaction: number;
  aCross: number;
  aSame: number;
  b: number;
}
/** Cut points (a line count to keep) around the first compaction with at least 3 user turns before and 5 after:
 *  aCross = before the 2nd-last user turn ahead of it, aSame = before the 2nd user turn after it, b = before the 5th after it. */
export function pickCuts(lines: string[]): Cuts | null {
  const t = turns(lines);
  for (let k = 0; k < t.length; k++) {
    if (t[k].kind !== "compaction") continue;
    const before = t.slice(0, k).filter((x) => x.kind === "user");
    const after: Turn[] = [];
    for (const x of t.slice(k + 1)) {
      if (x.kind === "compaction") break;
      after.push(x);
    }
    if (before.length >= 3 && after.length >= 5)
      return {
        compaction: t[k].line,
        aCross: before[before.length - 2].line,
        aSame: after[1].line,
        b: after[4].line,
      };
  }
  return null;
}

/** Splice: the session cut at a, then extra entries (a /where exchange appended there), then the original lines a..b
 *  with the first one re-parented onto the last extra entry, so the card sits on the active path. */
export function splice(
  lines: string[],
  a: number,
  b: number,
  extra: string[],
): string[] {
  if (!extra.length) return lines.slice(0, b);
  const lastId = head(extra[extra.length - 1]).id;
  const tail = lines.slice(a, b).map((l, i) => {
    if (i !== 0) return l;
    const e = JSON.parse(l) as Record<string, unknown>;
    return JSON.stringify({ ...e, parentId: lastId });
  });
  return [...lines.slice(0, a), ...extra, ...tail];
}

/** Plain text of the user and assistant messages in lines a..b, for the judge. */
export function transcript(
  lines: string[],
  a: number,
  b: number,
  max = 30000,
): string {
  const out: string[] = [];
  for (const l of lines.slice(a, b)) {
    if (!l.trim()) continue;
    const e = JSON.parse(l) as {
      type?: string;
      message?: { role?: string; content?: unknown };
    };
    if (
      e.type !== "message" ||
      (e.message?.role !== "user" && e.message?.role !== "assistant")
    )
      continue;
    const c = e.message.content;
    const text =
      typeof c === "string"
        ? c
        : Array.isArray(c)
          ? (c as { type?: string; text?: string }[])
              .filter((x) => x.type === "text")
              .map((x) => x.text ?? "")
              .join("\n")
          : "";
    if (text.trim())
      out.push(
        (e.message.role === "user" ? "USER: " : "ASSISTANT: ") + text.trim(),
      );
  }
  const all = out.join("\n\n");
  return all.length <= max
    ? all
    : all.slice(0, max / 3) +
        "\n[...cut...]\n" +
        all.slice(all.length - (2 * max) / 3);
}
