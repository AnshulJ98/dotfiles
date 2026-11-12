/**
 * Which repo files a bash call changed, found by effect: a `git status` snapshot before and after,
 * diffed by a pure function. Used by extensions/bash-changes.ts (a notice for the user) and
 * extensions/worker-sensors.ts (a note on the result when a worker leaves files-allowed).
 *
 * Sees only what git status shows: not ignored paths, not files outside the repo.
 */
import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { join } from "node:path";

const GIT_TIMEOUT_MS = 2000;
const MAX_LISTED = 8;

export interface FileState {
	/** The two-letter porcelain status, e.g. "??", " M", "A ". */
	status: string;
	/** Undefined when the path no longer exists on disk. */
	size?: number;
	mtimeMs?: number;
}

export interface Snapshot {
	root: string;
	head: string;
	/** Every dirty path, relative to the repo root. */
	files: Map<string, FileState>;
}

export interface Change {
	path: string;
	kind: "new" | "modified" | "deleted";
}

function git(cwd: string, args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", timeout: GIT_TIMEOUT_MS, maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] });
}

/** The dirty paths of `git status --porcelain -z` output, with their status codes. */
export function parsePorcelain(output: string): Array<{ status: string; path: string }> {
	const parts = output.split("\0");
	const entries: Array<{ status: string; path: string }> = [];
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (part.length < 4) continue;
		const status = part.slice(0, 2);
		entries.push({ status, path: part.slice(3) });
		// A rename or copy is followed by its source path as a separate entry.
		if (status.includes("R") || status.includes("C")) i++;
	}
	return entries;
}

/** The repo's dirty state at `cwd`, or undefined outside a repo or when git takes over 2 seconds. */
export function snapshot(cwd: string): Snapshot | undefined {
	try {
		const root = git(cwd, ["rev-parse", "--show-toplevel"]).trim();
		if (!root) return undefined;
		let head = "";
		try {
			head = git(root, ["rev-parse", "--verify", "-q", "HEAD"]).trim();
		} catch {
			// An unborn HEAD has no sha; "" still compares equal to itself.
		}
		const files = new Map<string, FileState>();
		for (const { status, path } of parsePorcelain(git(root, ["status", "--porcelain", "-z", "-uall"]))) {
			try {
				const stat = lstatSync(join(root, path));
				files.set(path, { status, size: stat.size, mtimeMs: stat.mtimeMs });
			} catch {
				files.set(path, { status });
			}
		}
		return { root, head, files };
	} catch {
		return undefined;
	}
}

function kindOf(state: FileState): Change["kind"] {
	if (state.size === undefined) return "deleted";
	if (state.status === "??" || state.status.includes("A")) return "new";
	return "modified";
}

/** What changed between two snapshots of one repo; a moved HEAD (commit, merge, checkout) is not an edit. */
export function changedBy(before: Snapshot, after: Snapshot): Change[] {
	if (before.head !== after.head) return [];
	const changes: Change[] = [];
	for (const [path, now] of after.files) {
		const was = before.files.get(path);
		if (!was || was.size !== now.size || was.mtimeMs !== now.mtimeMs) changes.push({ path, kind: kindOf(now) });
	}
	return changes;
}

/** `src/a.ts (+3 −1), new.ts (new), old.ts (deleted)`: at most 8 files, then `… and N more`. */
export function describe(changes: Change[], root: string): string {
	const shown = changes.slice(0, MAX_LISTED);
	const counts = new Map<string, string>();
	const modified = shown.filter((change) => change.kind === "modified").map((change) => change.path);
	if (modified.length) {
		try {
			for (const line of git(root, ["diff", "--numstat", "--no-renames", "-z", "HEAD", "--", ...modified]).split("\0")) {
				const [added, removed, ...path] = line.split("\t");
				if (path.length) counts.set(path.join("\t"), added === "-" ? "binary" : `+${added} \u2212${removed}`);
			}
		} catch {
			// No counts (unborn HEAD, git slow): the file is still named.
		}
	}
	const parts = shown.map((change) => `${change.path} (${change.kind === "modified" ? (counts.get(change.path) ?? "modified") : change.kind})`);
	if (changes.length > shown.length) parts.push(`\u2026 and ${changes.length - shown.length} more`);
	return parts.join(", ");
}
