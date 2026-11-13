export interface Problem { key: string; who: string; flag: string; session: string }

export function summary(problems: Problem[], ownSession: string): string | undefined {
	const others = problems.filter((p) => p.session !== ownSession);
	if (!others.length) return undefined;
	const first = others[0];
	return (`! ${first.who} · ${first.flag}` + (others.length > 1 ? ` (+${others.length - 1} more, run pi-health)` : first.key.startsWith("gone ") ? " (run pi-health to clear)" : "")).slice(0, 110);
}
