# long: compaction and memory across a long session

Compares pi compaction/memory extensions ("arms") on one long, multi-prompt session. Separate from the matrix in
`../`: one pi RPC process per session, not one `pi -p` per trial. Reuses `../lib/isolate.sh` (throwaway HOME) and
`../judge.sh --kind facts` (two blinded judges).

## Design

1. **Seed, once.** `run.ts seed` runs prompts 1-2 (evaluate the pi config, list enhancements with ids) on a clone
   of the dotfiles at `822eee5` with no compaction extension. The session is saved in `seed/`. Every arm then
   starts from the same history, list and answer key, so the arms differ only after the copy.
2. **Answer key.** `seed/task.json` `facts`: the three preferences from prompt 1, every list id with its gist from
   the step-2 reply, and the dropped id. Written by hand from `seed/steps/2.out`.
3. **Arms.** `run.ts arm <arm>` copies the seed session (paths rewritten), sends a warm-up turn, waits `WARM_MS`
   so memory workers can catch up on the seed, then prompts 3 (implement, with `{{DROP}}` named), 4 (review),
   5 (status) and recall. Compaction is forced by the arm's `compactAfterTokens` (`--compact-at`).
   `arms/<arm>/pi-blackhole-config.json`: `bh-vcc` (memory off, deterministic compaction plus the `recall`
   tool) and `bh-om` (the same plus observational memory, Haiku 5.5 workers).
4. **Recall checks.** After each compaction the session is copied (`snapshots/c<N>.jsonl`). `probe.ts` asks
   `tasks/probe.md` in a fork of each copy: `context` (no tools: what the compacted context carries) for
   every snapshot, `recall` (only the `recall` tool) for the last. Each answer is scored against the key.
5. **Cost.** Main model, pi's compaction calls (0 under blackhole) and worker calls. Worker calls never reach the
   session file, so `install.sh` patches pi-blackhole 0.5.18 to append each worker reply's usage to `$BH_USAGE_LOG`.
   The patch is anchored to 0.5.18 and fails loudly on any other version.

## Run

```
./install.sh                                            # pinned pi-blackhole + usage patch, into .pkgs/
node run.ts seed                                        # ~$2, ~6 min (Opus 5.5 medium)
#   write seed/task.json facts from seed/steps/2.out
node run.ts arm bh-vcc --run <id> --drop <item> --compact-at <tokens> &
node run.ts arm bh-om  --run <id> --drop <item> --compact-at <tokens> &
wait
node probe.ts --run <id>
node --test 'tests/*.test.ts'
```

Results persist in `results/<id>/<arm>/`: `config.json`, `steps.jsonl`, `events.jsonl`, the reply to every
step (`<step>.out`), compaction summaries, snapshots, `session.jsonl`, `bh-usage.jsonl`, the blackhole state dir,
`diff.patch`, `final.json`. Probe rows go to `results/<id>/probes.jsonl`, with each probe's answer and the
judges' verdicts under `<arm>/probes/`. Work dirs (clone, HOME, live session) stay in `/tmp/agent-eval-long/`.

pi runs under `sandbox.sb`: nothing under the real home is writable except pi's credential, lock and cache files.

## Limits

One run per arm: only a large difference (lost work after a compaction, several key items apart) is a finding.
`--compact-at` below your real 210k forces more compactions than a normal session; it tests how each arm holds up
across compactions, not your daily setup. Blackhole only compacts when pi finds something older than
`keepRecentTokens` to cut, so a threshold just above the seed's context waits for that.
