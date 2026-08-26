#!/usr/bin/env python3
"""Extract reply text and usage telemetry from probe output files.

Handles two formats, detected by content rather than filename:
- pi `--mode json`: JSONL event stream; usage lives on assistant
  message_end events.
- Claude Code `--output-format json`: a single JSON document (object or
  event array) with a trailing result object.

For each input file, prints one summary line and writes the final reply
text next to the input as `<name>.txt`.
"""

import json
import re
import sys
from pathlib import Path


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text))


def parse_pi(path: Path) -> tuple[str, str, dict]:
    model, text = "", ""
    usage = {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "cost": 0.0}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        event = json.loads(line)
        message = event.get("message") or {}
        if event.get("type") != "message_end" or message.get("role") != "assistant":
            continue
        model = message.get("model", model)
        for block in message.get("content", []):
            if block.get("type") == "text":
                text = block["text"]  # last assistant text wins
        u = message.get("usage") or {}
        for key in ("input", "output", "cacheRead", "cacheWrite"):
            usage[key] += u.get(key, 0)
        cost = u.get("cost")
        if isinstance(cost, dict):
            usage["cost"] += cost.get("total", 0.0)
        elif isinstance(cost, (int, float)):
            usage["cost"] += cost
    return model, text, usage


def parse_claude_code(path: Path) -> tuple[str, str, dict]:
    document = json.loads(path.read_text())
    events = document if isinstance(document, list) else [document]
    results = [e for e in events if e.get("type") == "result"]
    if not results:
        return "", "", {}
    result = results[-1]
    u = result.get("usage", {})
    usage = {
        "input": u.get("input_tokens", 0),
        "output": u.get("output_tokens", 0),
        "cacheRead": u.get("cache_read_input_tokens", 0),
        "cacheWrite": u.get("cache_creation_input_tokens", 0),
        "cost": result.get("total_cost_usd"),
        "turns": result.get("num_turns"),
        "dur_ms": result.get("duration_ms"),
    }
    model = ",".join((result.get("modelUsage") or {}).keys())
    return model, result.get("result", ""), usage


def is_pi_stream(path: Path) -> bool:
    with path.open() as f:
        first_line = f.readline().strip()
    try:
        first_event = json.loads(first_line)
    except json.JSONDecodeError:
        return False
    return isinstance(first_event, dict) and first_event.get("type") == "session"


def main(paths: list[str]) -> None:
    if not paths:
        sys.exit("usage: parse_probes.py <probe-output.json> [...]")
    for name in paths:
        path = Path(name)
        parser = parse_pi if is_pi_stream(path) else parse_claude_code
        model, text, usage = parser(path)
        path.with_suffix(".txt").write_text(text)
        print(f"### {path}  model={model}")
        print(f"words={word_count(text)}  usage={usage}")


if __name__ == "__main__":
    main(sys.argv[1:])
