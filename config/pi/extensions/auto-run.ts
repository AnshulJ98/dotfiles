/**
 * Auto-run guard: what plan.md's auto mode asks for, enforced in the session that orchestrates it.
 *
 * An auto run is in progress in every worktree whose root holds an AUTO.md (plan.md writes it;
 * config/git/bin/auto-guard keys on the same file). The run usually has its own worktree beside the
 * repo (bin/auto-slice start), so the session's checkout is rarely the run's. While a run exists:
 *   - edit and write are blocked for every file in a run's checkout except its AUTO.md, and in
 *     every slice/* worktree: a slice is done by a worker and fixed by a rework dispatch. The rest
 *     of the repo stays open, so another session in the main checkout is not caught.
 * For the run this session owns (the one in its own checkout, else the one whose AUTO.md carries
 * `session: <this session's id>`, stamped by bin/auto-slice):
 *   - after a bash call, uncommitted changes in the run's checkout are named in the result. That
 *     checkout only takes merges, so they are a hand edit or a merge that stopped.
 *   - a turn that ends with unticked slices and no `stopped:` line is sent back to them, at most
 *     MAX_NUDGES times in a row without a new tick, and never while a scout is still running.
 * With or without AUTO.md, `git worktree add` to a path inside the repo is blocked: worktrees go
 * beside it, made with `wt switch -c <branch>`.
 *
 * Not loaded in scout children (-ne); their limits are worker-sensors.ts and bin/guard/git.
 * Tripwires, not a sandbox: a bash write is seen only after the fact, and a `cd` in front of
 * `git worktree add` hides the path it resolves against.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { subjectOf } from "../lib/bash-log.ts";
import { logEvent } from "../lib/events.ts";

const MAX_NUDGES = 2;
const DIRTY_LINES = 10;

/** The unticked slice lines of an AUTO.md: `- [ ] 2. cache, branch slice/cache, ...`. */
export function openSlices(autoMd: string): string[] {
	return [...autoMd.matchAll(/^[ \t]*[-*] \[ \] (.*\bslice\/\S+.*)$/gm)].map((match) => match[1].trim());
}

/** True when the orchestrator recorded a stop: a line `stopped: <condition>`. */
export function isStopped(autoMd: string): boolean {
	return /^stopped:/m.test(autoMd);
}

