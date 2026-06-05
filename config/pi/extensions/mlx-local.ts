/**
 * MLX local provider — OMLX server, OpenAI-compatible, API-key auth.
 *
 * Pulls REAL model ids + context window straight from the running server's
 * /v1/models endpoint — nothing about the model is baked in. If the server is
 * down OR the key is missing/wrong (401), it registers nothing and stays silent
 * (safe to keep enabled; auto-activates once /v1/models responds with 200).
 *
 * Config via ENV (never hardcode the key in tracked dotfiles):
 *   export OMLX_API_KEY="<key from the OMLX admin panel>"   # required (server demands Bearer)
 *   export OMLX_BASE_URL="http://localhost:11434/v1"        # optional, this is the default
 * Then launch pi from that shell (so it inherits the env) and /reload.
 *
 * Caveat 1: the OpenAI /v1/models schema does not require a context field. When
 * absent the window is whatever YOU serve (RAM / --max-tokens) — FALLBACK_CONTEXT
 * is used; set it to your real serving window so compaction triggers correctly.
 * Caveat 2: Qwen-based thinking models may need `compat.thinkingFormat`
 * ("qwen" or "qwen-chat-template") on the model — add if reasoning misbehaves.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MLX_BASE = process.env.OMLX_BASE_URL ?? "http://localhost:11434/v1";
const API_KEY = process.env.OMLX_API_KEY ?? "";
const FALLBACK_CONTEXT = 32768;
const FALLBACK_MAX_TOKENS = 8192;

interface MlxModel {
  id: string;
  context_window?: number;
  max_context_length?: number;
  max_position_embeddings?: number;
  max_tokens?: number;
}

export default async function (pi: ExtensionAPI) {
  let data: MlxModel[];
  try {
    const res = await fetch(`${MLX_BASE}/models`, {
      signal: AbortSignal.timeout(1500),
      headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
    });
    if (!res.ok) return; // server down or unauthorized (401) — stay dormant, no error
    data = ((await res.json()) as { data?: MlxModel[] }).data ?? [];
  } catch {
    return; // server not reachable — stay dormant
  }
  if (data.length === 0) return;

  pi.registerProvider("mlx-local", {
    baseUrl: MLX_BASE,
    apiKey: "$OMLX_API_KEY",
    authHeader: true,
    api: "openai-completions",
    models: data.map((m) => ({
      id: m.id,
      name: m.id,
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow:
        m.context_window ?? m.max_context_length ?? m.max_position_embeddings ?? FALLBACK_CONTEXT,
      maxTokens: m.max_tokens ?? FALLBACK_MAX_TOKENS,
    })),
  });
}
