// Shared setup for trial.test.ts and trial-plan.test.ts, split so node --test runs the two in parallel.
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
export const scratch = realpathSync(mkdtempSync(join(tmpdir(), "trial-test-")));
export const realHome = join(scratch, "real-home");
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

write(join(realHome, ".pi/agent/auth.json"), "{}");
export const BUGGY =
  "export function add(a: number, b: number): number {\n\treturn a - b;\n}\n";
export const FIXED = BUGGY.replace("a - b", "a + b");
export const TEST_CMD = "node --test 'src/*.test.ts'";
export const spec = (name: string, a: number, b: number, sum: number) =>
  `import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { add } from "./add.ts";\ntest("${name}", () => assert.equal(add(${a}, ${b}), ${sum}));\n`;

// Source repo: commit 1 is buggy with a passing test, commit 2 is the fix plus a new test.
export const repo = join(scratch, "source-repo");
write(
  join(repo, "package.json"),
  JSON.stringify({ type: "module", scripts: { test: TEST_CMD } }),
);
write(join(repo, "src/add.ts"), BUGGY);
write(join(repo, "src/add.test.ts"), spec("zero", 0, 0, 0));
git(repo, "init", "-q");
git(repo, "add", "-A");
git(repo, "commit", "-q", "-m", "buggy");
write(join(repo, "src/add.ts"), FIXED);
write(join(repo, "src/add.more.test.ts"), spec("more", 2, 3, 5));
write(join(repo, "linked/x.txt"), "x\n");
git(repo, "add", "-A");
git(repo, "commit", "-q", "-m", "fix");
export const fixSha = git(repo, "rev-parse", "HEAD");

export function makeTask(
  id: string,
  over: Record<string, unknown> = {},
): string {
  const dir = join(scratch, "tasks", id);
  const task = {
    id,
    role: "worker",
    repo,
    fix: fixSha,
    test: TEST_CMD,
    allowed: ["src/add.ts"],
    hidden: ["src/add.more.test.ts"],
    link: [],
    ...over,
  };
  write(join(dir, "task.json"), JSON.stringify(task));
  write(
    join(dir, "prompt.md"),
    `files-allowed: [src/add.ts]\ntests: ${TEST_CMD}\n\nFix add.\n`,
  );
  return dir;
}

export type Mode =
  | "fix"
  | "noop"
  | "leak"
  | "silent"
  | "blocked"
  | "fixplus"
  | "fixtest"
  | "dead"
  | "refused"
  | "frozen";
export const VERDICT = {
  fix: "PASS",
  fixplus: "PASS",
  fixtest: "PASS",
  leak: "PASS",
  noop: "FAIL",
  blocked: "CANNOT-RUN",
  silent: "",
  dead: "CANNOT-RUN",
  refused: "CANNOT-RUN",
  frozen: "CANNOT-RUN",
};

/** A stub scout. It runs under env -i, so everything it needs is baked into the script. */
export function makeStub(
  mode: Mode,
  sensors = false,
): { path: string; record: string } {
  const path = join(scratch, `stub-${mode}`);
  const record = `${path}.record`;
  const usage =
    mode === "dead"
      ? { input: 0, output: 0, cost: { total: 0 } }
      : {
          input: 100,
          output: 20,
          cacheRead: 50,
          cacheWrite: 10,
          cost: { total: 0.125 },
        };
  const command = mode === "leak" ? `cat ${repo}/src/add.ts` : "ls";
  const line = JSON.stringify({
    type: "message",
    message: {
      role: "assistant",
      usage,
      content: [{ type: "toolCall", name: "bash", arguments: { command } }],
    },
  });
  write(
    path,
    `#!/usr/bin/env bash
{ echo "HOME=$HOME"; echo "ARGS=$*"; echo "PWD=$PWD"; echo "STDIN=$(cat)"; echo "OUTER=$(env | grep -Ec '^(PI_|EVAL_)' || true)"; } > '${record}'
d="$HOME/.pi/agent/sessions/scout/$$"; mkdir -p "$d"
if [ ${mode} = refused ]; then exit 75; fi
if [ ${mode} = silent ]; then : > "$d/s.jsonl"; exit 1; fi
printf '%s\\n' '${line}' > "$d/s.jsonl"
if [ ${mode} = dead ]; then
  printf '%s\\n' 'WORKER-SENSORS: CANNOT-RUN run ended: error' 'scout: pi exited 1 with no digest. Last stderr lines:' 'HTTP 429'
  exit 1
fi
if [ ${mode} = frozen ]; then
  echo 'WORKER-SENSORS: CANNOT-RUN interface-frozen files must spell out their interface before a freeze'
  exit 1
fi
printf '%s' '{"verdict":"${VERDICT[mode]}","reasons":[],"retriesUsed":0}' > "$d/verdict.json"
case ${mode} in fix|fixplus|fixtest|leak) printf 'export function add(a: number, b: number): number {\\n\\treturn a + b;\\n}\\n' > src/add.ts ;; esac
if [ ${mode} = fixplus ]; then echo extra > NOTES.md; fi
if [ ${mode} = fixtest ]; then echo '// own test' > src/own.test.ts; fi
if [ '${sensors}' = true ]; then printf 'WORKER-SENSORS: ${VERDICT[mode]} stub verdict\n'; fi
if [ ${mode} = blocked ]; then printf '**Blocked on me**\\n- needs a credential\\n'; else printf '**Blocked on me**\\nnothing.\\n'; fi
`,
    0o755,
  );
  return { path, record };
}

let counter = 0;
/** A fresh trial output path under scratch. */
export function nextOut(): string {
  return join(scratch, `out-${counter++}.jsonl`);
}
export function trial(
  task: string,
  mode: Mode,
  extra: Record<string, string> = {},
) {
  const stub = makeStub(mode);
  const out = nextOut();
  const r = run("trial.sh", [task, "prov/model-x", "high", "3", out], {
    EVAL_SCOUT: stub.path,
    EVAL_REAL_HOME: realHome,
    ...extra,
  });
  const records = existsSync(out)
    ? readFileSync(out, "utf8").trim().split("\n")
    : [];
  const rec = records.length
    ? JSON.parse(records[records.length - 1])
    : undefined;
  if (rec) keep.push(rec.dir);
  return { r, rec, records, stub };
}
