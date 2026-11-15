#!/usr/bin/env node
// run.ts: long multi-prompt pi sessions for the compaction/memory eval, one pi process per session in RPC mode.
//   node run.ts seed [--model M] [--thinking T]
//       steps 1,2 with no blackhole; saves seed/session.jsonl + seed/meta.json + seed/steps/*.out
//   node run.ts arm <arm> --run <id> --drop <item-id> --compact-at <tokens> [--steps 3,4,5,recall]
//       copies the seed session, runs the arm's setup commands (arms/<arm>/setup.md, one slash command per line,
//       {{COMPACT_AT}} filled), warm-up turn, waits WARM_MS so memory workers can catch up, then the steps.
//       An arm with arms/<arm>/pi-blackhole-config.json loads pi-blackhole; one without runs pi's own compaction.
//       Snapshots the session after every compaction (for probe.ts). Results: results/<id>/<arm>/.
// Work dirs (repo clone, throwaway HOME, live session) live in /tmp/agent-eval-long/<id>/<arm>/ and are not kept.
// Env: WARM_MS (180000), THINK_MS (45000), STEP_TIMEOUT_MIN (60), BUDGET ($ per session, 25), EVAL_REAL_HOME,
//      LONG_TASKS (prompt dir, default tasks/; the smoke-test seam).
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fillTemplate, rewritePaths, sessionCosts, usageTotals } from "./lib.ts";

const LONG = import.meta.dirname;
const EVAL = path.dirname(LONG);
const REAL_HOME = process.env.EVAL_REAL_HOME ?? process.env.HOME ?? "";
const REPO_SRC = path.join(REAL_HOME, "Dev/dotfiles");
const COMMIT = "822eee5";
const QUIET_MS = 15000;
const num = (v: string | undefined, d: number) => (v === undefined ? d : Number(v));
const WARM_MS = num(process.env.WARM_MS, 180000);
const THINK_MS = num(process.env.THINK_MS, 45000);
const STEP_TIMEOUT_MS = num(process.env.STEP_TIMEOUT_MIN, 60) * 60000;
const BUDGET = num(process.env.BUDGET, 25);

interface SeedMeta { repo: string; home: string; commit: string; model: string; thinking: string; lines: number; contextTokens: number | null; createdAt: string }
interface Step { id: string; message: string; command?: boolean } // command: a slash command, no agent run to wait for
interface StepRow { step: string; status: string; secs: number; turns: number; cost: number | null; ctx: number | null; compactions: number }
interface RpcRecord {
	type: string; id?: string; success?: boolean; error?: string; data?: { cost?: number; contextUsage?: { tokens?: number }; sessionFile?: string; disposition?: string };
	reason?: string; result?: { tokensBefore?: number; estimatedTokensAfter?: number; summary?: string } | null; aborted?: boolean; errorMessage?: string;
	message?: { role?: string; content?: unknown; stopReason?: string; errorMessage?: string }; method?: string; title?: string; notifyType?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd: string, args: string[], cwd?: string) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function prepRepo(repo: string, projectFiles: Record<string, string>): void {
	fs.rmSync(repo, { recursive: true, force: true });
	sh("git", ["clone", "-q", "--local", REPO_SRC, repo]);
	sh("git", ["-C", repo, "checkout", "-q", COMMIT]);
	fs.mkdirSync(path.join(repo, ".pi"), { recursive: true });
	for (const [name, body] of Object.entries(projectFiles)) fs.writeFileSync(path.join(repo, ".pi", name), body);
	fs.mkdirSync(path.join(repo, ".git/info"), { recursive: true }); // a --local clone may have no info/
	fs.appendFileSync(path.join(repo, ".git/info/exclude"), ".pi/\n");
}

const newestSession = (dir: string): string | null => {
	const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
	return files.length ? path.join(dir, files[files.length - 1]) : null;
};

interface SessionOpts { repo: string; home: string; sessDir: string; out: string; flags: string[]; env: Record<string, string>; cont: boolean; model: string; thinking: string; compactions0?: number }
// Three Opus arms in parallel hit the account rate limit (r2); pi's default retry (3 tries from 2s) gives up within ~15s.
// Retries 15s, 30s, 60s x5: about 6 minutes of backoff before a step fails.
const PROJECT_SETTINGS = JSON.stringify({ retry: { maxRetries: 8, baseDelayMs: 15000 } }, null, 2) + "\n";

