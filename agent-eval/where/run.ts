#!/usr/bin/env node
// run.ts: /where spikes on cut copies of real pi sessions. Copies live in /tmp/where-spike/<run>/; results in results/<run>/.
//   node run.ts corpus                       pick cut points for the sessions in CASES -> corpus.json
//   node run.ts spike0 --run <id> [--k 3]    /where k times at cut b of every case; stability.json
//   node run.ts spike2 --run <id>            card A at aSame and aCross, then variants a b c d at b; anchor.json
//   node run.ts judge --run <id>             blind judge of every spike2 variant against the transcript a..b
// Env: WHERE_CASES (comma list of case ids, default all), WHERE_MODEL (anthropic/claude-opus-5-5), WHERE_THINKING (medium), JUDGE_THINKING (high), WHERE_PAR (2), BUDGET ($, 18).
// pi runs with PI_BLACKHOLE_PASSIVE=true so no memory workers or compaction touch the copies.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  comparePair,
  parseCard,
  pickCuts,
  splice,
  stability,
  transcript,
  type Cuts,
} from "./lib.ts";

const HERE = import.meta.dirname;
const SESSIONS = path.join(os.homedir(), ".pi/agent/sessions");
const WHERE_MD = path.join(
  os.homedir(),
  "Dev/dotfiles/config/pi/prompts/where.md",
);
const MODEL = process.env.WHERE_MODEL ?? "anthropic/claude-opus-5-5";
const THINKING = process.env.WHERE_THINKING ?? "medium";
const PAR = Number(process.env.WHERE_PAR ?? 2);
const BUDGET = Number(process.env.BUDGET ?? 18);
const CASES = ["01a1dd4a", "01a1d8be", "01a1cbd9", "01a1c98d"];

interface Case {
  id: string;
  file: string;
  cwd: string;
  cuts: Cuts;
}
const readLines = (f: string) =>
  fs
    .readFileSync(f, "utf8")
    .split("\n")
    .filter((l) => l.trim());
const writeLines = (f: string, lines: string[]) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, lines.join("\n") + "\n");
};
const ONLY = process.env.WHERE_CASES?.split(",");
const corpus = (): Case[] =>
  (
    JSON.parse(
      fs.readFileSync(path.join(HERE, "corpus.json"), "utf8"),
    ) as Case[]
  ).filter((c) => !ONLY || ONLY.includes(c.id));
let spent = 0; // set from results/<run>/runs.jsonl at start, so BUDGET covers every command of a run

function findSession(id: string): string {
  for (const d of fs.readdirSync(SESSIONS)) {
    const dir = path.join(SESSIONS, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    const f = fs
      .readdirSync(dir)
      .find((n) => n.includes(id) && n.endsWith(".jsonl"));
    if (f) return path.join(dir, f);
  }
  throw new Error("no session " + id);
}

/** The /where template body with frontmatter and the $@ slot removed, for variants that add text to it. */
function whereBody(): string {
  return fs
    .readFileSync(WHERE_MD, "utf8")
    .replace(/^---[\s\S]*?---\n/, "")
    .replace(" Expand: $@", "");
}

interface PiResult {
  text: string;
  cost: number;
  extra: string[];
  secs: number;
  code: number | null;
}
/** One pi -p turn continuing the session file at copy. extra: the entries pi appended. */
function pi(
  copy: string,
  cwd: string,
  prompt: string,
  thinking = THINKING,
): Promise<PiResult> {
  if (spent > BUDGET)
    return Promise.reject(new Error("budget $" + BUDGET + " spent"));
  const n0 = readLines(copy).length;
  const t0 = Date.now();
  return new Promise((res) => {
    const child = spawn(
      "pi",
      [
        "-p",
        "--session",
        copy,
        "--model",
        MODEL,
        "--thinking",
        thinking,
        "--no-tools",
        prompt,
      ],
      {
        cwd: fs.existsSync(cwd) ? cwd : os.tmpdir(),
        env: { ...process.env, PI_BLACKHOLE_PASSIVE: "true", SCOUT_HERDR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let out = "",
      err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 10 * 60000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      const extra = readLines(copy).slice(n0);
      let cost = 0;
      for (const l of extra) {
        const e = JSON.parse(l) as {
          message?: { role?: string; usage?: { cost?: { total?: number } } };
        };
        if (e.message?.role === "assistant")
          cost += e.message.usage?.cost?.total ?? 0;
      }
      spent += cost;
      if (code !== 0) fs.appendFileSync(copy + ".stderr", err);
      res({
        text: out,
        cost,
        extra,
        secs: Math.round((Date.now() - t0) / 1000),
        code,
      });
    });
  });
}

async function pool<T>(jobs: (() => Promise<T>)[], par: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: par }, async () => {
      while (i < jobs.length) {
        const k = i++;
        out[k] = await jobs[k]();
      }
    }),
  );
  return out;
}

