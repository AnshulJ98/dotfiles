// Run: node --test 'agent-eval/tests/*.test.ts'
// Drives lib/isolate.sh and run.sh against a fake real home and a stub pi: no model, no tokens.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const EVAL_DIR = resolve(import.meta.dirname, "..");
const ISOLATE = join(EVAL_DIR, "lib/isolate.sh");
const RUN = join(EVAL_DIR, "run.sh");

/** A real home with the entries isolate.sh must link and the ones it must leave out. */
function fakeRealHome(): string {
	const real = mkdtempSync(join(tmpdir(), "isolate-real-"));
	const agent = join(real, ".pi/agent");
	mkdirSync(join(agent, "bin"), { recursive: true });
	mkdirSync(join(agent, "sessions"));
	mkdirSync(join(agent, "tmp"));
	writeFileSync(join(agent, "auth.json"), "{}");
	writeFileSync(join(agent, "settings.json"), "{}");
	writeFileSync(join(agent, "memory.md"), "secret memory\n");
	writeFileSync(join(agent, "memory.md.bak-1"), "old memory\n");
	writeFileSync(join(agent, "sessions/old.jsonl"), "{}\n");
	writeFileSync(join(agent, "run-history.jsonl"), "{}\n");
	writeFileSync(join(agent, "crashes.json"), "[]");
	mkdirSync(join(real, ".agents"));
	mkdirSync(join(real, ".config"));
	writeFileSync(join(real, ".gitconfig"), "[user]\n");
	return real;
}

function isolate(real: string, home: string, args: string[], env: Record<string, string> = {}) {
	return spawnSync(ISOLATE, [home, ...args], {
		encoding: "utf8",
		env: { PATH: process.env.PATH ?? "", EVAL_REAL_HOME: real, TERM: "xterm", LANG: "C", ...env },
	});
}

function setup() {
	const real = fakeRealHome();
	const home = join(mkdtempSync(join(tmpdir(), "isolate-out-")), "home");
	return { real, home, agent: join(home, ".pi/agent"), cleanup: () => rmSync(join(home, ".."), { recursive: true, force: true }) };
}

