// Pure helpers for the long-session memory eval: no files, no processes.

/** One worker call logged by the patched pi-blackhole (BH_USAGE_LOG). */
export interface UsageTotals { calls: number; cost: number }

/** Session-level numbers from a pi session file. */
export interface SessionCosts {
	turns: number;
	mainCost: number; // assistant turns of the main model
	compactionCost: number; // LLM summaries written by pi's own compaction (0 under blackhole)
	compactions: number;
	turnsAfterFirstCompaction: number;
	avgContextAfterFirstCompaction: number;
}

// Anchors in pi-blackhole 0.5.18 dist/index.js (createBridgeStreamFn, minified as Qn). Checked against 0.5.18 only;
// patchBlackhole throws when either anchor is missing, so a version bump fails loudly instead of logging nothing.
const ANCHOR_OPEN = 'return (r,s,i)=>{let a=i?.sessionId,c=typeof a=="string"&&a.length>0?a:void 0;if(!c)return o(r,s,i);';
const ANCHOR_CLOSE = "transformHeaders:YC(r,c,u)})}}function eh(e,t){";
const MARKER = "/* EVAL PATCH: BH_USAGE_LOG */";

/** Wrap blackhole's worker stream function so every worker reply's usage is appended to $BH_USAGE_LOG. Idempotent. */
export function patchBlackhole(src: string): string {
	if (src.includes(MARKER)) return src;
	for (const [name, anchor] of [["open", ANCHOR_OPEN], ["close", ANCHOR_CLOSE]] as const) {
		const n = src.split(anchor).length - 1;
		if (n !== 1) throw new Error(`pi-blackhole patch: ${name} anchor found ${n} times, expected 1 (only 0.5.18 is supported)`);
	}
	const log =
		"return (r,s,i)=>{let st=__bh(r,s,i);try{Promise.resolve(st).then(x=>x&&typeof x.result==\"function\"&&x.result().then(m=>{" +
		"if(process.env.BH_USAGE_LOG)appendFileSync(process.env.BH_USAGE_LOG,JSON.stringify({t:Date.now()," +
		"model:(r?.provider??\"\")+\"/\"+(r?.id??\"\"),stop:m?.stopReason,usage:m?.usage})+\"\\n\")})).catch(()=>{})}catch{}return st}";
	return src
		.replace(ANCHOR_OPEN, ANCHOR_OPEN.replace("return (r,s,i)=>{", "let __bh=(r,s,i)=>{"))
		.replace(ANCHOR_CLOSE, "transformHeaders:YC(r,c,u)})};" + MARKER + log + "}function eh(e,t){");
}

/** Sum worker calls and dollars from BH_USAGE_LOG lines; malformed lines are counted, not fatal. */
export function usageTotals(text: string): UsageTotals & { malformed: number } {
	let calls = 0, cost = 0, malformed = 0;
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			const row: unknown = JSON.parse(line);
			const total = (row as { usage?: { cost?: { total?: unknown } } }).usage?.cost?.total;
			calls++;
			if (typeof total === "number") cost += total;
		} catch {
			malformed++;
		}
	}
	return { calls, cost, malformed };
}

interface Usage { input?: number; cacheRead?: number; cacheWrite?: number; cost?: { total?: number } }
interface Entry { type?: string; usage?: Usage; message?: { role?: string; usage?: Usage } }

/** Main-model cost, pi-compaction cost and context after the first compaction, from a session file's text. */
export function sessionCosts(text: string, fromLine = 0): SessionCosts {
	const out: SessionCosts = { turns: 0, mainCost: 0, compactionCost: 0, compactions: 0, turnsAfterFirstCompaction: 0, avgContextAfterFirstCompaction: 0 };
	let ctxSum = 0;
	const lines = text.split("\n").slice(fromLine);
	for (const line of lines) {
		if (!line.trim()) continue;
		let e: Entry;
		try { e = JSON.parse(line) as Entry; } catch { continue; }
		if (e.type === "compaction") {
			out.compactions++;
			out.compactionCost += e.usage?.cost?.total ?? 0;
			continue;
		}
		const u = e.message?.role === "assistant" ? e.message.usage : undefined;
		if (!u) continue;
		out.turns++;
		out.mainCost += u.cost?.total ?? 0;
		if (out.compactions > 0) {
			out.turnsAfterFirstCompaction++;
			ctxSum += (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);
		}
	}
	if (out.turnsAfterFirstCompaction > 0) out.avgContextAfterFirstCompaction = Math.round(ctxSum / out.turnsAfterFirstCompaction);
	return out;
}

/** Fill {{KEY}} placeholders; a placeholder with no value is an error, not an empty string. */
export function fillTemplate(tpl: string, vars: Record<string, string>): string {
	return tpl.replace(/\{\{([A-Z_]+)\}\}/g, (_m, key: string) => {
		const v = Object.hasOwn(vars, key) ? vars[key] : undefined;
		if (v === undefined) throw new Error(`template: no value for {{${key}}}`);
		return v;
	});
}

/** Copy of a seed session for another checkout: every occurrence of each old path becomes the new one. */
export function rewritePaths(text: string, pairs: ReadonlyArray<readonly [from: string, to: string]>): string {
	return pairs.reduce((acc, [from, to]) => (from ? acc.split(from).join(to) : acc), text);
}