function makeCorpus(): void {
  const cases: Case[] = [];
  for (const id of CASES) {
    const file = findSession(id);
    const lines = readLines(file);
    const cuts = pickCuts(lines);
    if (!cuts) {
      console.log(
        id + " skipped: no compaction with 3 user turns before and 5 after",
      );
      continue;
    }
    const cwd = (JSON.parse(lines[0]) as { cwd?: string }).cwd ?? os.homedir();
    cases.push({ id, file, cwd, cuts });
    console.log(
      id + " cuts " + JSON.stringify(cuts) + " lines=" + lines.length,
    );
  }
  fs.writeFileSync(
    path.join(HERE, "corpus.json"),
    JSON.stringify(cases, null, 2) + "\n",
  );
}

const work = (run: string, ...p: string[]) =>
  path.join("/tmp/where-spike", run, ...p);
const res = (run: string, ...p: string[]) =>
  path.join(HERE, "results", run, ...p);
const save = (f: string, body: string) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body);
};
const log = (run: string, row: object) => {
  fs.mkdirSync(res(run), { recursive: true });
  fs.appendFileSync(
    res(run, "runs.jsonl"),
    JSON.stringify({ t: new Date().toISOString(), ...row }) + "\n",
  );
};

/** Run one prompt on a fresh copy of lines; save the reply and cost under results/<run>/<name>.out */
async function once(
  run: string,
  c: Case,
  name: string,
  lines: string[],
  prompt: string,
): Promise<PiResult> {
  const copy = work(run, name + ".jsonl");
  // resume: a reply already saved, with its session copy, is reused at no cost
  if (fs.existsSync(res(run, name + ".out")) && fs.existsSync(copy)) {
    return {
      text: fs.readFileSync(res(run, name + ".out"), "utf8"),
      cost: 0,
      extra: readLines(copy).slice(lines.length),
      secs: 0,
      code: 0,
    };
  }
  writeLines(copy, lines);
  const r = await pi(copy, c.cwd, prompt);
  save(res(run, name + ".out"), r.text);
  log(run, {
    name,
    case: c.id,
    cost: Math.round(r.cost * 1000) / 1000,
    secs: r.secs,
    code: r.code,
    spent: Math.round(spent * 100) / 100,
  });
  console.log(
    name +
      " code=" +
      r.code +
      " $" +
      r.cost.toFixed(3) +
      " " +
      r.secs +
      "s spent=$" +
      spent.toFixed(2),
  );
  return r;
}

