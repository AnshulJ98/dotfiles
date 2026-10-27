// Where the running pi's own package lives, for the tests and verify.sh checks that
// import pi internals. The managed install (~/.pi/agent/install/current-version) is
// used when present; otherwise the `pi` on PATH is followed to its real file
// (Homebrew and npm -g link it into the package) and up to the package root.
// Bare imports resolved from the root's package.json find pi's other packages in
// either layout: hoisted next to it (managed) or nested under it (Homebrew).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";

const PACKAGE = join("@earendil-works", "pi-coding-agent");

/** Root folder of the @earendil-works/pi-coding-agent package pi runs from. */
export function piPackage(): string {
	const agentDir = join(homedir(), ".pi", "agent");
	const current = join(agentDir, "install", "current-version");
	if (existsSync(current)) {
		const version = readFileSync(current, "utf8").trim().replace(/^v/, "");
		return join(agentDir, "install", "releases", version, "node_modules", PACKAGE);
	}
	const onPath = execFileSync("sh", ["-c", "command -v pi"], { encoding: "utf8" }).trim();
	for (let dir = dirname(realpathSync(onPath)); dir !== dirname(dir); dir = dirname(dir)) {
		if (dir.endsWith(sep + PACKAGE)) return dir;
	}
	throw new Error(`pi-package: ${onPath} does not lead into ${PACKAGE}`);
}
