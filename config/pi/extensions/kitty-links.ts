/**
 * Clicked file links go through kitty, so config/kitty/open-actions.conf picks
 * the app (nvim for code) instead of macOS `open`, which sends `.ts` to VLC.
 *
 * pi's fullscreen TUI captures the mouse and opens a clicked OSC 8 link itself
 * through its `openUrl` option (pi-tui tui-alt-screen.js, handleSelectionMouseEvent;
 * pi's open-browser.js runs `open <url>`), so kitty never sees the click. This
 * wraps that instance field on first mouse event: file:// URLs become
 * `kitty @ action open_url` on this window; anything else, or a failed kitty
 * call, falls back to pi's own opener.
 */
import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TuiAltScreen } from "@earendil-works/pi-tui";

const WRAPPED = Symbol.for("kitty-links.wrapped");

type Open = ((url: string) => void) & { [WRAPPED]?: true };

/** argv for kitty, or undefined when the link should stay with pi's opener. */
export function kittyOpenArgs(url: string, env: Record<string, string | undefined>): string[] | undefined {
	if (!url.startsWith("file://")) return undefined;
	const socket = env.KITTY_LISTEN_ON;
	const window = env.KITTY_WINDOW_ID;
	if (!socket || !window || !/^\d+$/.test(window)) return undefined;
	return ["@", "--to", socket, "action", "--match", `id:${window}`, "open_url", url];
}

function viaKitty(fallback: (url: string) => void): Open {
	const open: Open = (url) => {
		const args = kittyOpenArgs(url, process.env);
		if (!args) return fallback(url);
		let failed = false;
		const fail = () => {
			if (failed) return;
			failed = true;
			fallback(url);
		};
		const child = spawn("kitty", args, { stdio: "ignore", detached: true });
		child.on("error", fail);
		child.on("exit", (code) => {
			if (code !== 0) fail();
		});
		child.unref();
	};
	open[WRAPPED] = true;
	return open;
}

export default function (_pi: ExtensionAPI) {
	const proto = TuiAltScreen.prototype as unknown as { handleSelectionMouseEvent?: (this: { openUrl?: Open }, ...args: unknown[]) => unknown } & {
		[WRAPPED]?: true;
	};
	const original = proto.handleSelectionMouseEvent;
	if (typeof original !== "function" || proto[WRAPPED]) return;
	proto[WRAPPED] = true;
	proto.handleSelectionMouseEvent = function (...args) {
		if (this.openUrl && !this.openUrl[WRAPPED]) this.openUrl = viaKitty(this.openUrl);
		return original.apply(this, args);
	};
}