// Runs on one case go one after another so the 2nd and later read the prompt cache the 1st wrote (~$1.4 cold vs ~$0.2 warm).
async function spike0(run: string, k: number): Promise<void> {
  const cases = corpus();
  await pool(
    cases.map((c) => async () => {
      for (let i = 0; i < k; i++)
        if (!fs.existsSync(res(run, "spike0", c.id, i + ".out")))
          await once(
            run,
            c,
            "spike0/" + c.id + "/" + i,
            readLines(c.file).slice(0, c.cuts.b),
            "/where",
          );
    }),
    PAR,
  );
  const out: Record<string, unknown> = {};
  for (const c of cases)
    out[c.id] = stability(
      Array.from({ length: k }, (_, i) =>
        parseCard(
          fs.readFileSync(res(run, "spike0", c.id, i + ".out"), "utf8"),
        ),
      ),
    );
  save(res(run, "stability.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("SPIKE0 DONE spent=$" + spent.toFixed(2));
}

const ANCHOR_CONTEXT =
  "\n\nYour last /where card is above in this conversation. Keep each rung's wording and each action's number unless what happened since changed it. Update the marks. A new action takes the next number after the highest one in that card; a finished action's number is not reused.";
const anchorInjected = (card: string) =>
  "\n\nYour last /where card, from earlier in this session (it may predate a compaction):\n" +
  card.trim() +
  "\n\nKeep each rung's wording and each action's number unless what happened since changed it. Update the marks. A new action takes the next number after the highest one in that card; a finished action's number is not reused. End every row that differs from that card with ' Δ'.";

async function spike2(run: string): Promise<void> {
  const cases = corpus();
  const body = whereBody();
  const anchors: Record<string, unknown> = {};
  await pool(
    cases.map((c) => async () => {
      const lines = readLines(c.file);
      // shortest prefix first, then the ones that extend it, so each run reuses the cache of the one before
      const aCross = await once(
        run,
        c,
        "spike2/" + c.id + "/A-cross",
        lines.slice(0, c.cuts.aCross),
        "/where",
      );
      const aSame = await once(
        run,
        c,
        "spike2/" + c.id + "/A-same",
        lines.slice(0, c.cuts.aSame),
        "/where",
      );
      const spliced = splice(lines, c.cuts.aSame, c.cuts.b, aSame.extra);
      const atB = lines.slice(0, c.cuts.b);
      await once(
        run,
        c,
        "spike2/" + c.id + "/c",
        atB,
        body + anchorInjected(aSame.text),
      );
      await once(
        run,
        c,
        "spike2/" + c.id + "/d",
        atB,
        body + anchorInjected(aCross.text),
      );
      await once(run, c, "spike2/" + c.id + "/a", spliced, "/where");
      await once(
        run,
        c,
        "spike2/" + c.id + "/b",
        spliced,
        body + ANCHOR_CONTEXT,
      );
      const card = (n: string) =>
        parseCard(
          fs.readFileSync(res(run, "spike2", c.id, n + ".out"), "utf8"),
        );
      const plain = fs.existsSync(res(run, "spike0", c.id))
        ? fs
            .readdirSync(res(run, "spike0", c.id))
            .filter((f) => f.endsWith(".out"))
            .map((f) =>
              parseCard(fs.readFileSync(res(run, "spike0", c.id, f), "utf8")),
            )
        : [];
      anchors[c.id] = {
        a: comparePair(card("A-same"), card("a")),
        b: comparePair(card("A-same"), card("b")),
        c: comparePair(card("A-same"), card("c")),
        d: comparePair(card("A-cross"), card("d")),
        plainCross: plain.map((p) => comparePair(card("A-cross"), p)),
        delta: Object.fromEntries(
          ["c", "d"].map((n) => [
            n,
            (
              fs
                .readFileSync(res(run, "spike2", c.id, n + ".out"), "utf8")
                .match(/Δ/g) ?? []
            ).length,
          ]),
        ),
        faults: Object.fromEntries(
          ["a", "b", "c", "d"].map((n) => {
            const x = card(n);
            return [
              n,
              {
                parsed: x.parsed,
                longRows: x.longRows,
                rows: x.rows,
                outside: x.outside,
                openWithoutAction: x.openWithoutAction,
              },
            ];
          }),
        ),
      };
    }),
    2,
  );
  save(res(run, "anchor.json"), JSON.stringify(anchors, null, 2) + "\n");
  console.log("SPIKE2 DONE spent=$" + spent.toFixed(2));
}

const JUDGE = (
  t: string,
  cardA: string,
  cards: [string, string][],
) => `You grade status cards. Below is a stretch of a coding session (user and assistant text only), the status card the assistant printed at its start, and several candidate cards printed at its end (labelled X1, X2, ...). Judge each candidate only against what the session text shows.

For each candidate give:
- accurate (1-5): marks, open items and actions match what happened; 5 = nothing wrong.
- stale: rows carried over from the start card that the session shows are no longer true.
- missed: things the session shows happened or were decided that the candidate omits or gets wrong.
- invented: rungs, checks or claims with no basis in the session or the start card.
- usable (1-5): could the user act on it by number right now.

Reply with JSON only: {"X1": {"accurate": n, "stale": n, "missed": n, "invented": n, "usable": n, "why": "one line"}, ...}

=== SESSION STRETCH ===
${t}

=== START CARD ===
${cardA.trim()}

${cards.map(([k, v]) => "=== " + k + " ===\n" + v.trim()).join("\n\n")}`;

async function judge(run: string): Promise<void> {
  const cases = corpus();
  const out: Record<string, unknown> = {};
  await pool(
    cases.map((c) => async () => {
      const lines = readLines(c.file);
      const r = (n: string) =>
        fs.readFileSync(res(run, "spike2", c.id, n + ".out"), "utf8");
      const plain0 = fs.existsSync(res(run, "spike0", c.id, "0.out"))
        ? fs.readFileSync(res(run, "spike0", c.id, "0.out"), "utf8")
        : "";
      const groups: [string, number, string[]][] = [
        ["same", c.cuts.aSame, ["a", "b", "c"]],
        ["cross", c.cuts.aCross, ["d", ...(plain0 ? ["plain"] : [])]],
      ];
      for (const [g, start, names] of groups) {
        const order = [...names].sort(() => Math.random() - 0.5);
        const cards: [string, string][] = order.map((n, i) => [
          "X" + (i + 1),
          n === "plain" ? plain0 : r(n),
        ]);
        const copy = work(run, "judge", c.id + "-" + g + ".jsonl");
        writeLines(copy, [
          JSON.stringify({
            type: "session",
            version: 3,
            id: "judge-" + c.id + "-" + g,
            timestamp: new Date().toISOString(),
            cwd: os.tmpdir(),
          }),
        ]);
        const j = await pi(
          copy,
          os.tmpdir(),
          JUDGE(
            transcript(lines, start, c.cuts.b),
            r(g === "same" ? "A-same" : "A-cross"),
            cards,
          ),
          process.env.JUDGE_THINKING ?? "high",
        );
        save(res(run, "judge", c.id + "-" + g + ".out"), j.text);
        log(run, {
          name: "judge/" + c.id + "-" + g,
          case: c.id,
          cost: Math.round(j.cost * 1000) / 1000,
          secs: j.secs,
          code: j.code,
        });
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(
            j.text.slice(j.text.indexOf("{"), j.text.lastIndexOf("}") + 1),
          ) as Record<string, unknown>;
        } catch {
          parsed = { error: "unparsed" };
        }
        out[c.id + "-" + g] = Object.fromEntries(
          order.map((n, i) => [n, parsed["X" + (i + 1)]]),
        );
        console.log("judge " + c.id + "-" + g + " $" + j.cost.toFixed(3));
      }
    }),
    2,
  );
  save(res(run, "judge.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("JUDGE DONE spent=$" + spent.toFixed(2));
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { run: { type: "string" }, k: { type: "string", default: "3" } },
});
const [cmd] = positionals;
if (values.run && fs.existsSync(res(values.run, "runs.jsonl"))) {
  for (const l of readLines(res(values.run, "runs.jsonl")))
    spent += (JSON.parse(l) as { cost?: number }).cost ?? 0;
}
if (cmd === "corpus") makeCorpus();
else if (cmd === "spike0" && values.run)
  await spike0(values.run, Number(values.k));
else if (cmd === "spike2" && values.run) await spike2(values.run);
else if (cmd === "judge" && values.run) await judge(values.run);
else {
  console.error(
    "usage: run.ts corpus | spike0 --run <id> [--k 3] | spike2 --run <id> | judge --run <id>",
  );
  process.exit(2);
}
