// Shared setup for the review*.test.ts files, split so node --test runs them in parallel.
// Each importing process gets its own scratch dir, source repo and stubs; nothing is shared between files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after } from "node:test";

export const EVAL_DIR = resolve(import.meta.dirname, "..");

export const scratch = realpathSync(
  mkdtempSync(join(tmpdir(), "review-test-")),
);

export const realHome = join(scratch, "real-home");

export const shimHome = join(scratch, "shim-home");

export const keep: string[] = [];

after(() =>
  [scratch, ...keep].forEach((d) =>
    rmSync(d, { recursive: true, force: true }),
  ),
);

// Not the outer node --test's environment (a nested node --test would think it is a child). PI_SCOUT_REAL_GIT
// stays because a scout's PATH carries a git guard that refuses to run without it.
export const env = (extra: Record<string, string> = {}) => ({
  PATH: process.env.PATH ?? "",
  ...(process.env.PI_SCOUT_REAL_GIT
    ? { PI_SCOUT_REAL_GIT: process.env.PI_SCOUT_REAL_GIT }
    : {}),
  HOME: realHome,
  TERM: "xterm",
  LANG: "C",
  ...extra,
});

export const run = (
  script: string,
  args: string[],
  extra: Record<string, string> = {},
) =>
  spawnSync(join(EVAL_DIR, script), args, {
    encoding: "utf8",
    env: env(extra),
  });

export function write(path: string, content: string, mode?: number): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
  if (mode) chmodSync(path, mode);
}

export function git(cwd: string, ...args: string[]): string {
  const r = spawnSync(
    "git",
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, encoding: "utf8", env: env() },
  );
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

// ---- pure helpers ----

export const FENCE = "```";

export const finding = { file: "a.ts", line: 3, severity: "high", claim: "x" };

export const FINDINGS: [string, string, unknown][] = [
  ["a bare array", JSON.stringify([finding]), [finding]],
  [
    "a code fence around it",
    FENCE + "json\n" + JSON.stringify([finding]) + "\n" + FENCE,
    [finding],
  ],
  ["an empty array is a review with no findings", "[]", []],
  [
    "severity lower-cased or medium, missing file, non-numeric or null line",
    '[{"file":"a","line":null,"severity":"HIGH","claim":"c"},{"line":"x","severity":"urgent","claim":"c"}]',
    [
      { file: "a", line: null, severity: "high", claim: "c" },
      { file: "", line: null, severity: "medium", claim: "c" },
    ],
  ],
  ["no claim", '[{"file":"a","line":1,"severity":"low"}]', undefined],
  ["an item that is not an object", '["c"]', undefined],
  [
    "a stray bracket after the array",
    JSON.stringify([finding]) + " Done [really].",
    undefined,
  ],
  ["no array, broken JSON, an object", "no findings", undefined],
  ["", "[{", undefined],
  ["", '{"claim":"c"}', undefined],
];

export const VERDICTS: [string, string, number, boolean[] | undefined][] = [
  ["case and spaces", '["yes"," NO ","Yes"]', 3, [true, false, true]],
  [
    "a fence with prose before it",
    "Answer:\n" + FENCE + '\n["no","no"]\n' + FENCE,
    2,
    [false, false],
  ],
  ["too short", '["yes"]', 2, undefined],
  ["too long", '["yes","no","no"]', 2, undefined],
  ["booleans are not answers", "[true,false]", 2, undefined],
  ["another word", '["yes","maybe"]', 2, undefined],
  ["no array", "yes, no", 2, undefined],
];

export const ITEMS: [string, unknown, unknown][] = [
  [
    "text and id only, minor false",
    [{ id: "a", text: "t" }],
    [{ id: "a", text: "t", minor: false }],
  ],
  [
    "minor true only when the JSON says true",
    [
      { id: "a", text: "t", minor: true },
      { id: "b", text: "t", minor: "true" },
      { id: "c", text: "t", minor: 1 },
      { id: "d", text: "t", minor: false },
    ],
    [
      { id: "a", text: "t", minor: true },
      { id: "b", text: "t", minor: false },
      { id: "c", text: "t", minor: false },
      { id: "d", text: "t", minor: false },
    ],
  ],
  [
    "extra fields such as hit are dropped",
    [{ id: "a", text: "t", hit: "SECRET" }],
    [{ id: "a", text: "t", minor: false }],
  ],
  ["an empty list", [], []],
  ["not a list", { id: "a", text: "t" }, undefined],
  ["an item that is not an object", ["t"], undefined],
  ["null item", [null], undefined],
  ["missing id", [{ text: "t" }], undefined],
  ["empty id", [{ id: "", text: "t" }], undefined],
  ["blank text", [{ id: "a", text: "  " }], undefined],
  ["numeric id", [{ id: 1, text: "t" }], undefined],
  ["numeric text", [{ id: "a", text: 2 }], undefined],
];

