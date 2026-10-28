// Library docs from Context7 in one call: resolve a name to a library ID, then fetch the
// snippets for the query. Replaces @upstash/context7-pi's two tools (resolve-library-id,
// query-docs) at a tenth of the schema. Failures are loud by design: only "no library
// matches" is a result the model can act on; every other error throws so an API change
// shows up as a tool error instead of an empty answer.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const BASE = "https://context7.com/api/v2";
const BODY_PREVIEW = 200;

interface SearchHit {
	id: string;
	title: string;
}

function headers(): Record<string, string> {
	const key = process.env.CONTEXT7_API_KEY;
	return key ? { Authorization: `Bearer ${key}` } : {};
}

async function fail(what: string, response: Response): Promise<never> {
	const body = (await response.text()).slice(0, BODY_PREVIEW);
	throw new Error(`Context7 ${what} failed: HTTP ${response.status} ${body}`);
}

/** Library name → Context7 ID of the best match plus the next few; null when nothing matches. */
export async function searchLibrary(name: string, query: string, signal?: AbortSignal): Promise<SearchHit[] | null> {
	const url = `${BASE}/libs/search?${new URLSearchParams({ query, libraryName: name })}`;
	const response = await fetch(url, { headers: headers(), signal });
	const text = await response.text();
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new Error(`Context7 search failed: HTTP ${response.status} non-JSON body ${text.slice(0, BODY_PREVIEW)}`);
	}
	const parsed = json as { results?: SearchHit[]; error?: string };
	if (response.status === 404 && parsed.error === "no_libraries_found") return null;
	if (!response.ok) throw new Error(`Context7 search failed: HTTP ${response.status} ${text.slice(0, BODY_PREVIEW)}`);
	if (!Array.isArray(parsed.results)) throw new Error(`Context7 search failed: no results array in ${text.slice(0, BODY_PREVIEW)}`);
	return parsed.results.length ? parsed.results : null;
}

/** Snippets for a query from a Context7 library ID. Empty text is an error: either the library is not finalized or the API changed. */
export async function fetchDocs(id: string, query: string, signal?: AbortSignal): Promise<string> {
	const url = `${BASE}/context?${new URLSearchParams({ query, libraryId: id })}`;
	const response = await fetch(url, { headers: headers(), signal });
	if (!response.ok) return fail("docs", response);
	const text = await response.text();
	if (!text.trim()) throw new Error(`Context7 docs failed: empty body for ${id}`);
	return text;
}

export async function lookup(library: string, query: string, signal?: AbortSignal): Promise<string> {
	if (library.startsWith("/")) return fetchDocs(library, query, signal);
	const hits = await searchLibrary(library, query, signal);
	if (!hits) return `No Context7 library matches "${library}".`;
	const [best, ...rest] = hits;
	const others = rest.slice(0, 3).map((hit) => `${hit.id} (${hit.title})`).join(", ");
	const docs = await fetchDocs(best.id, query, signal);
	return `Library: ${best.id}${others ? `\nOther matches: ${others}` : ""}\n\n${docs}`;
}

export default function docs(pi: ExtensionAPI) {
	pi.registerTool({
		name: "docs",
		label: "Docs",
		description:
			"Current documentation and code examples for a library, framework, SDK or CLI from Context7. Use before answering any library-specific API, config, version or setup question, even when you think you know the answer.",
		parameters: Type.Object({
			library: Type.String({ description: "Library name, or a Context7 ID like /org/project or /org/project/version" }),
			query: Type.String({ description: "What to look up: one topic, specific" }),
		}),
		async execute(_toolCallId, params, signal) {
			return { content: [{ type: "text", text: await lookup(params.library, params.query, signal) }] };
		},
	});
}
