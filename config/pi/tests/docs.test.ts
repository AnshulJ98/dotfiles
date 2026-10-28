// Run: node --test 'config/pi/tests/*.test.ts'
// extensions/docs.ts imports pi packages at runtime; they resolve from the installed pi release.
// fetch is the only system boundary, so it is the only thing stubbed.
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

const { default: docs, lookup } = await import("../extensions/docs.ts");

type Reply = { status: number; body: string };
type Fetch = typeof globalThis.fetch;

/** Serve canned replies by URL path; record the calls. */
function serve(replies: Record<string, Reply>): { calls: string[]; restore: () => void } {
	const calls: string[] = [];
	const real = globalThis.fetch;
	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = new URL(String(input));
		calls.push(`${url.pathname}?${url.searchParams}`);
		const reply = replies[url.pathname];
		if (!reply) throw new Error(`unexpected ${url.pathname}`);
		return new Response(reply.body, { status: reply.status });
	}) as Fetch;
	return { calls, restore: () => (globalThis.fetch = real) };
}

const SEARCH = "/api/v2/libs/search";
const CONTEXT = "/api/v2/context";
const hits = JSON.stringify({
	results: [
		{ id: "/colinhacks/zod", title: "Zod" },
		{ id: "/websites/zod_dev", title: "Zod" },
		{ id: "/llmstxt/zod_full", title: "Zod" },
		{ id: "/llmstxt/zod", title: "Zod" },
		{ id: "/x/fifth", title: "Fifth" },
	],
});

test("docs: a name resolves through search, then fetches the best match and lists three others", async () => {
	const s = serve({ [SEARCH]: { status: 200, body: hits }, [CONTEXT]: { status: 200, body: "### safeParse\ncode" } });
	try {
		const text = await lookup("zod", "safeParse");
		assert.equal(text, "Library: /colinhacks/zod\nOther matches: /websites/zod_dev (Zod), /llmstxt/zod_full (Zod), /llmstxt/zod (Zod)\n\n### safeParse\ncode");
		assert.deepEqual(s.calls, [
			`${SEARCH}?query=safeParse&libraryName=zod`,
			`${CONTEXT}?query=safeParse&libraryId=%2Fcolinhacks%2Fzod`,
		]);
	} finally {
		s.restore();
	}
});

test("docs: a Context7 ID skips the search", async () => {
	const s = serve({ [CONTEXT]: { status: 200, body: "text" } });
	try {
		assert.equal(await lookup("/colinhacks/zod/v4", "parse"), "text");
		assert.deepEqual(s.calls, [`${CONTEXT}?query=parse&libraryId=%2Fcolinhacks%2Fzod%2Fv4`]);
	} finally {
		s.restore();
	}
});

test("docs: no match is a result, not an error", async () => {
	const s = serve({ [SEARCH]: { status: 404, body: JSON.stringify({ error: "no_libraries_found", message: "x" }) } });
	try {
		assert.equal(await lookup("zzqq", "x"), 'No Context7 library matches "zzqq".');
	} finally {
		s.restore();
	}
});

const failures: Array<{ name: string; replies: Record<string, Reply>; library: string; message: RegExp }> = [
	{ name: "search HTTP 500", replies: { [SEARCH]: { status: 500, body: '{"message":"down"}' } }, library: "zod", message: /search failed: HTTP 500 .*down/ },
	{ name: "search non-JSON body", replies: { [SEARCH]: { status: 200, body: "<html>" } }, library: "zod", message: /search failed: HTTP 200 non-JSON body <html>/ },
	{ name: "search JSON null body on a 404", replies: { [SEARCH]: { status: 404, body: "null" } }, library: "zod", message: /search failed: HTTP 404 null/ },
	{ name: "search without results array", replies: { [SEARCH]: { status: 200, body: '{"data":[]}' } }, library: "zod", message: /no results array/ },
	{ name: "docs HTTP 404 on a bad ID", replies: { [CONTEXT]: { status: 404, body: "" } }, library: "/nope/nope", message: /docs failed: HTTP 404/ },
	{ name: "docs empty body", replies: { [CONTEXT]: { status: 200, body: "  \n" } }, library: "/colinhacks/zod", message: /empty body for \/colinhacks\/zod/ },
];
for (const f of failures) {
	test(`docs: ${f.name} throws`, async () => {
		const s = serve(f.replies);
		try {
			await assert.rejects(lookup(f.library, "x"), f.message);
		} finally {
			s.restore();
		}
	});
}

test("docs: registers one direct tool with a two-field schema", () => {
	const tools: Array<{ name: string; parameters: { properties: Record<string, unknown> }; exposure?: string }> = [];
	docs({ registerTool: (tool: (typeof tools)[number]) => tools.push(tool) } as never);
	assert.equal(tools.length, 1);
	assert.equal(tools[0].name, "docs");
	assert.equal(tools[0].exposure, undefined);
	assert.deepEqual(Object.keys(tools[0].parameters.properties), ["library", "query"]);
	assert.ok(JSON.stringify(tools[0].parameters).length < 500);
});
