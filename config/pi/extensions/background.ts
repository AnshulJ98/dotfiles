// Based on pi-background 0.3.0 (github.com/Pringled/pi-extensions, MIT, Copyright (c) Thomas van Dongen).
// Local changes:
// - bin/scout runs are exempt from the bash timeout cap (see UNCAPPED).
// - A zero-token watchdog (decisions in lib/watchdog.ts). Foreground bash is overridden with the
//   same tool plus wrapped operations: a command with no output, CPU or network for FG_IDLE_MS has
//   its process group killed. bg_run jobs are never killed; a quiet one wakes Pi at most
//   BG_MAX_ALERTS times. Commands get $PI_HEARTBEAT, and bg_run takes a health command; declared
//   signals outrank inferred ones. Network evidence needs macOS nettop; without it nothing is killed.
// - bg_run instructions trimmed from ~4.1k to ~1.3k characters.
import { execFile } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	type BashOperations,
	createBashToolDefinition,
	createLocalBashOperations,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
	backgroundVerdict,
	type BackgroundState,
	describeQuiet,
	foregroundVerdict,
	heartbeatAge,
	isExempt,
	noteOutput,
	observe,
	type Reading,
	startTrack,
	type Track,
} from "../lib/watchdog.ts";

const run = promisify(execFile);

const TAIL_LINES = 20;
const TAIL_BYTES = 64 * 1024;
const BASH_DEFAULT_TIMEOUT = 120;
const BASH_MAX_TIMEOUT = 600;
// Scouts are child pi runs that routinely exceed the 10-minute cap; bin/scout bounds them itself
const UNCAPPED = /(^|[;&|(])\s*(\S*\/)?scout(\s|$)/;
const WAKE_DEBOUNCE_MS = 1000;
const MAX_WAKES = 10;
const MAX_SHOWN_JOBS = 3;
// How long finished results wait for jobs started alongside them before Pi is woken anyway
const GROUP_HOLD_MS = 2 * 60_000;
// Watchdog: one ps (+ nettop per group) per tick while anything is watched; ~15ms + ~10ms per group
const TICK_MS = 5_000;
const FG_IDLE_MS = 90_000;
const BG_IDLE_MS = 5 * 60_000;
const BG_BUSY_MS = 30 * 60_000;
const BG_MAX_ALERTS = 3;
const HEALTH_EVERY_MS = 30_000;
const HEALTH_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 3_000;

interface Job {
	id: string;
	command: string;
	log: string;
	started: number;
	controller: AbortController;
	status: "running" | "exited" | "killed" | "failed";
	exitCode?: number | null;
	ended?: number;
	// The latest output line, shown while the job runs
	lastLine?: string;
	// The turn that started the job; jobs from the same turn are reported together
	group: number;
	// Started with wake_on, so it may run indefinitely and doesn't hold back the others
	watched: boolean;
	watch: Watched;
	cwd: string;
	health?: string;
	/** performance.now() of the start and of the last health check. */
	startedMono: number;
	lastHealthAt: number;
	healthRunning: boolean;
	/** A health check has passed, so the service is up and a failure means it went down. */
	healthSeen: boolean;
	/** Result of the last finished check, consumed by the next tick. */
	healthResult?: boolean;
	alerts: BackgroundState;
}

/** A foreground bash command under the watchdog. */
interface Foreground {
	watch: Watched;
	exempt: boolean;
	/** Set when the watchdog killed it; appended to the command's output. */
	killed?: string;
}

/** A command under the watchdog: its shell writes its pid (= process group, Pi spawns detached) to pidfile. */
interface Watched {
	pidfile: string;
	heartbeat: string;
	pgid?: number;
	track: Track;
}

function parseCpu(time: string): number {
	// ps TIME: [[dd-]hh:]mm:ss.cc
	return time.replace(/^\d+-/, "").split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

/** One ps for every watched group, plus nettop per group. undefined when ps fails: no evidence. */
async function sample(pgids: number[]): Promise<Map<number, Reading | undefined> | undefined> {
	let stdout: string;
	try {
		({ stdout } = await run("ps", ["-A", "-o", "pid=,ppid=,pgid=,time="], { timeout: PROBE_TIMEOUT_MS }));
	} catch {
		return undefined;
	}
	const rows = stdout
		.trim()
		.split("\n")
		.map((line) => line.trim().split(/\s+/))
		.map(([pid, ppid, pgid, time]) => ({ pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), cpu: parseCpu(time ?? "0") }));
	const readings = new Map<number, Reading | undefined>();
	for (const root of pgids) {
		// The group, plus descendants that left it (setsid children of the command)
		const ids = new Set([root]);
		for (let grew = true; grew; ) {
			grew = false;
			for (const row of rows) {
				if (!ids.has(row.pid) && (ids.has(row.ppid) || row.pgid === root)) {
					ids.add(row.pid);
					grew = true;
				}
			}
		}
		const mine = rows.filter((row) => ids.has(row.pid));
		if (mine.length === 0) {
			readings.set(root, undefined);
			continue;
		}
		let net: number | undefined;
		try {
			// -n: no DNS lookups; without it one call takes ~5s instead of ~10ms
			const args = ["-P", "-L", "1", "-x", "-n", "-J", "bytes_in,bytes_out", ...mine.flatMap((row) => ["-p", String(row.pid)])];
			const { stdout: table } = await run("nettop", args, { timeout: PROBE_TIMEOUT_MS });
			net = table
				.split("\n")
				.slice(1)
				.reduce((sum, line) => {
					const [, bytesIn, bytesOut] = line.split(",");
					return sum + (Number(bytesIn) || 0) + (Number(bytesOut) || 0);
				}, 0);
		} catch {
			net = undefined;
		}
		const cpu = mine.reduce((sum, row) => sum + row.cpu, 0);
		readings.set(root, { cpu, pids: mine.map((row) => row.pid).sort((a, b) => a - b).join(","), net });
	}
	return readings;
}

function mtime(path: string): number | undefined {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return undefined;
	}
}

