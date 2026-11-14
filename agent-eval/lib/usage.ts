// Session usage accounting, shared by records and judges without importing either CLI.
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export interface Usage {
	cost: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	turns: number;
}

function parseLine(line: string): Json | undefined {
	try {
		return JSON.parse(line);
	} catch {
		return undefined;
	}
}

function asObject(value: Json | undefined): JsonObject | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function num(value: Json | undefined): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function messageOf(line: string): JsonObject | undefined {
	const entry = asObject(parseLine(line));
	return entry?.type === "message" ? asObject(entry.message) : undefined;
}

/** Sum usage over every assistant turn in the session lines. */
export function measure(sessionLines: string[]): Usage {
	const total: Usage = { cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 };
	for (const line of sessionLines) {
		const message = messageOf(line);
		if (message?.role !== "assistant") continue;
		const usage = asObject(message.usage);
		total.turns += 1;
		total.input += num(usage?.input);
		total.output += num(usage?.output);
		total.cacheRead += num(usage?.cacheRead);
		total.cacheWrite += num(usage?.cacheWrite);
		total.cost += num(asObject(usage?.cost)?.total);
	}
	return total;
}

