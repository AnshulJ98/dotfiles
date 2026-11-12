/**
 * Auto-run guard: what plan.md's auto mode asks for, enforced in the session that orchestrates it.
 *
 * An auto run is in progress while the checkout's root holds an AUTO.md (plan.md writes it;
 * config/git/bin/auto-guard keys on the same file). While it exists:
 *   - edit and write are blocked for every file in the repo or one of its worktrees except
 *     AUTO.md: a slice is done by a worker and fixed by a rework dispatch.
 *   - after a bash call, uncommitted changes in the checkout are named in the result. The
 *     orchestrator's checkout only takes merges, so they are a hand edit or a merge that stopped.
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

/** The checkout's root and every worktree root of its repo, as physical paths. */
function repoRoots(cwd: string): { top: string; roots: string[] } | undefined {
	const top = git(cwd, "rev-parse", "--show-toplevel");
	if (!top) return undefined;
	const listed = (git(cwd, "worktree", "list", "--porcelain") ?? "").split("\n").filter((line) => line.startsWith("worktree ")).map((line) => line.slice(9));
	return { top, roots: [...new Set([top, ...listed])] };
}

/** The checkout's root when an auto run is in progress there. One git call, since it runs after every bash call. */
function autoTop(cwd: string): string | undefined {
	const top = git(cwd, "rev-parse", "--show-toplevel");
	return top && existsSync(join(top, "AUTO.md")) ? top : undefined;
}

/** Why an edit or write of `target` is refused during an auto run, or undefined when it is fine. */
export function editRefusal(target: string, cwd: string): string | undefined {
	const repo = autoTop(cwd) && repoRoots(cwd);
	if (!repo) return undefined;
	const path = physical(resolve(cwd, expandHome(target)));
	if (path === join(repo.top, "AUTO.md") || !repo.roots.some((root) => within(path, root))) return undefined;
	return (
		`Blocked: an auto run is in progress (AUTO.md), and ${target} is repo code. Slices are done by a worker and fixed by a rework dispatch ` +
		"(~/.pi/agent/bin/scout --rw --spec -), never by hand; the only file you edit is AUTO.md. If the run cannot go on, add `stopped: <condition>` to AUTO.md and report."
	);
}

/** Why a bash command is refused: it adds a worktree inside the repo. */
export function worktreeRefusal(command: string, cwd: string): string | undefined {
	const target = worktreeAddTarget(command);
	if (!target) return undefined;
	const base = resolve(cwd, expandHome(target.base ?? "."));
	const repo = repoRoots(existsSync(base) ? base : cwd);
	if (!repo) return undefined;
	const path = physical(resolve(base, expandHome(target.path)));
	if (!repo.roots.some((root) => within(path, root))) return undefined;
	return `Blocked: ${target.path} would put a worktree inside the repo. Worktrees go beside it: wt switch -c <branch> (it lands at ../<repo>.<branch>).`;
}

/** The checkout's uncommitted changes during an auto run, AUTO.md aside; "" when clean or no run. */
export function dirtyDuringAuto(cwd: string): string {
	const top = autoTop(cwd);
	if (!top) return "";
	return (git(top, "status", "--porcelain") ?? "").split("\n").filter((line) => line && line.slice(3) !== "AUTO.md").join("\n");
}

/** The message that sends a settling orchestrator back to its slices, or undefined when it may stop. */
export function nudge(cwd: string, scoutRunning: boolean): { open: number; content: string } | undefined {
	const top = autoTop(cwd);
	if (!top || scoutRunning) return undefined;
	const autoMd = readFileSync(join(top, "AUTO.md"), "utf8");
	const open = openSlices(autoMd);
	if (isStopped(autoMd) || open.length === 0) return undefined;
	return {
		open: open.length,
		content:
			`AUTO.md still lists ${open.length} unticked slice${open.length === 1 ? "" : "s"}; the next is: ${open[0]}\n` +
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

	pi.on("tool_call", async (event) => {
		const input = event.input as { path?: unknown; command?: unknown };
		let reason: string | undefined;
		if (event.toolName === "edit" || event.toolName === "write") reason = editRefusal(String(input.path ?? ""), process.cwd());
		else if (event.toolName === "bash") reason = worktreeRefusal(String(input.command ?? ""), process.cwd());
		return reason ? { block: true, reason } : undefined;
	});

	pi.on("tool_result", async (event) => {
		if (event.toolName !== "bash") return undefined;
		const dirty = dirtyDuringAuto(process.cwd());
		if (dirty === reportedDirty) return undefined;
		reportedDirty = dirty;
		if (!dirty) return undefined;
		const lines = dirty.split("\n");
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

	pi.on("agent_before_settle", async (event) => {
		if (event.outcome !== "completed") return undefined;
		const next = nudge(process.cwd(), scoutRunning());
		if (!next) return undefined;
		if (next.open !== openAtLastNudge) nudges = 0;
		if (nudges >= MAX_NUDGES) return undefined;
		nudges += 1;
		openAtLastNudge = next.open;
		return { entries: [{ type: "custom_message", customType: "auto-run", content: next.content, display: true }], continue: true };
	});
}
