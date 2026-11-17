/**
 * /where card: the pure core. The model fills a structured card through the
 * where_card tool; this module checks it, lays it out, and builds the prompt.
 * No I/O: extensions/where.ts gathers git output, session entries and file
 * checks and passes them in.
 *
 * Why code does the layout: on real sessions (agent-eval/where, w1) 11 of 12
 * free-text cards had rows over 100 characters, and invented proof (shas, ids,
 * paths) was the main error, so a ✓ is kept only when its proof is found in
 * what this module was given.
 */

export const LEVELS = ["target", "higher", "beyond", "slice", "this"] as const;
export type Level = (typeof LEVELS)[number];
export const CHECK_STATES = ["done", "reported", "doing", "open"] as const;
export type CheckState = (typeof CHECK_STATES)[number];
export const GROUPS = ["needs you", "I do next", "waiting"] as const;
export type Group = (typeof GROUPS)[number];

export interface Check {
  state: CheckState;
  text: string;
  /** done: one sha, path, test output or memory id */
  proof?: string;
  /** reported: where it was reported */
  where?: string;
  /** doing/open: numbers of the actions that close it */
  actions?: number[];
}
export interface Rung {
  level: Level;
  outcome: string;
  checks: Check[];
}
export interface Action {
  n: number;
  group: Group;
  text: string;
  options?: string[];
  pick?: string;
  needs?: string;
  until?: string;
}
export interface Card {
  rungs: Rung[];
  actions: Action[];
  ideas?: string;
  reply?: string;
}
export interface Brief {
  subject: string;
  what: string;
  where: string;
  why: string;
  how: string;
  effort: string;
  impact: string;
  pick: string;
  context: string;
}

export const WIDTH = 100;
export const MAX_ROWS = 30;
const MAX_CHECKS = 5;
const MAX_ACTIONS = 9;
const RUNG_MARK: Record<Level, string> = {
  target: "◇",
  higher: "○",
  beyond: "▸",
  slice: "▸",
  this: "●",
};
const CHECK_MARK: Record<CheckState, string> = {
  done: "✓",
  reported: "?",
  doing: "▸",
  open: "☐",
};

/** Every rule a card breaks, as messages the model can act on; empty when the card is valid. */
export function validateCard(card: Card): string[] {
  const errs: string[] = [];
  const levels = card.rungs.map((r) => r.level);
  if (levels[0] !== "target") errs.push("the first rung must be target");
  levels.forEach((l, i) => {
    if (levels.indexOf(l) !== i) errs.push(`rung ${l} appears twice`);
    if (i > 0 && LEVELS.indexOf(l) <= LEVELS.indexOf(levels[i - 1]))
      errs.push(`rungs must go ${LEVELS.join(", ")} in that order`);
  });
  const numbers = new Set(card.actions.map((a) => a.n));
  if (numbers.size !== card.actions.length)
    errs.push("two actions share a number");
  if (card.actions.length > MAX_ACTIONS)
    errs.push(`at most ${MAX_ACTIONS} actions`);
  const referenced = new Set<number>();
  for (const r of card.rungs) {
    if (!r.checks.length)
      errs.push(
        `rung ${r.level} has no check; use "done-when not agreed" as an open check`,
      );
    if (r.checks.length > MAX_CHECKS)
      errs.push(`rung ${r.level} has more than ${MAX_CHECKS} checks`);
    for (const c of r.checks) {
      const name = `${r.level} check "${c.text}"`;
      if (c.state === "done" && !c.proof?.trim())
        errs.push(`${name} is done but has no proof; mark it reported`);
      if (c.state === "reported" && !c.where?.trim())
        errs.push(`${name} is reported but does not say where`);
      if (c.state === "open" || c.state === "doing") {
        if (!c.actions?.length)
          errs.push(`${name} is ${c.state} but no action closes it`);
        for (const n of c.actions ?? []) {
          if (!numbers.has(n))
            errs.push(`${name} names action ${n}, which does not exist`);
          referenced.add(n);
        }
      }
    }
  }
  for (const a of card.actions) {
    if (!referenced.has(a.n))
      errs.push(`action ${a.n} closes no open check; drop it or add the check`);
    if (a.group === "needs you" && (!a.options?.length || !a.pick?.trim()))
      errs.push(`action ${a.n} needs options and a pick ("none yet" is fine)`);
    if (a.group === "I do next" && !a.needs?.trim())
      errs.push(
        `action ${a.n} needs "needs" (e.g. "needs nothing", "after 1")`,
      );
    if (a.group === "waiting" && !a.until?.trim())
      errs.push(`action ${a.n} is waiting but has no "until"`);
  }
  const rows = cardRows(card);
  if (rows > MAX_ROWS)
    errs.push(
      `the card has ${rows} rows; at most ${MAX_ROWS}: cut checks or actions`,
    );
  return [...new Set(errs)];
}

