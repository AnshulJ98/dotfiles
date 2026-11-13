There is no auto run: no AUTO.md exists, and you are working one planned slice, `report-averages`, with the user in the session. The user said "dispatch". You reviewed the worker's diff and opened with rework; the user replied "rework", so you appended your findings to the spec and dispatched once more. The second digest:

WORKER-SENSORS: PASS
**Blocked on me**: nothing
**Changed**: src/stats.ts, tests/stats.test.ts

Your own run of the slice's `tests` passes, but reading the diff you find the worker handled the empty-list case in `sum()` and not in `average()`, which the plan's step 2 asked for. It is a three-line change.
