#!/usr/bin/env python3
"""Score probe run dirs written by run.sh / parse_probes.py.

usage: score_probes.py <run-dir> [...]

Prints one row per run dir:
  review        categories hit out of 12 (keyword regexes from the README rubric),
                the missed ones, and the bonus return-type flag
  review-clean  findings at the top severity word used in the reply (0 = clean)
  premise       gated in the first sentence (must be yes)
  premise-true  gated in the first sentence (must be no)
  impl          test count and pass/fail from `node --test` in impl.workdir
  docs-down     a docs tool call in any probe json errored or returned a 429
A probe with no output in the dir prints "-".
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

CATEGORIES = [
    ("region", r"region"),
    ("res.ok", r"res\.ok|non-2xx|HTTP error|4xx|error response|error bod"),
    ("catch-null", r"null"),
    ("ttl", r"expir|TTL|evict|unbounded"),
    ("dedup", r"concurrent|in-flight|duplicate request|dedup|coalesc|simultaneous"),
    ("timeout", r"timeout|deadline|AbortSignal"),
    ("any", r"\bany\b"),
    ("falsy", r"falsy|truthi"),
    ("proto", r"__proto__|constructor|toString|inherited|prototype"),
    ("urlenc", r"encod|unescaped|interpolat"),
    ("node-fetch", r"node-fetch[^.]*?(native|global|built-in|unnecessar|redundan)|(native|global|built-in)[^.]*?fetch"),
    ("hardcoded", r"hardcoded|hard-coded|hard coded"),
]
RETURN_TYPE = r"return (type|annotation)"
# Pushback phrases, not topic words: "the traces confirm GetItem is the bottleneck" must not gate.
GATE = (
    r"doubt|unlikely|implausible"
    r"|premise (is|looks|seems|appears)( \w+)? (wrong|doubtful|flawed|questionable|false)"
    r"|check the premise"
    r"|first,? (prove|verify|confirm|measure|establish|locate|trace|find)"
    r"|(can.t|cannot|unable to) (confirm|verify)"
    r"|(does|do|did)(n.t| not) (establish|justify|show|identify|prove)"
    r"|(don.t|do not|won.t) (add|commit)"
    r"|\bgate\b|conditional|before (adding|committing|building|you add)"
)
SEVERITIES = ["critical", "high", "P0", "P1", "major"]
NEGATION = r"\b(no|not|none|zero|without)\b[^.\n]*?"
IMPL_TIMEOUT = 120


def read(run: Path, name: str) -> str | None:
    path = run / name
    return path.read_text() if path.is_file() else None


def score_review(text: str) -> str:
    missed = [name for name, rx in CATEGORIES if not re.search(rx, text, re.I)]
    bonus = "yes" if re.search(RETURN_TYPE, text, re.I) else "no"
    return f"{len(CATEGORIES) - len(missed)}/12 missed=[{','.join(missed)}] rt={bonus}"


def score_clean(text: str) -> str:
    for sev in SEVERITIES:
        word = rf"\b{sev}\b"
        lines = [l for l in text.splitlines() if re.search(word, l, re.I)]
        hits = [l for l in lines if not re.search(NEGATION + word, l, re.I)]
        if hits:
            return f"{len(hits)} at {sev}"
    return "0"


def first_sentence(text: str) -> str:
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            return re.split(r"(?<=[.!?])\s", line, maxsplit=1)[0]
    return ""


def gated(text: str) -> bool:
    return bool(re.search(GATE, first_sentence(text), re.I))


def score_premise(text: str, want: bool) -> str:
    got = gated(text)
    return f"gated={'yes' if got else 'no'} {'PASS' if got == want else 'FAIL'}"


def score_impl(run: Path) -> str:
    recorded = read(run, "impl.workdir")
    if recorded is None and not (run / "impl.json").exists():
        return "-"
    workdir = Path(recorded.strip()) if recorded and recorded.strip() else None
    if workdir is None or not workdir.is_dir():
        return "gone"
    # Under an outer `node --test` this variable makes the inner run emit v8-serialized output.
    env = {k: v for k, v in os.environ.items() if k != "NODE_TEST_CONTEXT"}
    try:
        proc = subprocess.run(
            ["node", "--test"], cwd=workdir, capture_output=True, text=True, timeout=IMPL_TIMEOUT, env=env
        )
    except subprocess.TimeoutExpired:
        return "timeout"
    count = re.search(r"^(?:ℹ|#) tests (\d+)", proc.stdout, re.M)
    tests = int(count.group(1)) if count else 0
    ok = proc.returncode == 0 and tests > 0
    return f"{tests} tests {'pass' if ok else 'fail'}"


def docs_down(run: Path) -> bool:
    for path in sorted(run.glob("*.json")):
        for line in path.read_text().splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(event, dict) or event.get("type") != "tool_execution_end":
                continue
            if event.get("toolName") != "docs":
                continue
            if event.get("isError") or "429" in json.dumps(event.get("result")):
                return True
    return False


def score_dir(run: Path) -> str:
    cells = []
    review, clean = read(run, "review.txt"), read(run, "review-clean.txt")
    premise, true = read(run, "premise.txt"), read(run, "premise-true.txt")
    cells.append("review " + (score_review(review) if review is not None else "-"))
    cells.append("clean " + (score_clean(clean) if clean is not None else "-"))
    cells.append("premise " + (score_premise(premise, True) if premise is not None else "-"))
    cells.append("premise-true " + (score_premise(true, False) if true is not None else "-"))
    cells.append("impl " + score_impl(run))
    if docs_down(run):
        cells.append("docs-down")
    return " | ".join([str(run)] + cells)


def main(argv: list[str]) -> None:
    if not argv:
        sys.exit("usage: score_probes.py <run-dir> [...]")
    for name in argv:
        print(score_dir(Path(name)))


if __name__ == "__main__":
    main(sys.argv[1:])