test("HOME seen by the command is the new dir, and the environment is reduced", () => {
	const t = setup();
	try {
		const r = isolate(t.real, t.home, ["env"], { HERDR_PANE_ID: "7", PI_SESSION_FILE: "/x", SCOUT_HERDR: "1", SECRET: "s" });
		assert.equal(r.status, 0, r.stderr);
		const seen = Object.fromEntries(r.stdout.trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
		assert.deepEqual(Object.keys(seen).sort(), ["HOME", "LANG", "PATH", "SCOUT_HERDR", "TERM"]);
		assert.equal(seen.HOME, t.home);
		assert.equal(seen.SCOUT_HERDR, "0");
		assert.equal(seen.TERM, "xterm");
		assert.equal(seen.LANG, "C");
	} finally {
		t.cleanup();
	}
});

test("TERM and LANG fall back when unset", () => {
	const t = setup();
	try {
		const r = spawnSync(ISOLATE, [t.home, "env"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", EVAL_REAL_HOME: t.real } });
		assert.equal(r.status, 0, r.stderr);
		assert.match(r.stdout, /^TERM=dumb$/m);
		assert.match(r.stdout, /^LANG=en_US\.UTF-8$/m);
	} finally {
		t.cleanup();
	}
});

test("memory.md is an empty regular file and sessions an empty real dir", () => {
	const t = setup();
	try {
		assert.equal(isolate(t.real, t.home, ["true"]).status, 0);
		const mem = lstatSync(join(t.agent, "memory.md"));
		assert.ok(mem.isFile() && !mem.isSymbolicLink());
		assert.equal(mem.size, 0);
		const sessions = lstatSync(join(t.agent, "sessions"));
		assert.ok(sessions.isDirectory() && !sessions.isSymbolicLink());
		assert.deepEqual(readdirSync(join(t.agent, "sessions")), []);
	} finally {
		t.cleanup();
	}
});

// [path under the new home, path under the real home]
const LINKS: [string, string][] = [
	[".pi/agent/auth.json", ".pi/agent/auth.json"],
	[".pi/agent/settings.json", ".pi/agent/settings.json"],
	[".pi/agent/bin", ".pi/agent/bin"],
	[".agents", ".agents"],
	[".config", ".config"],
	[".gitconfig", ".gitconfig"],
];

for (const [mine, theirs] of LINKS) {
	test(`${mine} is a symlink into the real home`, () => {
		const t = setup();
		try {
			assert.equal(isolate(t.real, t.home, ["true"]).status, 0);
			assert.ok(lstatSync(join(t.home, mine)).isSymbolicLink());
			assert.equal(readlinkSync(join(t.home, mine)), join(t.real, theirs));
		} finally {
			t.cleanup();
		}
	});
}

test("memory.md.bak-1, tmp, run-history.jsonl, crashes.json and the real sessions are not carried over", () => {
	const t = setup();
	try {
		assert.equal(isolate(t.real, t.home, ["true"]).status, 0);
		for (const name of ["memory.md.bak-1", "tmp", "run-history.jsonl", "crashes.json", "sessions/old.jsonl"]) {
			assert.equal(existsSync(join(t.agent, name)), false, name);
		}
	} finally {
		t.cleanup();
	}
});

test("a missing .agents, .config or .gitconfig is skipped", () => {
	const t = setup();
	try {
		for (const name of [".agents", ".config", ".gitconfig"]) rmSync(join(t.real, name), { recursive: true });
		assert.equal(isolate(t.real, t.home, ["true"]).status, 0);
		for (const name of [".agents", ".config", ".gitconfig"]) assert.equal(existsSync(join(t.home, name)), false);
	} finally {
		t.cleanup();
	}
});

test("the command's exit code is returned", () => {
	const t = setup();
	try {
		assert.equal(isolate(t.real, t.home, ["sh", "-c", "exit 7"]).status, 7);
	} finally {
		t.cleanup();
	}
});

test("a second call on the same home works and keeps what the first wrote to memory.md", () => {
	const t = setup();
	try {
		assert.equal(isolate(t.real, t.home, ["sh", "-c", 'echo kept >> "$HOME/.pi/agent/memory.md"']).status, 0);
		const r = isolate(t.real, t.home, ["cat", join(t.agent, "memory.md")]);
		assert.equal(r.status, 0, r.stderr);
		assert.equal(r.stdout, "kept\n");
	} finally {
		t.cleanup();
	}
});

test("no arguments, or no command, exits 2 with a usage line", () => {
	for (const args of [[], ["/tmp/some-home"]]) {
		const r = spawnSync(ISOLATE, args, { encoding: "utf8" });
		assert.equal(r.status, 2);
		assert.match(r.stderr, /usage:/);
	}
});

test("run.sh runs a probe through EVAL_PI in an isolated HOME with an empty memory.md", () => {
	const real = fakeRealHome();
	const scratch = mkdtempSync(join(tmpdir(), "isolate-run-"));
	const record = join(scratch, "record");
	const stub = join(scratch, "pi");
	writeFileSync(
		stub,
		`#!/usr/bin/env bash
{ echo "$HOME"; wc -c < "$HOME/.pi/agent/memory.md"; pwd; } > "${record}"
echo '{"type":"session"}'
echo '{"type":"message_end","message":{"role":"assistant","model":"stub/m","content":[{"type":"text","text":"ok"}],"usage":{"input":1,"output":1}}}'
`,
	);
	chmodSync(stub, 0o755);
	let resultsDir = "";
	let seenHome = "";
	let seenCwd = "";
	try {
		const r = spawnSync(RUN, ["", "", "premise"], {
			encoding: "utf8",
			env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", EVAL_REAL_HOME: real, EVAL_PI: stub },
		});
		const printed = r.stdout.match(/^outputs: (.+)$/m);
		if (printed) resultsDir = resolve(EVAL_DIR, printed[1]);
		assert.equal(r.status, 0, r.stderr + r.stdout);
		assert.ok(printed, r.stdout);
		assert.doesNotMatch(r.stdout, /WARNING/);
		const [home, memBytes, cwd] = readFileSync(record, "utf8").trim().split("\n");
		seenHome = home;
		seenCwd = cwd;
		assert.match(home, /agent-eval-home\./);
		assert.notEqual(home, real);
		assert.equal(memBytes.trim(), "0");
		assert.ok(lstatSync(join(home, ".pi/agent/auth.json")).isSymbolicLink());
		assert.ok(statSync(join(resultsDir, "premise.txt")).isFile());
	} finally {
		if (resultsDir) rmSync(resultsDir, { recursive: true, force: true });
		if (seenHome) rmSync(seenHome, { recursive: true, force: true });
		if (seenCwd) rmSync(seenCwd, { recursive: true, force: true });
		rmSync(scratch, { recursive: true, force: true });
		rmSync(real, { recursive: true, force: true });
	}
});

test("run.sh gives review-clean only its own fixture, records impl.workdir, and exits 2 on an unknown probe", () => {
	const real = fakeRealHome();
	const scratch = mkdtempSync(join(tmpdir(), "isolate-run-"));
	const stub = join(scratch, "pi");
	writeFileSync(
		stub,
		`#!/usr/bin/env bash
{ pwd; ls; } > "${scratch}/seen-$(basename "$PWD" | cut -c1-12)-$$"
echo '{"type":"session"}'
echo '{"type":"message_end","message":{"role":"assistant","model":"stub/m","content":[{"type":"text","text":"ok"}],"usage":{"input":1,"output":1}}}'
`,
	);
	chmodSync(stub, 0o755);
	const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", EVAL_REAL_HOME: real, EVAL_PI: stub };
	const dirs: string[] = [];
	let resultsDir = "";
	try {
		const bad = spawnSync(RUN, ["", "", "no-such-probe"], { encoding: "utf8", env });
		assert.equal(bad.status, 2, bad.stdout + bad.stderr);
		const r = spawnSync(RUN, ["", "", "review-clean", "impl"], { encoding: "utf8", env });
		assert.equal(r.status, 0, r.stderr + r.stdout);
		const printed = r.stdout.match(/^outputs: (.+)$/m);
		assert.ok(printed, r.stdout);
		resultsDir = resolve(EVAL_DIR, printed[1]);
		const seen = readdirSync(scratch).filter((n) => n.startsWith("seen-")).map((n) => readFileSync(join(scratch, n), "utf8").trim().split("\n"));
		assert.equal(seen.length, 2);
		for (const [cwd] of seen) dirs.push(cwd);
		const clean = seen.find(([cwd]) => cwd.includes("agent-eval-fixture."));
		assert.deepEqual(clean?.slice(1), ["review-target.ts"]);
		assert.doesNotMatch(readFileSync(join(clean![0], "review-target.ts"), "utf8"), /node-fetch/);
		const impl = seen.find(([cwd]) => cwd.includes("agent-eval-impl."));
		assert.deepEqual(impl?.slice(1), []);
		// the stub's pwd resolves /tmp -> /private/tmp on macOS, so compare the temp dir names
		assert.equal(readFileSync(join(resultsDir, "impl.workdir"), "utf8").trim().split("/").pop(), impl![0].split("/").pop());
	} finally {
		if (resultsDir) rmSync(resultsDir, { recursive: true, force: true });
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
		rmSync(scratch, { recursive: true, force: true });
		rmSync(real, { recursive: true, force: true });
	}
});
