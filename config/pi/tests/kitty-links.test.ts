// Run: node --test 'config/pi/tests/*.test.ts'
// extensions/kitty-links.ts imports pi packages at runtime; they resolve from the installed pi release.
import assert from "node:assert/strict";
import { register } from "node:module";
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

const { default: kittyLinks, kittyOpenArgs } = await import("../extensions/kitty-links.ts");
const { TuiAltScreen } = await import("@earendil-works/pi-tui");

const kitty = { KITTY_LISTEN_ON: "unix:/tmp/kitty-socket-1", KITTY_WINDOW_ID: "42" };
const url = "file:///Users/me/a%20b.ts";

test("only file links inside kitty are handed to kitty", () => {
	const rows: Array<[string, string, Record<string, string | undefined>, string[] | undefined]> = [
		["file link in kitty", url, kitty, ["@", "--to", "unix:/tmp/kitty-socket-1", "action", "--match", "id:42", "open_url", url]],
		["web link stays with pi", "https://example.com", kitty, undefined],
		["outside kitty", url, {}, undefined],
		["no socket", url, { KITTY_WINDOW_ID: "42" }, undefined],
		["odd window id", url, { ...kitty, KITTY_WINDOW_ID: "42 or 1" }, undefined],
	];
	for (const [name, link, env, want] of rows) assert.deepEqual(kittyOpenArgs(link, env), want, name);
});

test("the TUI's opener is wrapped on the first mouse event and web links still reach it", () => {
	// The wrap below only matters while pi opens clicked links through this instance field
	assert.match(String((TuiAltScreen.prototype as unknown as Record<string, unknown>).handleSelectionMouseEvent), /this\.openUrl\(/);
	kittyLinks({} as never);
	const opened: string[] = [];
	const tui = Object.create(TuiAltScreen.prototype) as { openUrl: (url: string) => void; handleSelectionMouseEvent(event: unknown): void };
	const original = (url: string) => opened.push(url);
	tui.openUrl = original;
	// A right-button event returns before pi touches any selection state.
	tui.handleSelectionMouseEvent({ button: 2, release: false });
	assert.notEqual(tui.openUrl, original);
	tui.openUrl("https://example.com");
	assert.deepEqual(opened, ["https://example.com"]);
});
