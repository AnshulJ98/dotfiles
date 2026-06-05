/**
 * context7 — model-invocable live-docs tool (no MCP).
 *
 * Registers a `context7` tool the MAIN agent calls when it needs CURRENT,
 * version-correct library documentation. Replaces the context7 MCP (pi has no
 * MCP) by hitting context7's public HTTP API directly:
 *   1. /api/v1/search?query=<lib>         → resolve to an /org/project id
 *   2. /api/v1/<id>?type=txt&topic=&tokens → fetch token-capped doc snippets
 *
 * No key, no dependency beyond global fetch. Token-capped so docs lookups stay
 * cheap under usage billing. The description is the auto-invoke trigger — it
 * nudges the model to reach for live docs instead of trusting stale memory.
 */
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const API = "https://context7.com/api/v1";
const DEFAULT_TOKENS = 4000;
const SEARCH_TIMEOUT_MS = 8000;
const DOCS_TIMEOUT_MS = 12000;

interface SearchResult {
  id: string;
  trustScore?: number;
  totalSnippets?: number;
}

function pickBestId(query: string, results: SearchResult[]): string | undefined {
  if (results.length === 0) return undefined;
  const want = query.trim().toLowerCase();
  const exact = results.find((r) => r.id.split("/").pop()?.toLowerCase() === want);
  if (exact) return exact.id;
  return [...results].sort((a, b) => (b.trustScore ?? 0) - (a.trustScore ?? 0))[0]?.id;
}

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`context7 ${res.status} for ${url}`);
  return res.json();
}

async function getText(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`context7 ${res.status} for ${url}`);
  return res.text();
}

const context7Tool = defineTool({
  name: "context7",
  label: "Context7 docs",
  description:
    "Fetch CURRENT, version-correct documentation and code examples for a library or framework. " +
    "Use BEFORE writing code against any library (Next.js, Prisma, React, Zod, etc.) — do not rely on " +
    "training-data memory, which may be outdated. Pass `library` as a name ('prisma') or an exact " +
    "'/org/project' id to skip resolution. Optionally scope with `topic` ('migrations', 'middleware').",
  parameters: Type.Object({
    library: Type.String({
      description: "Library/framework name (e.g. 'next.js') or an exact context7 id (e.g. '/vercel/next.js').",
    }),
    topic: Type.Optional(
      Type.String({ description: "Optional sub-topic to focus the docs (e.g. 'routing', 'auth')." }),
    ),
    tokens: Type.Optional(
      Type.Number({ description: `Max doc tokens to return (default ${DEFAULT_TOKENS}).` }),
    ),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const { library, topic } = params;
    const tokens = params.tokens && params.tokens > 0 ? params.tokens : DEFAULT_TOKENS;

    try {
      let id = library.includes("/") ? library : undefined;
      let alternatives = "";

      if (!id) {
        const data = (await getJson(
          `${API}/search?query=${encodeURIComponent(library)}`,
          SEARCH_TIMEOUT_MS,
        )) as { results?: SearchResult[] };
        const results = data.results ?? [];
        id = pickBestId(library, results);
        if (!id) {
          return {
            content: [{ type: "text", text: `context7: no library found for "${library}". Try a more specific name.` }],
            isError: true,
          };
        }
        const others = results.filter((r) => r.id !== id).slice(0, 3).map((r) => r.id);
        if (others.length) alternatives = `\n\nOther matches (re-call with an exact id if this is wrong): ${others.join(", ")}`;
      }

      const url = `${API}${id.startsWith("/") ? id : `/${id}`}?type=txt&tokens=${tokens}${
        topic ? `&topic=${encodeURIComponent(topic)}` : ""
      }`;
      const docs = (await getText(url, DOCS_TIMEOUT_MS)).trim();

      if (!docs) {
        return {
          content: [{ type: "text", text: `context7: resolved "${library}" → ${id} but no docs returned${topic ? ` for topic "${topic}"` : ""}.` }],
          isError: false,
        };
      }

      return {
        content: [{ type: "text", text: `# context7 docs — ${id}${topic ? ` (topic: ${topic})` : ""}\n\n${docs}${alternatives}` }],
        details: { id, topic: topic ?? null, tokens },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text", text: `context7 lookup failed: ${msg}` }], isError: true };
    }
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(context7Tool);
}
