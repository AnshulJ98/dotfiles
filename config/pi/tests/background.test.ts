// Run: node --test 'config/pi/tests/*.test.ts'
// extensions/background.ts imports pi packages at runtime; they resolve from the installed pi release.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { homedir, tmpdir } from "node:os";
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

const { default: background } = await import("../extensions/background.ts");

interface Sent {
	content: string;
	options: { triggerTurn?: boolean; deliverAs?: string };
}
type Execute = (id: string, params: Record<string, unknown>, signal: undefined, onUpdate: undefined, ctx: unknown) => Promise<unknown>;

function load() {
	const tools = new Map<string, Execute>();
	const handlers = new Map<string, Array<() => Promise<void>>>();
	let onSent: (sent: Sent) => void = () => {};
	const pi = {
		on: (event: string, handler: () => Promise<void>) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
		registerTool: (tool: { name: string; execute: Execute }) => tools.set(tool.name, tool.execute),
		registerMessageRenderer: () => {},
		getSettings: () => ({}),
		sendMessage: (message: { content: string }, options: Sent["options"]) => onSent({ content: message.content, options }),
	};
	background(pi as never);
	return {
		run: (name: string, params: Record<string, unknown>) => tools.get(name)!("call", params, undefined, undefined, { cwd: tmpdir(), mode: "print" }),
		next: () => new Promise<Sent>((resolve) => (onSent = resolve)),
		shutdown: async () => {
			for (const handler of handlers.get("session_shutdown") ?? []) await handler();
		},
	};
}

test("a job's exit is steered into a running turn and wakes an idle one", async () => {
	const pi = load();
	const sent = pi.next();
	await pi.run("bg_run", { command: "echo done" });
	const { content, options } = await sent;
	assert.match(content, /Background job finished: bg1 \[exit 0,/);
	assert.deepEqual(options, { triggerTurn: true, deliverAs: "steer" });
	await pi.shutdown();
});
