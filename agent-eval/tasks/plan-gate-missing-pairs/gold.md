**Goal**: Missing baseline measurements and one-sided recall fail; killed reviews are infra.

mechanism: Compare every baseline pair, not the intersection; never substitute pass rate for missing recall; classify both timeout exits.

**Findings** (at fix^)
- agent-eval/lib/summary.ts:162,166 filters away absent roles/cells; gate() must emit missing rows even with no shared pair.
- agent-eval/lib/summary.ts:170 falls back to pass rate for one-sided recall. baselineCells():146 omits recall for of=0.
- agent-eval/gate.sh:77 dereferences current unconditionally; :85 assumes no overlap means no rows.
- agent-eval/lib/record.ts:179 and agent-eval/trial.sh:66 recognize only 124, although timeout -k can return 137.

**Plan**
1. First add regressions in agent-eval/tests/summary.test.ts for dropped roles/cells, no shared pairs, own-key names constructor/__proto__, and recall on either side (including of=0); in agent-eval/tests/matrix.test.ts for MISSING, --partial and one-sided output/exits; in agent-eval/tests/record.test.ts for [124,137,0,1,143]. Use the block command, which excludes three history-dependent tests. → check: that command fails on missing rows and missing isReviewTimeout.
2. Update GateRow and gate() in agent-eval/lib/summary.ts: sort baseline roles/cells; use Object.hasOwn on current. Absent pair returns {role,cell,baseline:b,current:undefined,missing:true,fail:true,short:false,drop:0,allowed:0,unit:"task"}, even if all pairs are absent. Present rows have missing:false; oneSided is "baseline" or "run" exactly when only that side's recall !== undefined, always failing. Preserve task-count, drop and flaky rules otherwise; ignore run-only pairs. → check: summary tests pass, including no-overlap returning only missing failures.
3. In agent-eval/gate.sh parse --partial and pass it to Node. Handle missing before dereferencing current: print "FAIL <role> <cell>: MISSING from this run, baseline measured it"; --partial changes FAIL to skip, appends " (--partial: not failing)" and suppresses only missing failures. All rows missing (including empty rows) exits 2, even under --partial; otherwise any failure exits 1, none 0. One-sided lines always start FAIL and include "recall in the baseline only, not in this run" or "recall in this run only, not in the baseline". Update agent-eval/README.md gate documentation. → check: matrix subset exits 1 normally, 0 with --partial; one-sided exits 1; no overlap exits 2.
4. Export isReviewTimeout(rc:number):boolean in agent-eval/lib/record.ts, true exactly for 124/137; use in review infra calculation. In agent-eval/trial.sh skip judging both exits. → check: block command passes; timeout test yields [true,true,false,false,false].

```
---
files-allowed: [agent-eval/README.md, agent-eval/gate.sh, agent-eval/lib/record.ts, agent-eval/lib/summary.ts, agent-eval/tests/matrix.test.ts, agent-eval/tests/record.test.ts, agent-eval/tests/summary.test.ts, agent-eval/trial.sh]
tests: PATH=${PATH#*/config/pi/bin/guard:} node --test --test-skip-pattern='gate: no baseline exits 2' --test-skip-pattern='gate: steering change is detected' --test-skip-pattern='gate --update exits 2 while the steering' agent-eval/tests/matrix.test.ts agent-eval/tests/record.test.ts agent-eval/tests/summary.test.ts
---
```
