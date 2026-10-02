---
description: Diagnosis loop for hard bugs — tight feedback loop, reproduce, ranked hypotheses, instrument, fix, regression test
argument-hint: "[bug | failing test | regression description]"
---
Diagnose this. No fixes until the cause is proven: $@

1. **Build a tight loop that goes red on this bug.** One command, fast
   and deterministic, that you can run unattended and that shows the
   failure: a failing test, a curl script, a CLI run against a fixture,
   a replayed trace, a bisect harness. This step is most of the work.
   If you can't build one, stop: list what you tried and the access or
   artifact you need from me. Don't hypothesize without a loop.
2. **Reproduce and minimize.** Run the loop and confirm it shows the
   failure I described, not a nearby one. For flaky bugs, raise the
   reproduction rate (loop the trigger, add stress) until it is
   debuggable. Then cut inputs, config, and steps one at a time until
   every remaining piece is needed to stay red.
3. **Hypothesize.** Write 3 to 5 ranked hypotheses before testing any.
   Each makes a prediction: "if X is the cause, changing Y makes the bug
   go away." Show me the list and wait; I may re-rank it.
4. **Instrument.** Each probe tests one prediction; change one variable
   at a time. Tag every debug log with one unique prefix such as
   `[DEBUG-a4f2]` so cleanup is a single grep.
5. **Fix the root cause.** A guard around broken state means you have
   not found it yet.
6. **Lock it in.** Turn the minimized repro into a regression test that
   runs the real bug path, not a mock of it. If no test can reach that
   path, say so; that is a finding. Rerun the original loop, run the
   broader suite, and remove every `[DEBUG-` line.

End with cause, fix, and evidence, one line each.
