export interface Problem { key: string; who: string; flag: string; session: string }

export function keep(held: Array<Problem & { seen: number }>, found: Problem[], now: number, keepMs: number): Array<Problem & { seen: number }> {
	const previous = new Map(held.map((p) => [p.key, p.seen]));
	const keys = new Set(found.map((p) => p.key));
	return [
		...found.map((p) => ({ ...p, seen: previous.get(p.key) ?? now })),
		...held.filter((p) => !keys.has(p.key) && p.key.startsWith("gone ") && now - p.seen < keepMs),
	];
}

export function summary(problems: Problem[], ownSession: string): string | undefined {
	const others = problems.filter((p) => p.session !== ownSession);
	if (!others.length) return undefined;
	const first = others[0];
	return (`! ${first.who} · ${first.flag}` + (others.length > 1 ? ` (+${others.length - 1} more, run pi-health)` : "")).slice(0, 110);
}
