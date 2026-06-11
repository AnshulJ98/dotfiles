---
description: Disciplined diagnosis loop for hard bugs — feedback loop, repro, ranked hypotheses, instrument, fix, regression-test
argument-hint: "[bug | failing test | regression description]"
---
Diagnose this with discipline — no fixes until the cause is proven: $@

1. **Build a feedback loop FIRST.** A fast, deterministic, agent-runnable pass/fail signal for the bug: failing test, curl script, CLI invocation with fixture, replayed trace, bisection harness. This is the skill — everything after is mechanical. If you cannot build one, STOP and say so: list what you tried and what artifact/access you need from me. Do not hypothesise without a loop.
2. **Reproduce.** Run the loop; confirm it shows the failure I described — not a nearby different failure. For flaky bugs, raise the reproduction rate (loop the trigger, add stress, narrow timing) until it is debuggable.
3. **Hypothesise.** Generate 3–5 RANKED hypotheses before testing any. Each must be falsifiable: "if X is the cause, then changing Y makes the bug disappear." Show me the ranked list before testing — I may re-rank instantly.
4. **Instrument.** Each probe maps to one prediction. Change one variable at a time.
5. **Fix the root cause** — not the symptom. If the fix is a guard around broken state, you have not found the cause.
6. **Regression-test.** The feedback loop from step 1 becomes the permanent test. Run the broader suite to confirm nothing else broke.

End with: cause, fix, evidence — one line each.
