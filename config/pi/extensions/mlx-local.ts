/**
 * MLX local provider — DORMANT (absent from settings.json "extensions").
 *
 * Pulls REAL model ids + context window straight from the running MLX server's
 * OpenAI-compatible /v1/models endpoint — nothing about the model is baked in.
 * If the server isn't up, it registers nothing and stays silent (safe to enable
 * even before the server exists; it auto-activates once /v1/models responds).
 *
 * Enable: add this file to settings.json "extensions", then /reload.
 *   Serve first:  mlx_lm.server --model <qwen3-30b-a3b> --port 8080
 *
 * Caveat: the OpenAI /v1/models schema does not require a context field, and
 * mlx_lm.server may omit it. When absent there is no real value to pull — the
 * window is set by how YOU serve it (RAM / --max-tokens) — so FALLBACK_CONTEXT
 * is used. Set it to your real serving window; pi's compaction triggers relative
 * to it. Local mode = a single small-scoped primary agent, never a background one.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MLX_BASE = "http://localhost:8080/v1";
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
    const res = await fetch(`${MLX_BASE}/models`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return;
    data = ((await res.json()) as { data?: MlxModel[] }).data ?? [];
  } catch {
    return; // server not running — stay dormant, no error
  }
  if (data.length === 0) return;

  pi.registerProvider("mlx-local", {
    baseUrl: MLX_BASE,
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