/** Drive one pi RPC process through the steps; returns per-step rows. Writes events, step replies and snapshots under out. */
/** settings.json names extensions as ~/Dev/dotfiles/...; under isolate.sh's throwaway HOME that path must exist or pi
 *  silently skips them (compact-cap, prime-reminder, scout, ...). The link is read-only in practice: sandbox.sb denies
 *  writes under the real home. */
export function linkDotfiles(home: string): void {
	const link = path.join(home, "Dev/dotfiles");
	if (fs.existsSync(link)) return;
	fs.mkdirSync(path.dirname(link), { recursive: true });
	fs.symlinkSync(REPO_SRC, link);
}

async function runSession(o: SessionOpts, steps: Step[], afterStep: (s: Step) => Promise<void>): Promise<StepRow[]> {
	fs.mkdirSync(path.join(o.out, "snapshots"), { recursive: true });
	linkDotfiles(o.home);
	const evPath = path.join(o.out, "events.jsonl");
	const evlog = (r: object) => fs.appendFileSync(evPath, JSON.stringify({ t: Date.now(), ...r }) + "\n");
	// lastError: the newest assistant message ended with stopReason "error" (retries exhausted); a step settling on it failed.
	const st = { running: false, compacting: false, started: false, last: Date.now(), compactions: o.compactions0 ?? 0, turns: 0, lastText: "", lastError: "", exited: false };
	const pending = new Map<string, (r: RpcRecord) => void>();
	let seq = 0;
	const envArgs = Object.entries(o.env).map(([k, v]) => k + "=" + v);
	const child = spawn("bash", [path.join(EVAL, "lib/isolate.sh"), o.home, "env", ...envArgs,
		"sandbox-exec", "-D", "REAL_HOME=" + REAL_HOME, "-f", path.join(LONG, "sandbox.sb"),
		"pi", "--mode", "rpc", "-a", ...o.flags, "--model", o.model, "--thinking", o.thinking, "--session-dir", o.sessDir, ...(o.cont ? ["-c"] : [])],
		{ cwd: o.repo, stdio: ["pipe", "pipe", fs.openSync(path.join(o.out, "stderr.txt"), "a")] });
	const snapshot = () => {
		const f = newestSession(o.sessDir);
		if (f) fs.copyFileSync(f, path.join(o.out, "snapshots", "c" + st.compactions + ".jsonl"));
	};
	const onRecord = (r: RpcRecord) => {
		if (r.type === "response" && r.id) { const p = pending.get(r.id); if (p) { pending.delete(r.id); p(r); } return; }
		if (r.type === "message_update" || r.type === "tool_execution_update") return;
		if (r.type !== "extension_ui_request") st.last = Date.now();
		switch (r.type) {
			case "agent_start": st.running = true; st.started = true; break;
			case "agent_settled": st.running = false; break;
			case "compaction_start": st.compacting = true; evlog({ type: r.type, reason: r.reason }); break;
			case "compaction_end": {
				st.compacting = false;
				if (r.result) { st.compactions++; setTimeout(snapshot, 1500); }
				evlog({ type: r.type, reason: r.reason, ok: !!r.result, aborted: r.aborted, error: r.errorMessage, tokensBefore: r.result?.tokensBefore, after: r.result?.estimatedTokensAfter, summaryChars: r.result?.summary?.length });
				if (r.result?.summary) fs.writeFileSync(path.join(o.out, "compaction" + st.compactions + ".md"), r.result.summary);
				break;
			}
			case "turn_end": st.turns++; break;
			case "message_end": {
				const m = r.message;
				if (m?.role === "assistant" && Array.isArray(m.content)) {
					const t = (m.content as Array<{ type?: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
					if (t.trim()) st.lastText = t;
					if (m.stopReason === "error") { st.lastError = String(m.errorMessage ?? "unknown").slice(0, 120); evlog({ type: "assistant_error", error: m.errorMessage }); }
					else st.lastError = "";
				}
				break;
			}
			case "extension_ui_request":
				if (["select", "confirm", "input", "editor"].includes(r.method ?? "")) {
					evlog({ type: "ui_dialog_cancelled", method: r.method, title: r.title });
					child.stdin.write(JSON.stringify({ type: "extension_ui_response", id: r.id, cancelled: true }) + "\n");
				} else if (r.method === "notify") evlog({ type: "notify", level: r.notifyType, message: (r as { message?: unknown }).message });
				break;
			case "auto_retry_start": case "auto_retry_end": evlog({ type: r.type, error: r.errorMessage }); break;
		}
	};
	let buf = "";
	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (d: string) => {
		buf += d;
		for (let i; (i = buf.indexOf("\n")) >= 0;) {
			const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1);
			if (!line) continue;
			try { onRecord(JSON.parse(line) as RpcRecord); } catch (e) { evlog({ type: "bad_record", error: String(e), head: line.slice(0, 200) }); }
		}
	});
	child.on("exit", (code, sig) => { st.exited = true; evlog({ type: "process_exit", code, sig }); for (const p of pending.values()) p({ type: "response", success: false, error: "process exited" }); pending.clear(); });
	const send = (cmd: object) => new Promise<RpcRecord>((res) => { const id = "c" + ++seq; pending.set(id, res); child.stdin.write(JSON.stringify({ id, ...cmd }) + "\n"); });
	const waitSettled = async (deadline: number): Promise<string> => {
		for (;;) {
			if (st.exited) return "exit";
			if (Date.now() > deadline) return "timeout";
			if (st.started && !st.running && !st.compacting && Date.now() - st.last >= QUIET_MS) return "ok";
			await sleep(1000);
		}
	};

	await sleep(3000);
	const rows: StepRow[] = [];
	for (const step of steps) {
		const t0 = Date.now(), turns0 = st.turns;
		st.started = false; st.lastText = ""; st.lastError = "";
		const resp = await send({ type: "prompt", message: step.message });
		if (step.command) {
			// "handled" means an extension command ran; "started" means pi sent it to the model as text (command missing).
			const status = !resp.success ? "rejected: " + resp.error : resp.data?.disposition === "handled" ? "ok" : "not handled: " + resp.data?.disposition;
			evlog({ type: "setup_command", message: step.message, status, data: resp.data });
			console.log(path.basename(o.out) + " setup " + JSON.stringify(step.message) + " " + status);
			if (status !== "ok") { rows.push({ step: step.id, status, secs: 0, turns: 0, cost: null, ctx: null, compactions: st.compactions }); break; }
			await sleep(2000);
			continue;
		}
		let status = resp.success ? await waitSettled(t0 + STEP_TIMEOUT_MS) : "rejected: " + resp.error;
		if (status === "ok" && st.lastError) status = "error: " + st.lastError;
		if (status === "timeout") await send({ type: "abort" });
		fs.writeFileSync(path.join(o.out, step.id + ".out"), st.lastText);
		const s = st.exited ? {} : (await send({ type: "get_session_stats" })).data ?? {};
		const row: StepRow = { step: step.id, status, secs: Math.round((Date.now() - t0) / 1000), turns: st.turns - turns0, cost: s.cost ?? null, ctx: s.contextUsage?.tokens ?? null, compactions: st.compactions };
		fs.appendFileSync(path.join(o.out, "steps.jsonl"), JSON.stringify(row) + "\n");
		console.log(path.basename(o.out) + " step=" + row.step + " status=" + status + " secs=" + row.secs + " turns=" + row.turns + " cost=$" + (row.cost ?? 0).toFixed(2) + " ctx=" + row.ctx + " compactions=" + row.compactions);
		rows.push(row);
		if (status !== "ok") { console.log(path.basename(o.out) + " STOP " + status); break; }
		if ((row.cost ?? 0) > BUDGET) { console.log(path.basename(o.out) + " STOP budget $" + BUDGET); break; }
		await afterStep(step);
	}
	await sleep(2000);
	child.stdin.end();
	for (let i = 0; i < 90 && !st.exited; i++) await sleep(1000);
	if (!st.exited) child.kill("SIGKILL");
	return rows;
}