function cardRows(card: Card): number {
  const ladder = card.rungs.reduce((s, r) => s + 1 + r.checks.length, 0);
  const tail = (card.ideas?.trim() ? 1 : 0) + (card.reply?.trim() ? 1 : 0);
  const decisions = card.actions.filter((a) => a.group === "needs you").length;
  return (
    ladder +
    (card.actions.length || tail ? 1 : 0) +
    card.actions.length +
    decisions +
    tail
  );
}

const width = (s: string) => [...s].length;
/** Cut to at most n characters, ending in … when cut. */
export function fit(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (n <= 0) return "";
  return width(t) <= n ? t : [...t].slice(0, n - 1).join("") + "…";
}
const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - width(s)));
/** Cut a laid-out row to n characters, keeping its spacing. */
const cut = (s: string, n: number) =>
  width(s) <= n ? s : [...s].slice(0, n - 1).join("") + "…";

/** The action that moves `this`: the lowest number among the actions closing the this rung's open checks. */
export function movesThis(card: Card): number | null {
  const rung = card.rungs.find((r) => r.level === "this");
  const ns = (rung?.checks ?? []).flatMap((c) =>
    c.state === "open" || c.state === "doing" ? (c.actions ?? []) : [],
  );
  return ns.length ? Math.min(...ns) : null;
}

export interface Rendered {
  text: string;
  /** done checks shown as reported because their proof was not found */
  unverified: string[];
}

