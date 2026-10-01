/**
 * Worker sensors: limits a `scout --rw` worker cannot argue past.
 *
 * Inert unless PI_WORKER_SPEC names a spec file; `scout --rw` sets it to the
 * brief and loads this file with `-e`. The spec frontmatter supplies
 * `files-allowed` (globs relative to the repo root), `tests` (a shell
 * command), and an optional `max-lines` (default 400, from the handoff).
 *
 * Two layers. `tool_call` blocks edit/write outside files-allowed and a
 * short list of destructive bash. That layer is a speed bump: bash can still
 * write files, and a command built from variables (`g=git; $g push`) slips
 * past the token scan. The settle check is the authority: before the run
 * settles it reruns the tests and diffs the tree against a snapshot taken at
 * load, so bash writes, dependency changes, size overruns, and weakened
 * tests are all caught there. A failed check earns one continuation; a check
 * that cannot run (missing binary or service, timeout) stops at once,
 * because more model turns cannot fix the environment.
 *
 * Known gaps: the settle diff cannot see gitignored paths (`dist/`,
 * `node_modules/`, `.env`) or anything outside the repo, a symlink inside
 * the repo can redirect a write outside it, and a push that slips the token
 * scan leaves no trace in the tree.
 *
 * `**` in files-allowed does not match dotfiles (node:path matchesGlob);
 * list them explicitly.
 *
 * The verdict line `WORKER-SENSORS: PASS|FAIL|CANNOT-RUN <reasons>` goes to
 * stdout, which scout tees into the digest; PI_WORKER_REPORT, when set,
 * receives the same verdict as JSON.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, matchesGlob, normalize, relative, resolve } from "node:path";

const DEFAULT_MAX_LINES = 400;
const MAX_RETRIES = 1;
const TEST_TIMEOUT_MS = 300_000;
const OUTPUT_TAIL_LINES = 40;
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

export interface WorkerSpec {
  filesAllowed: string[];
  tests: string;
  maxLines: number;
}

export interface CheckFailure {
  kind: "fail" | "cannot-run";
  reason: string;
}

export type Step = "pass" | "retry" | "fail" | "cannot-run";

function unquote(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, "$2");
}

/** Split a flow list body on commas that sit outside `{a,b}` brace groups. */
function splitFlowList(body: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "{") depth += 1;
    if (char === "}") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      items.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  items.push(current);
  return items.map(unquote).filter(Boolean);
}

/**
 * Parse the spec frontmatter subset the sensors need: flow (`[a, b]`) or
 * block (`- a`) lists for files-allowed, scalars for the rest. Returns an
 * error string instead of throwing so the shell can fail closed with it.
 */
export function parseSpec(text: string): WorkerSpec | string {
  const match = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, "\n"));
  if (!match) return "spec has no frontmatter";
  const fields = new Map<string, string | string[]>();
  let listKey: string | undefined;
  for (const line of match[1].split("\n")) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (fields.get(listKey) as string[]).push(unquote(item[1]));
      continue;
    }
    const pair = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, key, raw] = pair;
    listKey = undefined;
    if (/^[|>]/.test(raw)) return `spec field ${key} uses a YAML block scalar; put it on one line`;
    if (raw === "") {
      fields.set(key, []);
      listKey = key;
    } else if (raw.startsWith("[") && raw.endsWith("]")) {
      fields.set(key, splitFlowList(raw.slice(1, -1)));
    } else {
      fields.set(key, unquote(raw));
    }
  }
  const filesAllowed = fields.get("files-allowed");
  if (!Array.isArray(filesAllowed) || filesAllowed.length === 0) return "spec frontmatter needs a non-empty files-allowed list";
  const tests = fields.get("tests");
  if (typeof tests !== "string" || tests === "") return "spec frontmatter needs a tests command";
  const rawMax = fields.get("max-lines");
  const maxLines = rawMax === undefined ? DEFAULT_MAX_LINES : Number(rawMax);
  if (!Number.isInteger(maxLines) || maxLines <= 0) return `spec max-lines must be a positive integer, got ${String(rawMax)}`;
  return { filesAllowed, tests, maxLines };
}

/** True when a repo-relative path matches one of the spec's globs. */
export function isAllowed(repoRelativePath: string, globs: readonly string[]): boolean {
  if (!repoRelativePath || isAbsolute(repoRelativePath)) return false;
  const path = normalize(repoRelativePath);
  if (path.startsWith("..")) return false;
  return globs.some((glob) => path === normalize(glob) || matchesGlob(path, glob));
}

/**
 * Resolve a tool path the way pi does (`@` prefix stripped, `~` expanded,
 * relative to cwd), then make it relative to the repo root.
 */
