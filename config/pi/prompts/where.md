---
description: Where we are by outcome, each level's done-when checks and numbered actions by whose move it is; report only
argument-hint: "[action number or level to brief]"
---
Show me where we are, by outcome. Print the card below in one code block
and stop: no edits, no next step started, no plan. Expand: $@

```
target  ◇ <the outcome I want, in my latest words>, done when:
          ☐ <check>                                  <action numbers>
higher  ○ <what the effort lands in>, done when:
          ☐ <check>                                  <action numbers>
beyond  ▸ <the effort, as an outcome>, done when:
          ? <check reported done, not checked>       <where it was reported>
          ▸ <the slice below, closed>                <action numbers>
slice   ▸ <the agreed batch in hand, as an outcome>, done when:
          ✓ <check>                                  <proof: one sha, test or path>
          ☐ <check>                                  <action numbers>
this    ● <the one piece in hand, as an outcome>, done when:
          ☐ <check>                                  <action numbers>

needs you   1 ● <verb-first decision or move>   <options a · b · c>          my pick: <x>
            2   <verb-first decision or move>   <options>                    my pick: <x>
I do next   3   <verb-first action>             <what it needs first>
waiting     4   <verb-first action>             until <number or event>
ideas       <yours that I have not agreed to, on one line>
reply       <an example answer by number, and what you would do then>
```

- The ladder is the rungs `target`, `higher`, `beyond`, `slice`, `this`,
  in this order with these labels. `higher` is what the effort lands in
  or serves (a branch to merge, a release, a programme). `beyond` is the
  effort the slice belongs to. `slice` is the agreed batch in hand.
  `this` is the one piece in hand right now; when that piece is
  finished, `this` is the next open piece.
- Leave out a rung we never named; `target` and two rungs is a fine
  answer. Never invent a rung, a check, a count or a percentage.
- A rung line states an outcome: what is true when it is done, not the
  activity. Under it go its done-when checks, one per line, each
  something I could verify. Take them from what we agreed. If we never
  agreed how a rung is done, its only check is `☐ done-when not agreed`
  and naming it is a `needs you` action.
- A check appears once, on the lowest rung that owns it. A higher rung
  lists the rung below it as one check, then only what remains beyond
  it. At most 5 checks on a rung.
- Check marks: ✓ done with proof from this session; ? reported done (a
  todo, a summary, your own earlier "done") but not checked; ▸ in
  progress; ☐ open. The right column gives one proof pointer for ✓,
  where it was reported for ?, and for ▸ and ☐ the numbers of the
  actions that close it.
- Actions are numbered from 1, verb first, one move each. Every open
  check has at least one action and every action closes a check. ●
  marks `this` and the action that moves it, nowhere else.
- `needs you` holds the moves that are mine: decisions, approvals,
  things to try. Give the options, then `my pick:` with your
  recommendation, or `my pick: none yet`.
- `I do next` holds what you will do once I answer, each with what it
  needs first (`needs nothing`, `after 1-2`, `your "commit"`).
- `waiting` holds actions that cannot start yet, each with `until` and
  the number or event that frees it.
- Leave out a group that is empty. At most 9 actions.
- `ideas` holds your suggestions I have not agreed to; they are never a
  check or an action. Leave the row out when empty.
- `reply` is one example of how I could answer by number, and what you
  would do then. You still stop here.
- If I gave an action number or a rung after "Expand", print no card.
  Print a brief for it instead: eight rows `what`, `where`, `why`,
  `how`, `effort`, `impact`, `pick`, `context`, under a rule that names
  it. A number means the action with that number in your last card.
  `effort` and `impact` come from what we measured or said: write `not
  sized` rather than guess.
- My latest word wins over the original ask and over a compaction
  summary. Where a summary lost a rung or a check, write `lost in
  compaction` on that row; do not guess.
- You may run `git status` and `git log` to settle a mark. Nothing else.
- Pad with spaces so the marks, the right column and the action columns
  line up. One row is one line of at most 100 characters and never
  wraps: cut detail, not rows. One blank line goes between the ladder
  and the actions. Nothing before the card and nothing after `reply`.
  At most 30 rows.