/** Lay out a valid card. isKnown says whether a done check's proof is backed by gathered facts. */
export function renderCard(
  card: Card,
  isKnown: (proof: string) => boolean,
): Rendered {
  const unverified: string[] = [];
  const lines: string[] = [];
  const checks = card.rungs.flatMap((r) =>
    r.checks.map((c) => {
      let state = c.state;
      let right =
        c.state === "done"
          ? (c.proof ?? "")
          : c.state === "reported"
            ? (c.where ?? "")
            : (c.actions ?? []).join(" ");
      if (state === "done" && !isKnown(right)) {
        unverified.push(c.text);
        state = "reported";
        right = "unverified: " + right;
      }
      return { level: r.level, mark: CHECK_MARK[state], text: c.text, right };
    }),
  );
  const indent = " ".repeat(10);
  const rightW = Math.min(
    24,
    Math.max(0, ...checks.map((c) => width(c.right))),
  );
  const textW = Math.min(
    Math.max(...checks.map((c) => width(c.text)), 1),
    WIDTH - 10 - 2 - 2 - rightW,
  );
  for (const r of card.rungs) {
    lines.push(
      pad(r.level, 8) +
        RUNG_MARK[r.level] +
        " " +
        fit(r.outcome, WIDTH - 10 - ", done when:".length) +
        ", done when:",
    );
    for (const c of checks.filter((x) => x.level === r.level)) {
      const head = indent + c.mark + " " + pad(fit(c.text, textW), textW);
      lines.push(
        c.right
          ? (head + "  " + fit(c.right, WIDTH - width(head) - 2)).trimEnd()
          : head.trimEnd(),
      );
    }
  }
  const actions = [...card.actions].sort(
    (a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.n - b.n,
  );
  if (actions.length || card.ideas?.trim() || card.reply?.trim())
    lines.push("");
  const dot = movesThis(card);
  // needs / until share the action's row; a decision's options and pick go on a row of their own
  // under it, so the action text keeps most of the width.
  const col2 = (a: Action) =>
    a.group === "I do next"
      ? (a.needs ?? "")
      : a.group === "waiting"
        ? "until " + (a.until ?? "")
        : "";
  const numW = Math.max(1, ...actions.map((a) => String(a.n).length));
  const lead = 12 + numW + 1 + 2;
  const c2W = Math.min(28, Math.max(0, ...actions.map((a) => width(col2(a)))));
  const aW = Math.min(
    Math.max(1, ...actions.map((a) => width(a.text))),
    WIDTH - lead - (c2W ? 2 + c2W : 0),
  );
  let group = "";
  for (const a of actions) {
    const label = a.group === group ? "" : a.group;
    group = a.group;
    const row =
      pad(label, 12) +
      String(a.n).padStart(numW) +
      " " +
      (a.n === dot ? "● " : "  ") +
      pad(fit(a.text, aW), aW) +
      (c2W ? "  " + fit(col2(a), c2W) : "");
    lines.push(cut(row.trimEnd(), WIDTH));
    if (a.group === "needs you") {
      const pick = "my pick: " + fit(a.pick ?? "", 30);
      const opts = fit(
        (a.options ?? []).join(" · "),
        WIDTH - lead - 2 - width(pick),
      );
      lines.push(" ".repeat(lead) + opts + "  " + pick);
    }
  }
  if (card.ideas?.trim())
    lines.push(pad("ideas", 12) + fit(card.ideas, WIDTH - 12));
  if (card.reply?.trim())
    lines.push(pad("reply", 12) + fit(card.reply, WIDTH - 12));
  return { text: lines.join("\n"), unverified };
}

export function validateBrief(b: Brief): string[] {
  const keys = [
    "subject",
    "what",
    "where",
    "why",
    "how",
    "effort",
    "impact",
    "pick",
    "context",
  ] as const;
  return keys
    .filter((k) => !b[k]?.trim())
    .map(
      (k) =>
        `brief needs "${k}" (write "not sized" for an unknown effort or impact)`,
    );
}

export function renderBrief(b: Brief): string {
  const head = "── " + fit(b.subject, WIDTH - 8) + " ";
  const rows = (
    [
      "what",
      "where",
      "why",
      "how",
      "effort",
      "impact",
      "pick",
      "context",
    ] as const
  ).map((k) => pad(k, 9) + fit(b[k], WIDTH - 9));
  return [
    head + "─".repeat(Math.max(3, Math.min(60, WIDTH - width(head)))),
    ...rows,
  ].join("\n");
}

// ---- facts the extension gathers, and the prompt

export interface Observation {
  id: string;
  content: string;
  relevance: string;
}
export interface Facts {
  /** your last few messages, verbatim, oldest first */
  userWords: string[];
  gitStatus: string;
  gitLog: string;
  /** high and critical observations from pi-blackhole's memory, newest last */
  observations: Observation[];
  /** the last card's text when it is still in context (no compaction since) */
  lastCard: string | null;
}

/** A proof checker: a sha or memory id named in the facts, a path that exists, or text found in a tool result. */
export function proofChecker(
  facts: Facts,
  toolText: string,
  pathExists: (p: string) => boolean,
): (proof: string) => boolean {
  const shas = new Set(facts.gitLog.match(/\b[0-9a-f]{7,40}\b/g) ?? []);
  const ids = new Set(facts.observations.map((o) => o.id));
  return (proof: string) => {
    const p = proof.trim();
    if (!p) return false;
    for (const tok of p.split(/[\s,;()]+/)) {
      const t = tok.replace(/^[`'"@]+|[`'".]+$/g, "");
      if (
        /^[0-9a-f]{7,40}$/.test(t) &&
        ([...shas].some((s) => s.startsWith(t) || t.startsWith(s)) ||
          toolText.includes(t))
      )
        return true;
      if (ids.has(t)) return true;
      const path = t.replace(/:\d+(?:[-,]\d+)*$/, "");
      if (/[/.]/.test(path) && path.length > 2 && pathExists(path)) return true;
    }
    return p.length >= 6 && toolText.includes(p);
  };
}

const MARKER = "[/where]";
export const isWhereRequest = (text: string) => text.startsWith(MARKER);

const ANCHOR =
  "Your last card is below and still in context. Keep each rung's wording and each action's number unless what happened since changed it. Update the marks. A new action takes the next number after the highest one in that card; a finished action's number is not reused.";

/** The message that asks for a card (no expand) or a brief (expand names an action number or a rung). */
export function buildPrompt(
  rules: string,
  facts: Facts,
  expand: string,
): string {
  const parts = [MARKER, rules.trim()];
  const block = (title: string, body: string) => {
    if (body.trim()) parts.push(`## ${title}\n${body.trim()}`);
  };
  block(
    "My latest words (verbatim, oldest first)",
    facts.userWords.map((w) => "- " + fit(w, 600)).join("\n"),
  );
  block("git status", facts.gitStatus);
  block("git log (this session)", facts.gitLog);
  block(
    "Memory (pi-blackhole observations, high and critical, newest last; cite an id as proof)",
    facts.observations
      .map((o) => `- ${o.id} [${o.relevance}] ${fit(o.content, 240)}`)
      .join("\n"),
  );
  if (facts.lastCard) block("Your last card", ANCHOR + "\n\n" + facts.lastCard);
  parts.push(
    expand.trim()
      ? `Expand: ${expand.trim()}. Call where_card once with kind "brief" for it (a number means that action in your last card).`
      : 'Call where_card once with kind "card". If it returns errors, fix them and call it again. Write no other text.',
  );
  return parts.join("\n\n");
}

// ---- reading the session branch

/** The few session entry fields read here (pi 1.5.2 session format v3). */
export interface BranchEntry {
  type: string;
  timestamp?: string;
  customType?: string;
  data?: unknown;
  message?: {
    role?: string;
    content?: unknown;
    toolName?: string;
    details?: unknown;
  };
}
export interface CardDetails {
  kind: "card" | "brief";
  text: string;
}

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .map((c: { type?: string; text?: string }) =>
            c?.type === "text" ? (c.text ?? "") : "",
          )
          .join("\n")
      : "";

const RELEVANT = new Set(["high", "critical"]);

/**
 * Facts from the active branch: the last user messages, pi-blackhole's high and
 * critical observations not dropped since, the last card when no compaction
 * came after it, every tool result's text (for proof checks), and the session start.
 *
 * Reads pi-blackhole's ledger entries (customType om.observations.recorded with
 * data.observations[{id, content, relevance}], om.observations.dropped with
 * data.observationIds). That format is internal to pi-blackhole, checked against
 * 0.5.18 (src/om/ledger/types.ts); tests/where-card.test.ts pins it.
 */
export function factsFromBranch(
  entries: BranchEntry[],
  opts: { userWords?: number; observations?: number } = {},
): Omit<Facts, "gitStatus" | "gitLog"> & {
  toolText: string;
  since: string | null;
  anyCard: string | null;
} {
  const users: string[] = [];
  const recorded: Observation[] = [];
  const dropped = new Set<string>();
  const tool: string[] = [];
  let lastCard: string | null = null;
  let anyCard: string | null = null; // the last card even across a compaction: what "/where 3" refers to
  for (const e of entries) {
    if (e.type === "compaction") lastCard = null;
    if (e.type === "custom" && e.customType === "om.observations.recorded") {
      const obs =
        (e.data as { observations?: Partial<Observation>[] } | undefined)
          ?.observations ?? [];
      for (const o of obs)
        if (o.id && o.content && RELEVANT.has(o.relevance ?? ""))
          recorded.push({
            id: o.id,
            content: o.content,
            relevance: o.relevance ?? "",
          });
    }
    if (e.type === "custom" && e.customType === "om.observations.dropped") {
      for (const id of (e.data as { observationIds?: string[] } | undefined)
        ?.observationIds ?? [])
        dropped.add(id);
    }
    if (e.type !== "message" || !e.message) continue;
    const m = e.message;
    if (m.role === "user") {
      const t = textOf(m.content).trim();
      if (t && !isWhereRequest(t)) users.push(t);
    } else if (m.role === "toolResult") {
      tool.push(textOf(m.content));
      const d = m.details as Partial<CardDetails> | undefined;
      if (m.toolName === "where_card" && d?.kind === "card" && d.text)
        lastCard = anyCard = d.text;
    }
  }
  const all = tool.join("\n");
  return {
    userWords: users.slice(-(opts.userWords ?? 3)),
    observations: recorded
      .filter((o) => !dropped.has(o.id))
      .slice(-(opts.observations ?? 20)),
    lastCard,
    anyCard,
    toolText: all.length > 2_000_000 ? all.slice(-2_000_000) : all,
    since: entries.find((e) => e.timestamp)?.timestamp ?? null,
  };
}
