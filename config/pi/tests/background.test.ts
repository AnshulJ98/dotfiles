// Run: node --test 'config/pi/tests/*.test.ts'
// extensions/background.ts imports pi packages at runtime; they resolve from the installed pi release.
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { piPackage } from "./pi-package.ts";

const piModules = pathToFileURL(join(piPackage(), "package.json")).href;
register(
	`data:text/javascript,${encodeURIComponent(`
		export async function resolve(specifier, context, next) {
			if (/^(@earendil-works\\/|typebox)/.test(specifier)) return next(specifier, { ...context, parentURL: ${JSON.stringify(piModules)} });
			return next(specifier, context);
		}`)}`,
);

const { default: background, lastLines } = await import("../extensions/background.ts");

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

test("lastLines shows the last lines as a terminal would", () => {
	const cases: Array<[string, number, string]> = [
		["one\ntwo\n", 5, "one\ntwo"],
		["a\rb\rc\n", 5, "c"],
		["x\r\ny\r\n", 5, "x\ny"],
		["one\ntwo\nthree\n", 2, "two\nthree"],
		["", 5, "(no output)"],
		["one\ntwo\n\n", 5, "one\ntwo"],
		["one\n\ntwo\n", 5, "one\n\ntwo"],
		["start\n10%\r20%\r\ndone\n", 5, "start\n20%\ndone"],
		["start\n10%\r", 5, "start\n10%"],
		["10%\r20%\r", 5, "20%"],
	];
	for (const [text, lines, expected] of cases) assert.equal(lastLines(text, lines), expected, JSON.stringify(text));
});