const MODEL_DEFAULT = "anthropic/claude-opus-5-5";
const TASKS = process.env.LONG_TASKS ?? path.join(LONG, "tasks");
const readTask = (name: string) => fs.readFileSync(path.join(TASKS, name + ".md"), "utf8");

async function seed(model: string, thinking: string): Promise<void> {
	const work = path.join("/tmp/agent-eval-long/seed-" + Date.now());
	const repo = path.join(work, "repo"), home = path.join(work, "home"), sessDir = path.join(work, "sessions");
	const out = path.join(LONG, "seed");
	fs.rmSync(out, { recursive: true, force: true });
	fs.mkdirSync(path.join(out, "steps"), { recursive: true }); fs.mkdirSync(sessDir, { recursive: true });
	prepRepo(repo, { "settings.json": PROJECT_SETTINGS });
	const rows = await runSession({ repo, home, sessDir, out: path.join(out, "steps"), flags: [], env: { SCOUT_HERDR: "0" }, cont: false, model, thinking },
		["1", "2"].map((id) => ({ id, message: readTask(id) })), () => sleep(THINK_MS));
	if (rows.length !== 2 || rows.some((r) => r.status !== "ok")) throw new Error("seed: a step failed; see " + out);
	if (sh("git", ["status", "--porcelain", "--untracked-files=no"], repo).trim()) throw new Error("seed: steps 1-2 changed tracked files; the seed must leave the repo at " + COMMIT);
	const sess = newestSession(sessDir);
	if (!sess) throw new Error("seed: no session file");
	const text = fs.readFileSync(sess, "utf8");
	fs.writeFileSync(path.join(out, "session.jsonl"), text);
	const meta: SeedMeta = { repo, home, commit: COMMIT, model, thinking, lines: text.split("\n").filter(Boolean).length, contextTokens: rows[1].ctx, createdAt: new Date().toISOString() };
	fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
	console.log("seed FINAL ctx=" + meta.contextTokens + " cost=$" + (rows[1].cost ?? 0).toFixed(2) + " -> " + out);
}

