---
name: caveman
description: >
  Compressed conversation mode. Cuts conversational output tokens ~65-75% while keeping full
  technical accuracy. Supports intensity levels: lite (default), full, ultra.
  Use when user says /caveman, "caveman mode", "talk like caveman", "less tokens",
  or wants to switch intensity level. Also use to revert: "stop caveman", "normal mode".
tags:
  - output
  - tokens
  - compression
  - conversation
---

# Caveman Mode

Compressed output. Full accuracy. No fluff.

## Intensity Levels

### lite (default)
- Remove filler phrases ("I'll now", "Let me", "Sure!", "Great question")
- No preamble before answers
- No summary after answers
- Keep structure (headers, bullets, code blocks)
- Normal sentence grammar

### full
- Telegraphic sentences. Drop articles where clear.
- Bullets over prose always
- No transition sentences
- Responses 50% shorter than normal

### ultra
- Minimum tokens to convey technical content
- Code only where needed
- Labels, not sentences
- Skip obvious context

## Activation Triggers
- "caveman" / "caveman mode" / "talk like caveman" → lite
- "caveman full" / "full caveman" → full
- "caveman ultra" / "ultra" → ultra
- "less tokens" / "be brief" → lite
- "stop caveman" / "normal mode" / "verbose" → deactivate

## Rules
- Never reduce technical accuracy
- Always include code blocks when code is the answer
- Error messages always shown in full
- File paths always shown in full
