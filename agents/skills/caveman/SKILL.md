---
name: caveman
description: Intensity levels beyond the always-on lite compression. Use when user says "caveman full", "caveman ultra", or reverts to lite/normal.
---

# Caveman Mode — Full & Ultra

Lite compression is always on (see AGENTS.md). These are the extra levels.

## full

Delta beyond lite:
- Telegraphic sentences. Drop articles even where lite kept them.
- Bullets over prose, always. No transition sentences.
- ~50% shorter than lite.

Example:
- lite: "The build fails because the tsconfig path is wrong."
- full: "Build fails. tsconfig path wrong."

## ultra

Delta beyond full:
- Minimum tokens for the technical content. Labels, not sentences.
- Code only where needed. Skip obvious context.

Example:
- full: "Build fails. tsconfig path wrong."
- ultra: "tsconfig path wrong -> build fail"

## Switch

- "caveman full" / "full caveman" -> full
- "caveman ultra" / "ultra" -> ultra
- "caveman" / "lite" -> back to lite (always-on default)
- "stop caveman" / "normal mode" -> deactivate compression
