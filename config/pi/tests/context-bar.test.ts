// Run: node --test 'config/pi/tests/*.test.ts'
// extensions/context-bar.ts imports pi packages at runtime; they resolve from the installed pi release.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const agentDir = join(homedir(), ".pi", "agent");
const version = readFileSync(join(agentDir, "install", "current-version"), "utf8").trim().replace(/^v/, "");
const piModules = pathToFileURL(join(agentDir, "install", "releases", version, "node_modules", "x.js")).href;
register(
	`data:text/javascript,${encodeURIComponent(`
		export async function resolve(specifier, context, next) {
			if (/^(@earendil-works\\/|typebox)/.test(specifier)) return next(specifier, { ...context, parentURL: ${JSON.stringify(piModules)} });
			return next(specifier, context);
		}`)}`,
);

const { default: contextBar } = await import("../extensions/context-bar.ts");
const { visibleWidth } = await import("@earendil-works/pi-tui");

type Handler = (event: unknown, ctx: unknown) => unknown;
type Footer = { render(width: number): string[] };

async function footer(): Promise<Footer> {
	const handlers: Record<string, Handler> = {};
	contextBar({ on: (event: string, handler: Handler) => (handlers[event] = handler), getThinkingLevel: () => "low" } as never);
	(globalThis as Record<symbol, unknown>)[Symbol.for("pi.compact-cap.threshold")] = 150_000;
	const usage = { input: 100, cacheRead: 13_000, cacheWrite: 200, cost: { total: 0.024 } };
	let factory: (...args: unknown[]) => Footer = () => ({ render: () => [] });
	await handlers.session_start({}, {
		cwd: "/x/dotfiles",
		model: { provider: "anthropic", id: "claude-sonnet-5-5", reasoning: true, contextWindow: 1_000_000 },
		getContextUsage: () => ({ tokens: 13_300, contextWindow: 1_000_000 }),
		sessionManager: { getBranch: () => [{ type: "message", message: { role: "assistant", usage } }] },
		ui: { setFooter: (f: typeof factory) => (factory = f) },
	});
	return factory(
		{ requestRender() {} },
		{ fg: (_color: string, text: string) => text },
		{ onBranchChange: () => () => {}, getGitBranch: () => "dotfiles-v2-2026-05", getExtensionStatuses: () => new Map() },
	);
}

test("cwd and branch sit left, the cost is pinned top right, and a half split wraps to two lines", async () => {
	const bar = await footer();
	const full = /cache 98% │ ▰+▱+ 13k\/150k \(1M\) 9% │ anthropic\/claude-sonnet-5-5 · low │ \$0\.024$/;
	const meter = /cache 98% │ ▰+▱+ 13k\/150k \(1M\) 9%$/;
	// [width, lines, top line ends, bottom line ends]
	const rows: Array<[number, number, RegExp, RegExp]> = [
		[200, 1, full, full],
		[120, 1, full, full],
		[92, 2, /anthropic\/claude-sonnet-5-5 · low │ \$0\.024$/, meter],
		[60, 2, /\.\.\. │ \$0\.024$/, meter],
		[40, 2, /dotfiles-v2-2026-05 +\$0\.024$/, meter],
		[24, 2, /\$0\.024$/, /9%$/],
	];
	const plain = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, "");
	for (const [width, count, top, bottom] of rows) {
		const lines = bar.render(width).map(plain);
		assert.equal(lines.length, count, `lines at ${width}`);
		assert.match(lines[0], /^dotfiles /, `left at ${width}`);
		assert.match(lines[0], top, `top right at ${width}`);
		assert.match(lines.at(-1) ?? "", bottom, `bottom right at ${width}`);
		for (const line of lines) assert.equal(visibleWidth(line), width, `flush to both edges at ${width}: ${line}`);
	}
});