export function repoRelative(input: string, cwd: string, root: string, home: string = homedir()): string {
  let path = input.startsWith("@") ? input.slice(1) : input;
  if (path === "~") path = home;
  else if (path.startsWith("~/")) path = join(home, path.slice(2));
  return relative(root, resolve(cwd, path));
}

const GIT_BLOCKED = new Set(["push", "pull", "merge", "rebase", "reset", "clean", "stash", "checkout", "switch", "restore"]);
const GIT_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"]);
const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const PACKAGE_CHANGES = new Set(["add", "remove", "rm", "uninstall", "un", "update", "up", "upgrade", "dlx"]);
const PACKAGE_INSTALLS = new Set(["install", "i"]);

/**
 * Split a shell command into words per simple command. Quotes and escapes
 * are dropped rather than honoured, so `sh -c 'git push'` and `eval "..."`
 * surface their inner words; over-blocking a quoted mention is the price.
 */
function shellSegments(command: string): string[][] {
  return command
    .replace(/["'\\]/g, " ")
    .split(/\$\(|[;&|\n`(){}]/)
    .map((segment) => segment.split(/\s+/).filter(Boolean).map((word) => basename(word)))
    .filter((words) => words.length > 0);
}

function gitReason(args: readonly string[]): string | undefined {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) i += GIT_OPTIONS_WITH_VALUE.has(args[i]) ? 2 : 1;
  const sub = args[i];
  if (sub === undefined) return undefined;
  if (GIT_BLOCKED.has(sub)) return `git ${sub} touches history, the stash, or the remote, which belong to the operator`;
  if (sub === "commit" && args.includes("--amend")) return "git commit --amend rewrites the operator's commit";
  return undefined;
}

function wordReason(word: string, rest: readonly string[]): string | undefined {
  if (word === "git") return gitReason(rest);
  if (word === "rm" && rest.some((a) => a === "--recursive" || /^-[a-zA-Z]*[rR]/.test(a))) return "recursive rm is not allowed in a worker";
  if (word === "find" && rest.includes("-delete")) return "find -delete is not allowed in a worker";
  if (word === "bunx" || (word === "npx" && rest.some((a) => a === "-y" || a === "--yes"))) return "fetching packages needs the operator";
  if (PACKAGE_MANAGERS.has(word)) {
    const sub = rest.find((a) => !a.startsWith("-"));
    if (sub && PACKAGE_CHANGES.has(sub)) return "dependency changes need the operator";
    if (sub && PACKAGE_INSTALLS.has(sub) && rest.slice(rest.indexOf(sub) + 1).some((a) => !a.startsWith("-"))) {
      return "dependency changes need the operator";
    }
  }
  return undefined;
}

/**
 * The reason a worker bash command is refused, or undefined when it may run.
 * Every word of every segment is checked as a potential command, which
 * catches wrappers (`command`, `env`, `xargs`, `sh -c`) without listing them.
 */
export function forbiddenBash(command: string): string | undefined {
  for (const words of shellSegments(command)) {
    for (let i = 0; i < words.length; i += 1) {
      const reason = wordReason(words[i], words.slice(i + 1));
      if (reason) return reason;
    }
  }
  return undefined;
}

const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^|\/)__tests__\//;
const TEST_CASE = /\b(it|test|describe)\s*\(|\bassert\b|\bexpect\s*\(/g;
const TEST_SKIP = /\.(skip|only|todo)\s*\(|\b(xit|xdescribe|xtest|fit|fdescribe)\s*\(|\b(skip|only|todo)\s*:\s*true/g;

function occurrences(text: string | undefined, pattern: RegExp): number {
  return text === undefined ? 0 : (text.match(pattern) ?? []).length;
}

/**
 * Why a test file's change looks like the tests were weakened rather than
 * the code fixed: fewer cases or assertions than before, or new
 * skip/only markers. `undefined` content means the file does not exist.
 */
export function testWeakening(before: string | undefined, after: string | undefined): string | undefined {
  const casesBefore = occurrences(before, TEST_CASE);
  const casesAfter = occurrences(after, TEST_CASE);
  if (casesAfter < casesBefore) return `test cases or assertions dropped from ${casesBefore} to ${casesAfter}`;
  if (occurrences(after, TEST_SKIP) > occurrences(before, TEST_SKIP)) return "new skip/only/todo markers";
  return undefined;
}

function dependencyMap(json: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof json !== "object" || json === null) return out;
  const record = json as Record<string, unknown>;
  for (const field of DEP_FIELDS) {
    const deps = record[field];
    if (typeof deps !== "object" || deps === null) continue;
    for (const [name, version] of Object.entries(deps as Record<string, unknown>)) {
      out.set(`${field}.${name}`, String(version));
    }
  }
  return out;
}

/** Dependency keys added, removed, or re-versioned between two package.json texts. */
export function depsChanged(before: string | undefined, after: string): string[] {
  let afterJson: unknown;
  try {
    afterJson = JSON.parse(after);
  } catch {
    return ["package.json does not parse"];
  }
  let beforeJson: unknown = {};
  try {
    beforeJson = before === undefined ? {} : JSON.parse(before);
  } catch {
    // A base package.json that never parsed has no dependency set to compare against.
  }
  const was = dependencyMap(beforeJson);
  const now = dependencyMap(afterJson);
  const keys = new Set([...was.keys(), ...now.keys()]);
  return [...keys].filter((key) => was.get(key) !== now.get(key)).sort();
}

/** Whether a failing tests command means "the code is wrong" or "this machine can't run it". */
export function classifyFailure(exitCode: number | null, output: string, timedOut: boolean): CheckFailure["kind"] {
  if (timedOut || exitCode === 126 || exitCode === 127) return "cannot-run";
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|command not found/.test(output)) return "cannot-run";
  return "fail";
}

/** The settle decision: cannot-run beats everything, then one retry, then fail. */
export function nextStep(failures: readonly CheckFailure[], retriesUsed: number): Step {
  if (failures.length === 0) return "pass";
  if (failures.some((f) => f.kind === "cannot-run")) return "cannot-run";
  return retriesUsed < MAX_RETRIES ? "retry" : "fail";
}

interface RunResult {
  code: number | null;
  output: string;
  timedOut: boolean;
}

function runShell(command: string, cwd: string): Promise<RunResult> {
  return new Promise((done) => {
    const child = spawn("bash", ["-c", command], { cwd, detached: true });
    let output = "";
    let timedOut = false;
    const append = (chunk: Buffer): void => {
      output = (output + chunk.toString()).slice(-64_000);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        // ESRCH: the group exited between the timer firing and the kill.
      }
    }, TEST_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ code: 127, output: `${output}\n${error.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, output, timedOut });
    });
  });
}