/** resume: continue an arm whose run died (e.g. rate limit) in its existing session, repo and blackhole state;
 *  the old steps.jsonl is kept as steps.before-resume.jsonl and snapshot numbering continues. */
async function arm(name: string, run: string, drop: string, compactAt: number, steps: string[], resume: boolean): Promise<void> {
	const meta = JSON.parse(fs.readFileSync(path.join(LONG, "seed/meta.json"), "utf8")) as SeedMeta;
	const armDir = path.join(LONG, "arms", name);
	const work = path.join("/tmp/agent-eval-long", run, name);
	const repo = path.join(work, "repo"), home = path.join(work, "home"), sessDir = path.join(work, "sessions");
	const out = path.join(LONG, "results", run, name);
	if (resume) {
		if (!fs.existsSync(path.join(sessDir, "seed.jsonl"))) throw new Error("resume: no session in " + sessDir);
		if (fs.existsSync(path.join(out, "steps.jsonl"))) fs.renameSync(path.join(out, "steps.jsonl"), path.join(out, "steps.before-resume.jsonl"));
	} else {
		fs.rmSync(work, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true });
	}
	fs.mkdirSync(sessDir, { recursive: true }); fs.mkdirSync(out, { recursive: true });
	if (!fs.existsSync(armDir)) throw new Error("no arm " + armDir);
	const bhPath = path.join(armDir, "pi-blackhole-config.json");
	const blackhole = fs.existsSync(bhPath);
	const projectFiles: Record<string, string> = { "settings.json": PROJECT_SETTINGS };
	if (blackhole) {
		const bhConfig = { ...(JSON.parse(fs.readFileSync(bhPath, "utf8")) as object), compactAfterTokens: compactAt };
		projectFiles["pi-blackhole-config.json"] = JSON.stringify(bhConfig, null, 2) + "\n";
	}
	const setupPath = path.join(armDir, "setup.md");
	const setup: Step[] = (fs.existsSync(setupPath) ? fs.readFileSync(setupPath, "utf8") : "").split("\n").map((l) => l.trim()).filter(Boolean)
		.map((l, i) => ({ id: "setup" + (i + 1), message: fillTemplate(l, { COMPACT_AT: String(compactAt) }), command: true }));
	if (resume) for (const [f, body] of Object.entries(projectFiles)) fs.writeFileSync(path.join(repo, ".pi", f), body);
	else prepRepo(repo, projectFiles);
	fs.mkdirSync(path.join(out, "project"), { recursive: true }); // probe.ts replays these into each fork's cwd
	for (const [f, body] of Object.entries(projectFiles)) fs.writeFileSync(path.join(out, "project", f), body);
	if (!resume) {
		const seedText = fs.readFileSync(path.join(LONG, "seed/session.jsonl"), "utf8");
		fs.writeFileSync(path.join(sessDir, "seed.jsonl"), rewritePaths(seedText, [[meta.repo, repo], [meta.home, home]]));
	}
	const compactions0 = resume && fs.existsSync(path.join(out, "snapshots")) ? fs.readdirSync(path.join(out, "snapshots")).filter((f) => /^c\d+\.jsonl$/.test(f)).length : 0;
	// pi runs sandboxed with the real home read-only, so anything it writes lives under work and is copied to out after.
	const usageLog = path.join(work, "bh-usage.jsonl");
	const flags = blackhole ? ["-e", path.join(LONG, ".pkgs/node_modules/pi-blackhole/dist/index.js")] : [];
	const configPath = path.join(out, resume ? "config.resume.json" : "config.json");
	const config = { arm: name, run, drop, compactAt, steps, resume, compactions0, setup: setup.map((s) => s.message), flags, seed: meta.createdAt, model: meta.model, thinking: meta.thinking, warmMs: WARM_MS, thinkMs: THINK_MS };
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
	const list: Step[] = [...setup, ...(resume ? [] : [{ id: "warmup", message: readTask("warmup") }]), ...steps.map((id) => ({ id, message: fillTemplate(readTask(id), { DROP: drop }) }))];
	const rows = await runSession({ repo, home, sessDir, out, flags, env: { SCOUT_HERDR: "0", BH_USAGE_LOG: usageLog }, cont: true, model: meta.model, thinking: meta.thinking, compactions0 },
		list, (s) => sleep(s.id === "warmup" ? WARM_MS : THINK_MS));
	const sess = newestSession(sessDir);
	const sessText = sess ? fs.readFileSync(sess, "utf8") : "";
	fs.writeFileSync(path.join(out, "session.jsonl"), sessText);
	const bhDir = path.join(home, ".pi/agent/pi-blackhole");
	if (fs.existsSync(bhDir)) fs.cpSync(bhDir, path.join(out, "pi-blackhole-state"), { recursive: true });
	const tryRun = (cmd: string): string => { try { return sh("bash", ["-c", cmd], repo).trim(); } catch (e) { return "exit " + ((e as { status?: number }).status ?? 1); } };
	fs.writeFileSync(path.join(out, "diff.patch"), tryRun("git add -A -N . && git diff HEAD") /* HEAD: an agent's git rm/add is staged, and plain git diff skips staged changes */);
	if (fs.existsSync(usageLog)) fs.copyFileSync(usageLog, path.join(out, "bh-usage.jsonl"));
	const workers = usageTotals(fs.existsSync(usageLog) ? fs.readFileSync(usageLog, "utf8") : "");
	const final = {
		steps: rows.map((r) => r.step + ":" + r.status),
		session: sessionCosts(sessText, meta.lines),
		workers,
		verify: tryRun("./config/pi/verify.sh 2>&1 | tail -1"),
		agentsCheck: tryRun("./config/pi/build-agents.sh --check >/dev/null 2>&1 && echo ok"),
		diffStat: tryRun("git diff HEAD --stat | tail -1"),
	};
	fs.writeFileSync(path.join(out, "final.json"), JSON.stringify(final, null, 2) + "\n");
	console.log(name + " FINAL " + JSON.stringify({ main: final.session.mainCost.toFixed(2), compaction: final.session.compactionCost.toFixed(2), workers: workers.cost.toFixed(2), compactions: final.session.compactions, verify: final.verify }));
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
	run: { type: "string" }, drop: { type: "string" }, "compact-at": { type: "string" }, steps: { type: "string", default: "3,4,5,recall" },
	model: { type: "string", default: MODEL_DEFAULT }, thinking: { type: "string", default: "medium" }, resume: { type: "boolean", default: false },
} });
const [cmd, armName] = positionals;
if (cmd === "seed") await seed(values.model, values.thinking);
else if (cmd === "arm" && armName && values.run && values.drop && values["compact-at"]) {
	await arm(armName, values.run, values.drop, Number(values["compact-at"]), values.steps.split(","), values.resume);
} else {
	console.error("usage: run.ts seed [--model M] [--thinking T] | run.ts arm <arm> --run <id> --drop <item-id> --compact-at <tokens> [--steps 3,4,5,recall] [--resume]");
	process.exit(2);
}
process.exit(0);
