# Gate passes runs missing what the baseline measured

**Goal.** The gate must fail, not pass, when the run is missing what the baseline measured.

Review findings, as the reviewer wrote them:

> - lib/summary.ts gate (~line 172) compares only role/cell pairs present in both; `gate({worker:{a,b}, review:{a}}, {worker:{a}})` gives one row, fail false, "gate: pass". A run that dropped the review role or three of four cells passes.
> - Same function: when the baseline cell has recall and the current one does not (of 0, or records without found/of), it falls back to pass rate, which for review is 0 in the baseline and can never fail.
> - lib/record.ts:179 and trial.sh:60,66: `timeout -k 10` exits 137 when the child ignores TERM; only 124 is treated as a review timeout (infra).

**Interface** (names the findings do not give):

- `gate.sh` takes `--partial` for a deliberate subset run: a pair the run lacks then does not fail (no pair in common still exits 2).
- Each `gate()` row (`lib/summary.ts`) gains `missing: boolean` (baseline pair the run lacks; `current` is then `undefined`) and `oneSided?: "baseline" | "run"` (the side with recall when only one has it).
- A missing pair prints `FAIL <role> <cell>: MISSING ...`; with `--partial` the same line starts `skip` instead of `FAIL`, keeps `: MISSING`, and has `--partial` after it (`skip <role> <cell>: MISSING ... --partial ...`).
- A one-sided row prints `FAIL <role> <cell>` followed on the same line by `recall in the baseline only` when only the baseline has recall (also under `--partial`).
- `lib/record.ts` exports `isReviewTimeout(rc: number): boolean`.