function readPgid(watch: Watched): number | undefined {
	if (watch.pgid) return watch.pgid;
	try {
		const pid = Number(readFileSync(watch.pidfile, "utf8"));
		if (Number.isInteger(pid) && pid > 1) watch.pgid = pid;
	} catch {
		// The shell hasn't written it yet
	}
	return watch.pgid;
}

function quote(path: string): string {
	return `'${path.replace(/'/g, `'\\''`)}'`;
}

/** Prepended inside the operations, so neither the model nor the UI sees it. */
function watchPrefix(watch: Watched): string {
	return `printf %s $$ > ${quote(watch.pidfile)}; export PI_HEARTBEAT=${quote(watch.heartbeat)}\n`;
}


function tail(path: string, lines: number): string {
	try {
		const text = readFileSync(path).subarray(-TAIL_BYTES).toString("utf8");
		return text.trimEnd().split("\n").slice(-lines).join("\n") || "(no output)";
	} catch {
		return "(no output)";
	}
}

function elapsed(job: Job): string {
	const s = Math.round(((job.ended ?? Date.now()) - job.started) / 1000);
	return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

function summary(job: Job): string {
	const state = job.status === "exited" ? `exit ${job.exitCode}` : job.status;
	return `${job.id} [${state}, ${elapsed(job)}] ${job.command}\n  log: ${job.log}`;
}

/** The part of a command worth showing: its first line, without a leading cd and with a script path shortened to its name. */
function shownCommand(command: string): string {
	return command
		.split("\n")[0]
		.replace(/^\s*(cd\s+("[^"]*"|'[^']*'|\S+)\s*(&&|;)\s*)+/, "")
		.replace(/^\S*\/(?=[^\s/]+(\s|$))/, "");
}

/** True when a command starts a job with a bare & (not &&, 2>&1, &> or |&). */
function startsBackgroundJob(command: string): boolean {
	return /&/.test(command.replace(/&&|[0-9]*>&[0-9-]*|&>>?|\|&/g, ""));
}

/** Compiles wake_on, accepting Python's (?i) prefix that models often write but JavaScript only takes as a flag. */
function wakePattern(source: string): RegExp {
	const insensitive = source.startsWith("(?i)");
	return new RegExp(insensitive ? source.slice(4) : source, insensitive ? "i" : "");
}

export default function (pi: ExtensionAPI) {
	// Pi's bash has no default timeout, so a stuck or polling command blocks until interrupted; cap it like Claude Code
	// does. A timeout SIGKILLs the command's whole process group, which would include jobs it started with &, so a
	// command that backgrounds something is never timed out, even if the model asked for a timeout.
	pi.on("tool_call", async (event) => {
		if (event.toolName !== "bash") return;
		const input = event.input as { command?: string; timeout?: number };
		const command = String(input.command ?? "");
		if (UNCAPPED.test(command)) return;
		if (startsBackgroundJob(command)) delete input.timeout;
		else input.timeout = Math.min(input.timeout ?? BASH_DEFAULT_TIMEOUT, BASH_MAX_TIMEOUT);
	});

	const jobs = new Map<string, Job>();
	const ops = createLocalBashOperations();
	let next = 1;

	// Steered, not a follow-up: a running turn sees the message before its next model call, instead of finishing (often
	// after reading the exit with bg_status) and then taking a second turn just to repeat it. Idle, it starts a turn.
	const wake = (content: string, details: { headline: string; last: string; error: boolean }, triggerTurn = true) =>
		pi.sendMessage({ customType: "background-job", content, display: true, details }, { triggerTurn, deliverAs: "steer" });

	// Jobs started in the same turn usually belong together, like several benchmarks to compare. While some of them
	// still run, a successful one's result is added to the conversation without waking Pi, so it answers once at the
	// end instead of after each job. A job that runs on too long doesn't hold the others back for more than GROUP_HOLD_MS.
	let turn = 0;
	pi.on("turn_start", async () => {
		turn++;
	});
	const holds = new Map<number, NodeJS.Timeout>();
	const runningInGroup = (job: Job) =>
		[...jobs.values()].filter((other) => other !== job && other.group === job.group && other.status === "running" && !other.watched);
	const report = (job: Job, content: string, details: { headline: string; last: string; error: boolean }) => {
		const others = job.watched ? [] : runningInGroup(job);
		// A failure wakes Pi straight away, so it can react before the rest of the group finishes
		if (others.length === 0 || details.error) {
			clearTimeout(holds.get(job.group));
			holds.delete(job.group);
			return wake(content, details);
		}
		wake(`${content}\n(Still running from the same turn: ${others.map((other) => other.id).join(", ")}; you'll be woken when they finish.)`, details, false);
		if (holds.has(job.group)) return;
		const hold = setTimeout(() => {
			holds.delete(job.group);
			const still = runningInGroup(job);
			if (still.length === 0) return;
			wake(`Background jobs from the same turn are still running after ${GROUP_HOLD_MS / 60_000} minutes: ${still.map((other) => other.id).join(", ")}. The results of the ones that finished are above; you'll get a message when each of these finishes.`, {
				headline: `${still.map((other) => other.id).join(", ")} still running`,
				last: "",
				error: false,
			});
		}, GROUP_HOLD_MS);
		// The jobs it waits on keep pi alive themselves; the hold alone must not keep a -p run from exiting
		hold.unref();
		holds.set(job.group, hold);
	};

	// Wakes the agent with output lines matching pattern, batched per second and capped per job
	const watcher = (job: Job, pattern: RegExp) => {
		let partial = "";
		let pending: string[] = [];
		let timer: NodeJS.Timeout | undefined;
		let wakes = 0;
		const flush = () => {
			timer = undefined;
			// Once the job has ended, its final message carries the log tail instead
			if (job.status !== "running") return;
			wakes++;
			const capped = wakes === MAX_WAKES ? `\n(Reached ${MAX_WAKES} wake-ups; further matches are ignored, use bg_status to check.)` : "";
			wake(`Background job ${job.id} output matched /${pattern.source}/ (still running):\n${pending.slice(-TAIL_LINES).join("\n")}${capped}`, {
				headline: `${job.id} matched /${pattern.source}/`,
				last: pending[pending.length - 1] ?? "",
				error: false,
			});
			pending = [];
		};
		return (data: Buffer) => {
			if (wakes >= MAX_WAKES) return;
			const lines = (partial + data.toString("utf8")).split(/\r?\n|\r/);
			partial = lines.pop() ?? "";
			const hits = lines.filter((line) => pattern.test(line));
			if (hits.length === 0) return;
			pending.push(...hits);
			timer ??= setTimeout(flush, WAKE_DEBOUNCE_MS);
		};
	};

	// One line per running job above the input, with its elapsed time and latest output
	let ui: ExtensionContext["ui"] | undefined;
	const running = () => [...jobs.values()].filter((job) => job.status === "running");
	// "full" (the default), "compact" without the output, or "off", set with "background": { "jobs": ... } in pi's settings.json
	const jobsLine = () => (pi.getSettings() as { background?: { jobs?: string } }).background?.jobs ?? "full";
	const showJobs = () => {
		if (!ui) return;
		if (jobsLine() === "off" || running().length === 0) return ui.setWidget("background-jobs", undefined);
		ui.setWidget("background-jobs", (tui, theme) => {
			const timer = setInterval(() => tui.requestRender(), 1000);
			return {
				dispose: () => clearInterval(timer),
				invalidate() {},
				render(width: number) {
					const live = running();
					const lines = live.slice(0, MAX_SHOWN_JOBS).map((job) => {
						const command = shownCommand(job.command);
						const quiet = describeQuiet(job.watch.track, performance.now(), TICK_MS);
						const text =
							theme.fg("accent", " ⏵ ") +
							theme.fg("toolTitle", `${job.id} ${command.length > 50 ? `${command.slice(0, 49)}…` : command}`) +
							theme.fg("dim", ` · ${elapsed(job)}`) +
							(quiet ? theme.fg("warning", ` · ${quiet}`) : "") +
							theme.fg("dim", jobsLine() === "full" && job.lastLine ? ` · ${job.lastLine}` : "");
						return truncateToWidth(text, width);
					});
					if (live.length > MAX_SHOWN_JOBS) lines.push(theme.fg("dim", `   and ${live.length - MAX_SHOWN_JOBS} more`));
					return lines;
				},
			};
		});
	};

	// Watchdog: one sampler for foreground commands and running jobs, active only while something is watched
	const foreground = new Set<Foreground>();
	const watchDir = join(tmpdir(), "pi-bg");
	let fgCount = 0;
	let sampler: NodeJS.Timeout | undefined;
	let sampling = false;

	const newWatch = (name: string): Watched => {
		mkdirSync(watchDir, { recursive: true });
		const base = join(watchDir, `${process.pid}-${name}`);
		rmSync(`${base}.hb`, { force: true });
		return { pidfile: `${base}.pid`, heartbeat: `${base}.hb`, track: startTrack(performance.now(), Date.now()) };
	};
	const dropWatch = (watch: Watched) => {
		rmSync(watch.pidfile, { force: true });
		rmSync(watch.heartbeat, { force: true });
	};
	const ensureSampler = () => {
		const busy = foreground.size > 0 || running().length > 0;
		if (busy && !sampler) {
			sampler = setInterval(() => void tick(), TICK_MS);
			sampler.unref();
		} else if (!busy && sampler) {
			clearInterval(sampler);
			sampler = undefined;
		}
	};
	const runHealth = (job: Job, command: string) => {
		job.healthRunning = true;
		job.lastHealthAt = performance.now();
		run("/bin/bash", ["-c", command], { cwd: job.cwd, timeout: HEALTH_TIMEOUT_MS })
			.then(
				() => true,
				() => false,
			)
			.then((ok) => {
				job.healthRunning = false;
				if (ok) job.healthSeen = true;
				// A service still starting up fails its check; that only counts once it has passed or BG_IDLE_MS went by
				if (ok || job.healthSeen || performance.now() - job.startedMono >= BG_IDLE_MS) job.healthResult = ok;
			});
	};
	const judgeForeground = (fg: Foreground, now: number, wallNow: number) => {
		const pgid = fg.watch.pgid;
		if (fg.killed || !pgid || pgid <= 1 || pgid === process.pid) return;
		const beat = heartbeatAge(mtime(fg.watch.heartbeat), fg.watch.track, wallNow);
		if (foregroundVerdict(fg.watch.track, { now, idleMs: FG_IDLE_MS, heartbeatAgeMs: beat, exempt: fg.exempt }) !== "kill") return;
		const secs = FG_IDLE_MS / 1000;
		fg.killed = beat !== undefined ? `killed: no $PI_HEARTBEAT touch for ${secs}s` : `killed: idle ${secs}s (no output/CPU/network)`;
		try {
			process.kill(-pgid, "SIGKILL");
		} catch {
			// Already gone
		}
	};
	const judgeJob = (job: Job, now: number, wallNow: number) => {
		const beat = heartbeatAge(mtime(job.watch.heartbeat), job.watch.track, wallNow);
		const healthy = job.healthResult;
		job.healthResult = undefined;
		if (job.health && !job.healthRunning && now - job.lastHealthAt >= HEALTH_EVERY_MS) runHealth(job, job.health);
		const declared = beat !== undefined || job.health !== undefined;
		const result = backgroundVerdict(job.watch.track, job.alerts, {
			now,
			idleMs: BG_IDLE_MS,
			busyMs: BG_BUSY_MS,
			maxWakes: BG_MAX_ALERTS,
			heartbeatAgeMs: beat,
			healthy,
			inferred: !declared && !job.watched,
		});
		job.alerts = result.state;
		if (!result.alert) return;
		const last = result.state.wakes >= BG_MAX_ALERTS ? " This is the last watchdog alert for this job." : "";
		wake(
			`Watchdog: background job ${job.id} is still running, but ${result.alert}. It was not stopped.${last}\n${summary(job)}\nLast lines:\n${tail(job.log, 5)}\nCheck it with bg_status and stop it with bg_kill if it is stuck; otherwise carry on.`,
			{ headline: `${job.id} ${result.alert}`, last: job.lastLine ?? "", error: healthy === false },
		);
	};
	const tick = async () => {
		if (sampling) return;
		sampling = true;
		try {
			const live = running();
			const watches = [...[...foreground].map((fg) => fg.watch), ...live.map((job) => job.watch)];
			const pgids = watches.map(readPgid).filter((pgid): pgid is number => pgid !== undefined);
			const readings = await sample(pgids);
			const now = performance.now();
			const wallNow = Date.now();
			for (const watch of watches) {
				const reading = watch.pgid !== undefined ? readings?.get(watch.pgid) : undefined;
				watch.track = observe(watch.track, reading, now, wallNow, TICK_MS);
			}
			for (const fg of foreground) judgeForeground(fg, now, wallNow);
			for (const job of live) if (job.status === "running") judgeJob(job, now, wallNow);
		} finally {
			sampling = false;
		}
	};

	// Pi's own bash tool and renderer, with operations that add the watchdog. Commands that start a & job are left
	// alone, like the timeout above: killing their group would kill the job.
	const watchedOps: BashOperations = {
		exec: async (command, cwd, options) => {
			if (startsBackgroundJob(command)) return ops.exec(command, cwd, options);
			const fg: Foreground = { watch: newWatch(`fg${++fgCount}`), exempt: isExempt(command) };
			foreground.add(fg);
			ensureSampler();
			try {
				const onData = (data: Buffer) => {
					fg.watch.track = noteOutput(fg.watch.track, performance.now());
					options.onData(data);
				};
				const result = await ops.exec(watchPrefix(fg.watch) + command, cwd, { ...options, onData });
				if (fg.killed) options.onData(Buffer.from(`\n[watchdog] ${fg.killed}\n`));
				return result;
			} finally {
				foreground.delete(fg);
				dropWatch(fg.watch);
				ensureSampler();
			}
		},
	};
	pi.registerTool(createBashToolDefinition(process.cwd(), { operations: watchedOps }));

	const find = (id: string): Job => {
		const job = jobs.get(id);
		if (!job) throw new Error(`No background job ${id}; known: ${[...jobs.keys()].join(", ") || "none"}`);
		return job;
	};

	// Compact, Claude-Code-style rows instead of pi's default boxed tool and message rendering
	pi.registerMessageRenderer("background-job", (message, { expanded }, theme) => {
		const d = (message.details ?? {}) as { headline?: string; last?: string; error?: boolean };
		const head = theme.fg(d.error ? "error" : "success", "● ") + theme.fg("toolTitle", `Background ${d.headline ?? ""}`);
		const body = expanded ? String(message.content) : (d.last ?? "");
		// One column in, so the ● lines up with polish-chrome's ❯/● markers
		return new Text(`${head}\n${theme.fg("dim", `  └ ${body.replace(/\n/g, "\n    ")}`)}`, 1, 0);
	});
	const row = (theme: any, text: string, context: any) => {
		const color = context.isError ? "error" : context.executionStarted && context.isPartial ? "accent" : "success";
		return new Text(theme.fg(color, "● ") + theme.fg("toolTitle", text), 0, 0);
	};
	const note = (theme: any, result: any, expanded: boolean) => {
		const text = result.content?.map((c: any) => c.text ?? "").join("\n") ?? "";
		// Collapsed: first sentence only ("Started bg1"), without the log path
		const short = text.split("\n")[0].split(";")[0];
		return new Text(theme.fg("dim", `  └ ${(expanded ? text : short).replace(/\n/g, "\n    ")}`), 0, 0);
	};

	pi.registerTool({
		name: "bg_run",
		label: "Background",
		description: "Start a shell command in the background and return immediately with a job id. Output goes to a log file.",
		promptSnippet: "Run long shell commands (downloads, builds, long test suites) in the background",
		promptGuidelines: [
			"Use bg_run instead of bash for anything that may take longer than about 2 minutes: large downloads and installs, builds, full test suites, training, benchmarks, servers and watchers. Keep bash for quick commands whose output you need now.",
			"After bg_run, continue with independent work or end your turn; the exit code and log tail arrive automatically. Never sleep, poll or tail a log to wait, in bash or bg_run; pass wake_on with a regex (such as 'listening on|Traceback') to be woken when a line appears.",
			"Don't redirect a bg_run command's output (> file, 2>&1, nohup) or start long processes with & in bash: bg_run logs everything, and redirecting hides progress from the user and from wake_on.",
			"Keepalive: a job that is silent for minutes by design should touch \"$PI_HEARTBEAT\" now and then, or pass health (a quick command that exits 0 while the job is fine); otherwise a quiet, idle job wakes you to check on it. A foreground bash command with no output, CPU or network for 90 seconds is killed.",
			`bash commands time out after ${BASH_DEFAULT_TIMEOUT / 60} minutes unless you pass timeout (at most ${BASH_MAX_TIMEOUT / 60} minutes).`,
			"bg_run starts after the other tool calls in the same reply finish. Use bg_status to check a job and bg_kill to stop one.",
		],
		// Runs after the edits in the same reply, so the job starts from the code pi just wrote
		executionMode: "sequential",
		renderShell: "self",
		renderCall: (args: any, theme, context) => row(theme, `Background $ ${String(args?.command ?? "").split("\n")[0]}`, context),
		renderResult: (result, { expanded }, theme) => note(theme, result, expanded),
		parameters: Type.Object({
			command: Type.String({ description: "Shell command to run" }),
			cwd: Type.Optional(Type.String({ description: "Working directory (defaults to the session cwd)" })),
			wake_on: Type.Optional(
				Type.String({
					description: "Regex; also wake you while the job runs whenever an output line matches, e.g. 'listening on|ready' or 'epoch \\d+'. Matches within a second are batched; at most 10 wake-ups per job.",
				}),
			),
			health: Type.Optional(
				Type.String({
					description: "Shell command run every 30s in the job's cwd that exits 0 while the job is fine, e.g. 'curl -sf localhost:8000/health'. A failure after it once passed (or after 5 minutes) wakes you.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const pattern = params.wake_on ? wakePattern(params.wake_on) : undefined;
			const id = `bg${next++}`;
			const dir = join(tmpdir(), "pi-bg");
			mkdirSync(dir, { recursive: true });
			const log = join(dir, `${process.pid}-${id}.log`);
			const out = createWriteStream(log);
			const cwd = params.cwd ?? ctx.cwd;
			const startedMono = performance.now();
			const job: Job = {
				id,
				command: params.command,
				log,
				started: Date.now(),
				controller: new AbortController(),
				status: "running",
				group: turn,
				watched: Boolean(pattern),
				watch: newWatch(`${id}`),
				cwd,
				health: params.health?.trim() || undefined,
				startedMono,
				lastHealthAt: startedMono,
				healthRunning: false,
				healthSeen: false,
				alerts: { wakes: 0, lastWakeAt: 0, unhealthy: false },
			};
			jobs.set(id, job);

			const watch = pattern ? watcher(job, pattern) : undefined;
			const onData = (d: Buffer) => {
				out.write(d);
				job.watch.track = noteOutput(job.watch.track, performance.now());
				watch?.(d);
				// Progress bars redraw with \r, so the last segment of either kind of line break is the current state
				const last = d.toString("utf8").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").split(/\r\n|\r|\n/).map((line) => line.trim()).filter(Boolean).at(-1);
				if (last) job.lastLine = last;
			};

			// Output goes to a pipe, where Python would buffer prints until it exits; unbuffered, the latest line and wake_on stay live
			ops.exec(`${watchPrefix(job.watch)}export PYTHONUNBUFFERED=1; ${params.command}`, cwd, { onData, signal: job.controller.signal })
				.then(({ exitCode }) => {
					job.status = "exited";
					job.exitCode = exitCode;
				})
				.catch((err: Error) => {
					job.status = job.controller.signal.aborted ? "killed" : "failed";
					out.write(`\n[bg] ${err.message}\n`);
				})
				.finally(() => {
					job.ended = Date.now();
					dropWatch(job.watch);
					ensureSampler();
					showJobs();
					out.end(() => {
						// A kill from session shutdown has no session left to notify
						if (job.status === "killed" && !jobs.has(id)) return;
						report(job, `Background job finished: ${summary(job)}\nLast lines:\n${tail(log, TAIL_LINES)}`, {
							headline: `${id} ${job.status === "exited" ? `exited ${job.exitCode}` : job.status} · ${elapsed(job)}`,
							last: tail(log, 1),
							error: job.status !== "exited" || job.exitCode !== 0,
						});
					});
				});

			if (ctx.mode === "tui") ui = ctx.ui;
			ensureSampler();
			showJobs();
			return { content: [{ type: "text", text: `Started ${id}; log: ${log}. You will be notified when it exits.` }], details: { id, log } };
		},
	});

	pi.registerTool({
		name: "bg_status",
		label: "Background status",
		description: "List background jobs, or show one job's state and the tail of its log.",
		renderShell: "self",
		renderCall: (args: any, theme, context) => row(theme, `Background status ${args?.id ?? "(all)"}`, context),
		renderResult: (result, { expanded }, theme) => note(theme, result, expanded),
		parameters: Type.Object({
			id: Type.Optional(Type.String({ description: "Job id such as bg1; omit to list all jobs" })),
			lines: Type.Optional(Type.Number({ description: `Log lines to show (default ${TAIL_LINES})` })),
		}),
		async execute(_toolCallId, params) {
			if (!params.id) {
				const text = [...jobs.values()].map(summary).join("\n") || "No background jobs.";
				return { content: [{ type: "text", text }], details: {} };
			}
			const job = find(params.id);
			return { content: [{ type: "text", text: `${summary(job)}\n${tail(job.log, params.lines ?? TAIL_LINES)}` }], details: {} };
		},
	});

	pi.registerTool({
		name: "bg_kill",
		label: "Background kill",
		description: "Stop a running background job and its child processes.",
		renderShell: "self",
		renderCall: (args: any, theme, context) => row(theme, `Background kill ${args?.id ?? ""}`, context),
		renderResult: (result, { expanded }, theme) => note(theme, result, expanded),
		parameters: Type.Object({ id: Type.String({ description: "Job id such as bg1" }) }),
		async execute(_toolCallId, params) {
			const job = find(params.id);
			if (job.status !== "running") return { content: [{ type: "text", text: `${job.id} already ${job.status}` }], details: {} };
			job.controller.abort();
			return { content: [{ type: "text", text: `Stopping ${job.id}` }], details: {} };
		},
	});

	pi.on("session_shutdown", async () => {
		if (sampler) clearInterval(sampler);
		sampler = undefined;
		for (const timer of holds.values()) clearTimeout(timer);
		holds.clear();
		for (const job of jobs.values()) {
			if (job.status === "running") job.controller.abort();
		}
		jobs.clear();
	});
}