write(join(realHome, ".pi/agent/auth.json"), "{}");

write(join(shimHome, ".pi/agent/auth.json"), "{}");

export const SHIM = join(
  shimHome,
  ".pi/agent/npm/node_modules/@gotgenes/pi-anthropic-auth/src/index.ts",
);

write(SHIM, "export default () => {};\n");

export const source = join(scratch, "source-repo");

write(join(source, "booking/src/a.ts"), "export const a = 1;\n");

write(join(source, "booking/src/b.ts"), "export const b = 2;\n");

write(join(source, "README.md"), "tickets\n");

write(join(source, "log.md"), "log\n");

git(source, "init", "-q");

git(source, "add", "-A");

git(source, "commit", "-q", "-m", "one");

export const revSha = git(source, "rev-parse", "HEAD");

write(join(source, "booking/src/late.ts"), "export const late = 3;\n");

git(source, "add", "-A");

git(source, "commit", "-q", "-m", "two");

export const DEFECTS = [1, 2, 3].map((k) => ({
  id: "d" + k,
  text: "defect text " + k,
  hit: "HITMARK-" + k + " finding that states defect " + k,
}));

export const DECOYS = ["decoy claim one", "decoy claim two"];

export const FACTS = [1, 2, 3].map((k) => ({
  id: "f" + k,
  text: "fact text " + k,
  hit: "HITMARK-" + k + " answer sentence stating fact " + k,
}));

export const PROMPT = "Review booking/src/a.ts and booking/src/b.ts\n";

export function makeTask(
  id: string,
  over: Record<string, unknown> = {},
  prompt = PROMPT,
): string {
  const dir = join(scratch, "tasks", id);
  write(
    join(dir, "task.json"),
    JSON.stringify({
      id,
      role: "review",
      repo: source,
      rev: revSha,
      exclude: ["README.md", "log.md"],
      defects: DEFECTS,
      decoys: DECOYS,
      ...over,
    }),
  );
  write(join(dir, "prompt.md"), prompt);
  return dir;
}

export type Role = "reviewer" | "extract" | "a" | "b";

/** What a stub answers for a role: the text to print, YES (all yes), or SMART (yes for a defect whose hit marker is in the prompt). */
export const YES = "@yes";

export const SMART = "@smart";

export const ROLES: Role[] = ["extract", "a", "b", "reviewer"];

export const MODEL_GLOB: Record<Role, string> = {
  extract: "*haiku*",
  a: "*opus*",
  b: "*gpt*",
  reviewer: "*",
};

export const COST: Record<Role, number> = {
  reviewer: 0.5,
  extract: 0.01,
  a: 0.1,
  b: 0.2,
};

export const FOUND_ONE = JSON.stringify([
  { file: "booking/src/a.ts", line: 1, severity: "high", claim: "claim one" },
]);

let counter = 0;
/** A number unique within this test process, for scratch names. */
export function id(): number {
  return counter++;
}

/** A stub pi, one script per behaviour (it runs under env -i, so everything is baked in). Each role's arguments go to <stub>.<role>. */
export function makePi(replies: Partial<Record<Role, string>>): {
  path: string;
  seen: (role: Role) => string[] | undefined;
} {
  const path = join(scratch, "pi-" + id());
  const arms = ROLES.map((role) => {
    const reply = replies[role];
    const session = JSON.stringify({
      type: "message",
      message: {
        role: "assistant",
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          cost: { total: COST[role] },
        },
        content: [],
      },
    });
    let body: string;
    if (reply === undefined) body = "echo no reply configured >&2; exit 1";
    else if (reply === YES) body = 'echo \'["yes","yes","yes"]\'';
    else if (reply === SMART)
      body =
        'out=; sep=; for k in 1 2 3; do case "$prompt" in *HITMARK-$k*) v=yes ;; *) v=no ;; esac; out="$out$sep$(printf \'"%s"\' "$v")"; sep=,; done; echo "[$out]"';
    else {
      const file = path + "." + role + ".reply";
      write(
        file,
        role === "reviewer"
          ? JSON.stringify({
              type: "message_end",
              message: {
                role: "assistant",
                content: [{ type: "text", text: reply }],
              },
            }) + "\n"
          : reply,
      );
      body = "cat '" + file + "'";
    }
    const log =
      reply === undefined
        ? ""
        : '; mkdir -p "$sdir"; echo \'' + session + '\' > "$sdir/s.jsonl"';
    return (
      "  " +
      MODEL_GLOB[role] +
      ") role=" +
      role +
      "\n    " +
      record(path, role) +
      log +
      "\n    " +
      body +
      " ;;"
    );
  });
  write(
    path,
    [
      "#!/usr/bin/env bash",
      "model=; sdir=; prev=; prompt=",
      'for a in "$@"; do case "$prev" in --model) model=$a ;; --session-dir) sdir=$a ;; esac; prev=$a; prompt=$a; done',
      'case "$model" in',
      ...arms,
      "esac",
      "",
    ].join("\n"),
    0o755,
  );
  return {
    path,
    seen: (role) =>
      existsSync(path + "." + role)
        ? readFileSync(path + "." + role, "utf8")
            .split("\0")
            .slice(0, -1)
        : undefined,
  };
}