function tail(text: string, lines: number): string {
  return text.trimEnd().split("\n").slice(-lines).join("\n");
}

interface Snapshot {
  root: string;
  base: string;
  /** Untracked files at load, by content hash; `git stash create` leaves them out. */
  untrackedAtStart: Map<string, string>;
}

function contentHash(path: string): string {
  return existsSync(path) ? createHash("sha1").update(readFileSync(path)).digest("hex") : "";
}

function hashUntracked(root: string): Map<string, string> {
  return new Map(listUntracked(root).map((file) => [file, contentHash(resolve(root, file))]));
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Content at the snapshot, or undefined when the file did not exist there. */
function showAtBase(snap: Snapshot, file: string): string | undefined {
  try {
    return git(snap.root, ["show", `${snap.base}:${file}`]);
  } catch {
    return undefined;
  }
}

function readIfPresent(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/** Newline count, as git numstat counts; binary files count zero. */
function countLines(path: string): number {
  if (!existsSync(path)) return 0;
  const bytes = readFileSync(path);
  if (bytes.includes(0)) return 0;
  let lines = 0;
  for (const byte of bytes) if (byte === 0x0a) lines += 1;
  return lines;
}

function listUntracked(root: string): string[] {
  return git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
}

/** Snapshot the tree as the worker found it, so pre-existing dirt is never blamed on the worker. */
function takeSnapshot(cwd: string): Snapshot {
  const root = git(cwd, ["rev-parse", "--show-toplevel"]).trim();
  const stash = git(root, ["stash", "create"]).trim();
  const base = stash || git(root, ["rev-parse", "HEAD"]).trim();
  return { root, base, untrackedAtStart: hashUntracked(root) };
}

async function runChecks(spec: WorkerSpec, snap: Snapshot): Promise<{ failures: CheckFailure[]; testOutput: string }> {
  const failures: CheckFailure[] = [];
  const tests = await runShell(spec.tests, snap.root);
  if (tests.code !== 0) {
    const kind = classifyFailure(tests.code, tests.output, tests.timedOut);
    const why = tests.timedOut ? `timed out after ${TEST_TIMEOUT_MS / 1000}s` : `exit ${String(tests.code)}`;
    failures.push({ kind, reason: `tests: \`${spec.tests}\` ${why}` });
  }

  const untrackedNow = hashUntracked(snap.root);
  const newFiles = [...untrackedNow.keys()].filter((f) => !snap.untrackedAtStart.has(f));
  const touchedUntracked = [...snap.untrackedAtStart].filter(([f, hash]) => untrackedNow.get(f) !== hash).map(([f]) => f);
  const tracked = git(snap.root, ["diff", "--no-renames", "--numstat", snap.base]).split("\n").filter(Boolean);
  const changed = new Map<string, number>();
  for (const row of tracked) {
    const [added, , file] = row.split("\t");
    changed.set(file, added === "-" ? 0 : Number(added));
  }
  for (const file of newFiles) changed.set(file, countLines(resolve(snap.root, file)));
  // A pre-existing untracked file has no base to diff, so its edit counts as zero lines.
  for (const file of touchedUntracked) changed.set(file, 0);

  const outside = [...changed.keys()].filter((f) => !isAllowed(f, spec.filesAllowed));
  if (outside.length) failures.push({ kind: "fail", reason: `files outside files-allowed: ${outside.join(", ")}` });

  const added = [...changed.values()].reduce((sum, n) => sum + n, 0);
  if (added > spec.maxLines) failures.push({ kind: "fail", reason: `${added} lines added, cap ${spec.maxLines}` });

  const packageJson = readIfPresent(resolve(snap.root, "package.json"));
  if (changed.has("package.json") && packageJson !== undefined) {
    const deps = depsChanged(showAtBase(snap, "package.json"), packageJson);
    if (deps.length) failures.push({ kind: "fail", reason: `dependency changes: ${deps.join(", ")}` });
  }

  for (const file of [...changed.keys()].filter((f) => TEST_FILE.test(f) && !snap.untrackedAtStart.has(f))) {
    const why = testWeakening(showAtBase(snap, file), readIfPresent(resolve(snap.root, file)));
    if (why) failures.push({ kind: "fail", reason: `${file}: ${why}. Restore the tests and fix the code instead` });
  }
  return { failures, testOutput: tests.output };
}

export default function (pi: ExtensionAPI) {
  const specPath = process.env.PI_WORKER_SPEC;
  if (!specPath) return;

  // Fail closed: a worker whose sensors cannot arm may not edit at all.
  let setupError: string | undefined;
  let spec: WorkerSpec | undefined;
  let snap: Snapshot | undefined;
  try {
    const parsed = parseSpec(readFileSync(specPath, "utf8"));
    if (typeof parsed === "string") setupError = `${specPath}: ${parsed}`;
    else spec = parsed;
    snap = takeSnapshot(process.cwd());
  } catch (error) {
    setupError ??= `worker-sensors setup: ${error instanceof Error ? error.message : String(error)}`;
  }

  let retriesUsed = 0;
  let verdict: { step: Exclude<Step, "retry">; reasons: string[] } | undefined;

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "edit" && event.toolName !== "write" && event.toolName !== "bash") return undefined;
    if (setupError || !spec || !snap) return { block: true, reason: setupError ?? "worker-sensors not armed" };
    const input = event.input as Record<string, unknown>;
    if (event.toolName === "bash") {
      const reason = forbiddenBash(String(input.command ?? ""));
      return reason ? { block: true, reason: `Blocked: ${reason}.` } : undefined;
    }
    const target = repoRelative(String(input.path ?? ""), process.cwd(), snap.root);
    if (isAllowed(target, spec.filesAllowed)) return undefined;
    return {
      block: true,
      reason: `${target} is outside files-allowed (${spec.filesAllowed.join(", ")}). If the spec needs it, stop and report it under Blocked on me.`,
    };
  });

  pi.on("agent_before_settle", async (event) => {
    if (verdict) return undefined;
    if (setupError || !spec || !snap) {
      verdict = { step: "cannot-run", reasons: [setupError ?? "worker-sensors not armed"] };
      return undefined;
    }
    if (event.outcome !== "completed") {
      verdict = { step: "cannot-run", reasons: [`run ended: ${event.outcome}`] };
      return undefined;
    }
    const { failures, testOutput } = await runChecks(spec, snap);
    const step = nextStep(failures, retriesUsed);
    const reasons = failures.map((f) => f.reason);
    if (step !== "retry") {
      verdict = { step, reasons };
      return undefined;
    }
    retriesUsed += 1;
    const content =
      `The worker sensors reran the checks and they failed:\n- ${reasons.join("\n- ")}\n\n` +
      `Last ${OUTPUT_TAIL_LINES} lines of \`${spec.tests}\`:\n\`\`\`\n${tail(testOutput, OUTPUT_TAIL_LINES)}\n\`\`\`\n` +
      "Fix these within files-allowed, then end with the four report headings again. This is the only retry.";
    return { entries: [{ type: "custom_message", customType: "worker-sensors", content, display: true }], continue: true };
  });

  pi.on("agent_settled", async () => {
    const final = verdict ?? { step: "cannot-run" as const, reasons: ["settle check never ran"] };
    const label = final.step.toUpperCase();
    process.stdout.write(`\nWORKER-SENSORS: ${label}${final.reasons.length ? ` ${final.reasons.join("; ")}` : ""}\n`);
    const reportPath = process.env.PI_WORKER_REPORT;
    if (reportPath) writeFileSync(reportPath, `${JSON.stringify({ verdict: label, reasons: final.reasons, retriesUsed })}\n`);
  });
}
