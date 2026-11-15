#!/usr/bin/env node
// probe.ts: ask the fixed recall questions (tasks/probe.md) in a fork of every post-compaction snapshot, then score the
// answer against seed/task.json facts with judge.sh (two blinded judges, an item counts when both say yes).
//   node probe.ts --run <id> [--arms bh-vcc,bh-om]
// Variants: "context" (-nt: no tools, only what the compacted context carries) for every snapshot; "recall" (-t recall:
// the session-search tool allowed) for the last snapshot. Rows go to results/<id>/probes.jsonl.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { sessionCosts, usageTotals } from "./lib.ts";

const LONG = import.meta.dirname;
const EVAL = path.dirname(LONG);
const REAL_HOME = process.env.EVAL_REAL_HOME ?? process.env.HOME ?? "";

interface ArmConfig { model: string; thinking: string; flags?: string[] }
const BH = path.join(LONG, ".pkgs/node_modules/pi-blackhole/dist/index.js");
// Runs started before config.json recorded flags: an arm loaded blackhole exactly when it had a blackhole config.
const armFlags = (armOut: string, cfg: ArmConfig): string[] =>
	cfg.flags ?? (fs.existsSync(path.join(armOut, "project/pi-blackhole-config.json")) ? ["-e", BH] : []);
interface Judge { found?: number; of?: number; met?: string[]; judgeCost?: number; infra?: boolean }

function probeOne(armOut: string, snap: string, variant: "context" | "recall"): object {
	const cfg = JSON.parse(fs.readFileSync(path.join(armOut, "config.json"), "utf8")) as ArmConfig;
	const name = path.basename(snap, ".jsonl") + "-" + variant;
	const dir = path.join(armOut, "probes", name);
	fs.rmSync(dir, { recursive: true, force: true });
	// pi runs sandboxed with the real home read-only: its cwd, session fork and usage log live in /tmp, copied back after.
	const work = path.join("/tmp/agent-eval-long/probe-" + process.pid, path.basename(armOut), name);
	const cwd = path.join(work, "cwd"), home = path.join(work, "home");
	fs.rmSync(work, { recursive: true, force: true });
	fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
	// settings.json names extensions as ~/Dev/dotfiles/...; the throwaway HOME needs that path (see run.ts linkDotfiles).
	fs.mkdirSync(path.join(home, "Dev"), { recursive: true });
	fs.symlinkSync(path.join(REAL_HOME, "Dev/dotfiles"), path.join(home, "Dev/dotfiles"));
	fs.mkdirSync(dir, { recursive: true });
	for (const f of fs.readdirSync(path.join(armOut, "project"))) fs.copyFileSync(path.join(armOut, "project", f), path.join(cwd, ".pi", f));
	const fork = path.join(work, "session.jsonl");
	const snapText = fs.readFileSync(snap, "utf8");
	fs.writeFileSync(fork, snapText);
	const usageLog = path.join(work, "bh-usage.jsonl");
	const tools = variant === "context" ? ["-nt"] : ["-t", "recall"];
	const r = spawnSync("bash", [path.join(EVAL, "lib/isolate.sh"), home, "env", "SCOUT_HERDR=0", "BH_USAGE_LOG=" + usageLog,
		"sandbox-exec", "-D", "REAL_HOME=" + REAL_HOME, "-f", path.join(LONG, "sandbox.sb"),
		"pi", "-p", "-a", ...armFlags(armOut, cfg), ...tools,
		"--model", cfg.model, "--thinking", cfg.thinking, "--session", fork, fs.readFileSync(path.join(process.env.LONG_TASKS ?? path.join(LONG, "tasks"), "probe.md"), "utf8")],
		{ cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15 * 60000 });
	fs.writeFileSync(path.join(dir, "answer.md"), r.stdout ?? "");
	fs.copyFileSync(fork, path.join(dir, "session.jsonl"));
	if (fs.existsSync(usageLog)) fs.copyFileSync(usageLog, path.join(dir, "bh-usage.jsonl"));
	fs.writeFileSync(path.join(dir, "stderr.txt"), r.stderr ?? "");
	let judge: Judge = { infra: true };
	try {
		const j = execFileSync("bash", [path.join(EVAL, "judge.sh"), dir, path.join(LONG, "seed"), "--kind", "facts", "--subject", path.join(dir, "answer.md")], { encoding: "utf8" });
		judge = JSON.parse(j.trim().split("\n").pop() ?? "{}") as Judge;
	} catch (e) {
		fs.writeFileSync(path.join(dir, "judge-error.txt"), String(e));
	}
	const probe = sessionCosts(fs.readFileSync(fork, "utf8"), snapText.split("\n").filter(Boolean).length);
	const workers = usageTotals(fs.existsSync(usageLog) ? fs.readFileSync(usageLog, "utf8") : "");
	return { arm: path.basename(armOut), snapshot: path.basename(snap, ".jsonl"), variant, rc: r.status, met: judge.met?.length ?? null, of: judge.of ?? null, metIds: judge.met ?? [],
		infra: judge.infra ?? false, probeCost: probe.mainCost, workerCost: workers.cost, judgeCost: judge.judgeCost ?? 0 };
}

const { values } = parseArgs({ options: { run: { type: "string" }, arms: { type: "string", default: "base,bh-vcc,bh-om" } } });
if (!values.run) { console.error("usage: probe.ts --run <id> [--arms a,b]"); process.exit(2); }
const runDir = path.join(LONG, "results", values.run);
for (const arm of values.arms.split(",")) {
	const armOut = path.join(runDir, arm);
	const snaps = fs.readdirSync(path.join(armOut, "snapshots")).filter((f) => f.endsWith(".jsonl")).sort().map((f) => path.join(armOut, "snapshots", f));
	// The recall variant needs blackhole's recall tool; an arm on pi's own compaction gets the context variant only.
	const hasRecall = armFlags(armOut, JSON.parse(fs.readFileSync(path.join(armOut, "config.json"), "utf8")) as ArmConfig).length > 0;
	snaps.forEach((snap, i) => {
		const variants: Array<"context" | "recall"> = i === snaps.length - 1 && hasRecall ? ["context", "recall"] : ["context"];
		for (const v of variants) {
			const row = probeOne(armOut, snap, v);
			fs.appendFileSync(path.join(runDir, "probes.jsonl"), JSON.stringify(row) + "\n");
			console.log(JSON.stringify(row));
		}
	});
}