export const record = (path: string, role: Role): string =>
  "{ printf 'HOME=%s\\0' \"$HOME\"; printf '%s\\0' \"$@\"; } > '" +
  path +
  "." +
  role +
  "'";

export function judge(
  replies: Partial<Record<Role, string>>,
  opts: {
    review?: string;
    args?: string[];
    home?: string;
    task?: string;
    files?: Record<string, string>;
  } = {},
) {
  const pi = makePi(replies);
  const trial = join(scratch, "trial-" + id());
  mkdirSync(trial, { recursive: true });
  for (const [name, content] of Object.entries(opts.files ?? {}))
    write(join(trial, name), content);
  if (!("review" in opts) || opts.review !== undefined)
    write(join(trial, "review.txt"), opts.review ?? "The review text.\n");
  const task = opts.task ?? makeTask("jt-" + id());
  const r = run("judge.sh", [trial, task, ...(opts.args ?? [])], {
    EVAL_JUDGE_PI: pi.path,
    EVAL_REAL_HOME: opts.home ?? realHome,
  });
  const line = r.stdout.trim().split("\n").pop() ?? "";
  return { r, pi, trial, out: line === "" ? undefined : JSON.parse(line) };
}

export const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, a + " is not " + b);

export const flag = (args: string[], name: string) =>
  args[args.indexOf(name) + 1];

// ---- judge.sh ----

export const factsTask = (id: string, over: Record<string, unknown> = {}) =>
  makeTask(id, { defects: undefined, facts: FACTS, ...over });

export const ANSWER = "The answer says fact one and fact two.\n";

export function trial(
  replies: Partial<Record<Role, string>>,
  task = makeTask("rt-" + id()),
) {
  const pi = makePi(replies);
  const out = join(scratch, "out-" + id() + ".jsonl");
  const r = run("trial.sh", [task, "prov/model-x", "high", "2", out], {
    EVAL_REVIEW_PI: pi.path,
    EVAL_JUDGE_PI: pi.path,
    EVAL_REAL_HOME: realHome,
  });
  const rec = existsSync(out)
    ? JSON.parse(readFileSync(out, "utf8").trim().split("\n").pop()!)
    : undefined;
  if (rec) keep.push(rec.dir);
  return { r, rec, pi, out };
}

export function patchedTask(
  id: string,
  over: Record<string, unknown> = {},
): string {
  const dir = makeTask(id, {
    patches: ["a.patch", "b.patch"],
    test: "test -f README.md && test -L deps && grep -q 'a = 1' booking/src/a.ts && grep -q 'b = 2' booking/src/b.ts",
    link: ["deps"],
    paths: ["booking"],
    ...over,
  });
  for (const [file, from, to] of [
    ["a", 1, 9],
    ["b", 2, 8],
  ]) {
    write(
      join(dir, file + ".patch"),
      `diff --git a/booking/src/${file}.ts b/booking/src/${file}.ts
--- a/booking/src/${file}.ts
+++ b/booking/src/${file}.ts
@@ -1 +1 @@
-export const ${file} = ${from};
+export const ${file} = ${to};
`,
    );
  }
  return dir;
}

export function workspace(task: string, ws: string) {
  return spawnSync(
    "bash",
    [
      "-c",
      'source "$1/lib/task.sh"; make_workspace "$2" "$3" base',
      "_",
      EVAL_DIR,
      task,
      ws,
    ],
    { encoding: "utf8", env: env() },
  );
}
