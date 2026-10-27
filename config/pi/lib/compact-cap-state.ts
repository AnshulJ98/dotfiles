/**
 * State extensions/compact-cap.ts shares with prime-reminder.ts and context-bar.ts. Pi loads each extension
 * with its own module cache, so a module-level variable here would exist once per importer; the values live
 * on globalThis under Symbol.for keys instead, and this file owns the keys and their types.
 */
const FIRING = Symbol.for("pi.compact-cap.firing");
const INTERRUPTED = Symbol.for("pi.compact-cap.interrupted");
const THRESHOLD = Symbol.for("pi.compact-cap.threshold");
const shared = globalThis as Record<symbol, unknown>;

/** compact-cap: publish the live cap in tokens; `read` returns 0 while the cap is off. */
export function publishThreshold(read: () => number): void {
	Object.defineProperty(globalThis, THRESHOLD, { get: read, configurable: true });
}

/** The live cap in tokens, or 0 when it is off or compact-cap isn't loaded. */
export function capThreshold(): number {
	const value = shared[THRESHOLD];
	return typeof value === "number" && value > 0 ? value : 0;
}

/** compact-cap: a cap compaction is in flight; `interrupted` when it aborted a running agent (turn_end path). */
export function setCapFiring(firing: boolean, interrupted: boolean): void {
	shared[FIRING] = firing;
	shared[INTERRUPTED] = interrupted;
}

/** prime-reminder: whether the compaction now ending came from compact-cap, and whether it aborted a run. */
export function capFiring(): { firing: boolean; interrupted: boolean } {
	return { firing: Boolean(shared[FIRING]), interrupted: Boolean(shared[INTERRUPTED]) };
}