/** The path a `git worktree add` in this command would create, and the directory it is relative to (`-C`). */
export function worktreeAddTarget(command: string): { path: string; base?: string } | undefined {
	const match = /\bgit\b([^;&|\n]*?)\sworktree\s+add\b([^;&|\n]*)/.exec(command);
	if (!match) return undefined;
	const words = (text: string): string[] => (text.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((word) => word.replace(/^(["'])(.*)\1$/, "$2"));
	const globals = words(match[1]);
	const at = globals.indexOf("-C");
	const base = at >= 0 ? globals[at + 1] : undefined;
	const args = words(match[2]);
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "-b" || args[i] === "-B" || args[i] === "--reason") i++;
		else if (!args[i].startsWith("-")) return { path: args[i], base };
	}
	return undefined;
}

/** The physical path of something that may not exist yet: its nearest existing ancestor resolved, the rest kept. */
export function physical(path: string): string {
	const rest: string[] = [];
	let at = resolve(path);
	while (!existsSync(at) && dirname(at) !== at) {
		rest.unshift(basename(at));
		at = dirname(at);
	}
	return join(realpathSync(at), ...rest);
}

const within = (path: string, root: string): boolean => path === root || path.startsWith(root + sep);
const expandHome = (path: string): string => (path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path);

function git(cwd: string, ...args: string[]): string | undefined {
	try {
		return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trimEnd();
	} catch {
		return undefined; // not a repo, or no git: nothing here applies
	}
}

interface Tree {
	root: string;
	branch: string;
}

/** Every worktree of the repo that holds `cwd`, as physical paths; undefined outside a repo. One git call, since it runs after every bash call. */
function worktrees(cwd: string): Tree[] | undefined {
	const listed = git(cwd, "worktree", "list", "--porcelain");
	if (listed === undefined) return undefined;
	const trees: Tree[] = [];
	for (const line of listed.split("\n")) {
		if (line.startsWith("worktree ")) trees.push({ root: physical(line.slice(9)), branch: "" });
		else if (line.startsWith("branch refs/heads/") && trees.length) trees[trees.length - 1].branch = line.slice(18);
	}
	return trees;
}

/** The roots that hold an AUTO.md: one auto run each. */
const runsIn = (trees: Tree[]): string[] => trees.map((tree) => tree.root).filter((root) => existsSync(join(root, "AUTO.md")));

/**
 * The run this session orchestrates: the one in its own checkout, else the one whose AUTO.md names
 * the session. Another session's run is closed to edits here but is not this session's to resume.
 */
export function ownRun(cwd: string, sessionId?: string): string | undefined {
	const trees = worktrees(cwd);
	if (!trees) return undefined;
	const runs = runsIn(trees);
	const here = physical(cwd);
	const home = trees.map((tree) => tree.root).filter((root) => within(here, root)).sort((a, b) => b.length - a.length)[0];
	if (home && runs.includes(home)) return home;
	if (!sessionId) return undefined;
	return runs.find((root) => readFileSync(join(root, "AUTO.md"), "utf8").split("\n").includes(`session: ${sessionId}`));
}

/** Why an edit or write of `target` is refused: it is in the checkout of an auto run, or in a slice worktree while one is on. */
export function editRefusal(target: string, cwd: string): string | undefined {
	const trees = worktrees(cwd);
	const runs = trees ? runsIn(trees) : [];
	if (!trees || runs.length === 0) return undefined;
	const path = physical(resolve(cwd, expandHome(target)));
	if (runs.some((root) => path === join(root, "AUTO.md"))) return undefined;
	if (!trees.some((tree) => (runs.includes(tree.root) || tree.branch.startsWith("slice/")) && within(path, tree.root))) return undefined;
	return (
		`Blocked: an auto run is in progress (AUTO.md), and ${target} is repo code in its checkout or a slice worktree. Slices are done by a worker and fixed by a rework dispatch ` +
		"(~/.pi/agent/bin/auto-slice dispatch), never by hand; the only file you edit is AUTO.md. If the run cannot go on, add `stopped: <condition>` to AUTO.md and report."
	);
}

/** Why a bash command is refused: it adds a worktree inside the repo. */
export function worktreeRefusal(command: string, cwd: string): string | undefined {
	const target = worktreeAddTarget(command);
	if (!target) return undefined;
	const base = resolve(cwd, expandHome(target.base ?? "."));
	const trees = worktrees(existsSync(base) ? base : cwd);
	if (!trees) return undefined;
	const path = physical(resolve(base, expandHome(target.path)));
	if (!trees.some((tree) => within(path, tree.root))) return undefined;
	return `Blocked: ${target.path} would put a worktree inside the repo. Worktrees go beside it: wt switch -c <branch> (it lands at ../<repo>.<branch>).`;
}

/** The uncommitted changes in this session's run checkout, AUTO.md aside; "" when clean or no run. */
export function dirtyDuringAuto(cwd: string, sessionId?: string): string {
	const run = ownRun(cwd, sessionId);
	if (!run) return "";
	return (git(run, "status", "--porcelain") ?? "").split("\n").filter((line) => line && line.slice(3) !== "AUTO.md").join("\n");
}

/** The message that sends a settling orchestrator back to its slices, or undefined when it may stop. */
export function nudge(cwd: string, scoutRunning: boolean, sessionId?: string): { open: number; content: string } | undefined {
	const run = ownRun(cwd, sessionId);
	if (!run || scoutRunning) return undefined;
	const autoMd = readFileSync(join(run, "AUTO.md"), "utf8");
	const open = openSlices(autoMd);
	if (isStopped(autoMd) || open.length === 0) return undefined;
	return {
		open: open.length,
		content:
			`${join(run, "AUTO.md")} still lists ${open.length} unticked slice${open.length === 1 ? "" : "s"}; the next is: ${open[0]}\n` +
			"The run is not finished and a progress note is not an ending. Carry on with that slice now: worktree, plan, dispatch, sensors, merge, tick. " +
			"If a stop condition from AUTO.md holds, add the line `stopped: <condition>` to AUTO.md and report per Long Runs instead.",
	};
}

function scoutRunning(): boolean {
	const running = join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "sessions", "scout", ".running");
	return existsSync(running) && readdirSync(running).some((name) => name.endsWith(".meta"));
}

export default function (pi: ExtensionAPI) {
	let nudges = 0;
	let openAtLastNudge = -1;
	let reportedDirty = "";

	pi.on("tool_call", async (event, ctx) => {
		const input = event.input as { path?: unknown; command?: unknown };
		let reason: string | undefined;
		if (event.toolName === "edit" || event.toolName === "write") reason = editRefusal(String(input.path ?? ""), process.cwd());
		else if (event.toolName === "bash") reason = worktreeRefusal(String(input.command ?? ""), process.cwd());
		if (reason) logEvent("auto.block", `${event.toolName} ${subjectOf(input)}`, ctx.sessionManager.getSessionId());
		return reason ? { block: true, reason } : undefined;
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const dirty = dirtyDuringAuto(process.cwd(), ctx.sessionManager.getSessionId());
		if (dirty === reportedDirty) return undefined;
		reportedDirty = dirty;
		if (!dirty) return undefined;
		const lines = dirty.split("\n");
		logEvent("auto.dirty", lines.slice(0, 3).join("; "), ctx.sessionManager.getSessionId());
		const note =
			`\n[auto-run] the checkout has uncommitted changes after this command:\n${lines.slice(0, DIRTY_LINES).join("\n")}` +
			(lines.length > DIRTY_LINES ? `\n… and ${lines.length - DIRTY_LINES} more` : "") +
			"\nAn auto run's checkout only takes merges. A hand edit is undone (git restore, git clean) and replaced by a rework dispatch; a merge that stopped is a stop condition.\n";
		// Codemode scripts get structuredContent, not content: bash's declared result there is { output, ... } (pi 1.5.2).
		const structured = event.structuredContent as { output?: unknown } | undefined;
		return {
			content: [...event.content, { type: "text" as const, text: note }],
			structuredContent: structured && typeof structured.output === "string" ? { ...structured, output: structured.output + note } : event.structuredContent,
		};
	});

	pi.on("agent_before_settle", async (event, ctx) => {
		if (event.outcome !== "completed") return undefined;
		const next = nudge(process.cwd(), scoutRunning(), ctx.sessionManager.getSessionId());
		if (!next) return undefined;
		if (next.open !== openAtLastNudge) nudges = 0;
		if (nudges >= MAX_NUDGES) return undefined;
		nudges += 1;
		openAtLastNudge = next.open;
		logEvent("auto.nudge", `${next.open} open, nudge ${nudges} of ${MAX_NUDGES}`, ctx.sessionManager.getSessionId());
		return { entries: [{ type: "custom_message", customType: "auto-run", content: next.content, display: true }], continue: true };
	});
}
