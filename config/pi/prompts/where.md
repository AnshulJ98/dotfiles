---
description: Where we are on the ladder (this, slice, high, higher, target), what's left at each level and the next move; report only
argument-hint: "[level to expand]"
---
Show me where we are. Print the card below in one code block and stop:
no edits, no next step started, no plan. Expand: $@

```
target  ◇ <the outcome I want, in my latest words>
higher  ○ <what the effort lands in>     <pips>  left  <what remains here>
high    ▸ <the effort>                   <pips>  left  <what remains here>
slice   ▸ <the agreed batch in hand>     <pips>  left  <what remains here>
this    ● <the one piece in hand>                left  <what remains here>
────────────────────────────────────────────────────────────────────────
open    ● <piece in hand>   <its state>                  you: <verb>
        ▸ <in progress>     <its state>                  me: <verb>
        ○ <not started>     <its state>                  you: <verb>
        ? <reported done>   <what is unchecked>          me: check
done    <count> in this slice · latest proof: <one sha, test or path>
ideas   <yours that I have not agreed to, on one line>
next    <one move; start with "you:" when it is my decision>
```

- The ladder is the top five rows, always in this order with these
  labels. `higher` is what the effort lands in or serves (a branch to
  merge, a release, a programme). `high` is the effort. `slice` is the
  agreed batch in hand. `this` is the one piece in hand right now; when
  that piece is finished, `this` is the next open piece, not the
  finished one.
- Leave out a rung we never named; two rungs and `target` is a fine
  answer. Never invent a rung, an item, a count or a percentage.
- Marks: ✓ done with proof, ▸ in progress, ○ agreed and not started,
  ? reported done but not checked, ● you are here. ● appears on `this`
  and on its row under `open`, nowhere else.
- Pips: one mark per item we named at that level, in order. No pips
  where the items were never listed.
- `left` is what remains at that level beyond the rung below it, as
  agreed with me. Write `none named` when nothing was agreed. Your own
  suggestions go under `ideas`, never under `left`.
- `open` lists every piece of the slice that is not done, the piece in
  hand first, at most 6, each ending with whose move it is. If I named a
  level after "Expand", list that level's pieces there.
- A piece is a unit of the agreed work, not a chore done along the way
  (a note saved, a window opened).
- ✓ needs proof from this session. A todo, a summary or your own
  earlier "done" is not proof: that piece is ? and stays under `open`.
  `done` gives one pointer, not a list.
- My latest word wins over the original ask and over a compaction
  summary. Where a summary lost a rung or a piece, write `lost in
  compaction` on that row; do not guess.
- You may run `git status` and `git log` to settle a mark. Nothing else.
- Pad with spaces so the marks, pips, `left` and the owners line up.
  Names are at most 30 characters and the rule is copied as it is.
  One row is one line of at most 100 characters and never wraps onto a
  second line: cut detail, not rows.
  Nothing before the card and nothing after `next`. Leave out `done`
  and `ideas` when empty. At most 14 rows.
