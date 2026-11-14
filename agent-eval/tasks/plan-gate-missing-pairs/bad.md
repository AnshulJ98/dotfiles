**Goal**: Fail gates with missing measurements and classify killed reviews as infra.

mechanism: gate() filters out baseline pairs absent from the run, one-sided recall falls back to pass rate, and review timeout handling recognizes only 124 rather than also 137.

**Findings** (at fix^)
- agent-eval/lib/summary.ts:162,166 drops absent roles/cells before comparing them.
- agent-eval/lib/summary.ts:170 selects pass rate when only one side has recall.
- agent-eval/lib/record.ts:179 and agent-eval/trial.sh:66 overlook timeout's KILL exit.

**Plan**
1. In agent-eval/lib/summary.ts update GateRow and gate() to emit a failing missing row per absent baseline pair, current undefined, even without shared pairs. Use own keys. Mark present rows missing:false and fail oneSided recall in either direction. Preserve existing drop/flaky rules. → check: confirm the logic is reasonable.
2. In agent-eval/gate.sh add --partial, print missing rows before reading current, skip only missing failures under --partial, and fail one-sided recall with a side-naming message. Retain exit 2 when no pair is shared. Document this in agent-eval/README.md. → check: make sure the output looks sensible.
3. Export isReviewTimeout from agent-eval/lib/record.ts for 124/137 and use it for review infra; skip judging those exits in agent-eval/trial.sh. → check: verify timeout handling is fine.

```
---
files-allowed: [agent-eval/README.md, agent-eval/gate.sh, agent-eval/lib/record.ts, agent-eval/lib/summary.ts, agent-eval/tests/matrix.test.ts, agent-eval/tests/record.test.ts, agent-eval/tests/summary.test.ts, agent-eval/trial.sh]
tests: PATH=${PATH#*/config/pi/bin/guard:} node --test --test-skip-pattern='gate: no baseline exits 2' --test-skip-pattern='gate: steering change is detected' --test-skip-pattern='gate --update exits 2 while the steering' agent-eval/tests/matrix.test.ts agent-eval/tests/record.test.ts agent-eval/tests/summary.test.ts
---
```
