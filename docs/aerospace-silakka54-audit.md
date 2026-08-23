# AeroSpace × Silakka54 keybind audit — 2026-08-23

Cross-read of `config/aerospace/aerospace.toml` against the shipped
Silakka54 keymap (`zmk-config-silakka54`, commit 751110d: Phase 1+2 —
esc/ctrl mod-tap plus mirrored alt/shift rails), `config/kitty/kitty.conf`,
`home/.zshrc`, and the bake-off plan (`docs/bakeoff-plan.md`, LOCKED
2026-08-11).

Physical constraint that drives everything below: after Phase 2, all four
corner modifiers live on pinky outer columns. LAlt = top-left, LShift =
bottom-left (same left pinky). RAlt = top-right, RShift = bottom-right
(same right pinky). Any alt+shift chord therefore requires a cross pair
(LAlt+RShift or RAlt+LShift), which always leaves one hand holding its own
pinky corner while its remaining fingers tap the target key.

## A. AeroSpace binds that are physically impossible on the board

1. **`alt-shift-semicolon` → service mode.** Semicolon is right pinky
   home. RAlt and RShift are also right pinky; LAlt+LShift share the left
   pinky. No finger assignment exists. Service mode — reload-config,
   flatten-workspace-tree, floating toggle, close-all-but-current,
   join-with — is unreachable from this keyboard. This is the largest
   single "gap": a quarter of the config's functionality is dead.
2. **`alt-shift-tab` → move-node-to-monitor.** Tab shares the left-pinky
   outer column with LAlt and LShift; RAlt+RShift share the right pinky.
   Impossible.
3. **`alt-shift-1` and `alt-shift-0`.** N1 is left pinky, N0 is right
   pinky; both collide with every cross pair. Windows cannot be moved to
   workspace 1 or workspace 10 — the two anchor workspaces of the 1-5/6-10
   split. Workspaces 2-9 work, but only as a same-hand pinky-corner hold
   plus same-hand tap.
4. **`alt-shift-minus` / `alt-shift-equal` (resize smart).** Already
   documented impossible in PARKED.md; Phase 2 additionally removed minus
   from the base layer entirely (top-right minus became RAlt, hyphen moved
   to Lower+O). Dead weight in main mode; `alt-r` resize mode covers it.

## B. The alt-shift layer is structurally wrong for this board

20 of AeroSpace's 46 chords are alt+shift. Every reachable one reproduces
the exact defect design.md stage 0.1 eliminated for plain alt+hjkl: a
same-hand pinky hold under the tapping fingers. The "alt-shift feels
unnatural" complaint is mechanics, not habituation, and no amount of
drilling fixes it. The bake-off plan already contains the correct
instrument: **Phase 3 (Callum sticky mods on the Raise home row)** turns
every alt+shift chord into tap-tap-tap with zero simultaneous holds, and
it is the locked next phase. The parked WM layer (modified F-chords)
remains the escalation if Phase 3 fails; do not build it first.

## C. Every alt-letter bind shadows a terminal Meta key

`kitty.conf:134` sets `macos_option_as_alt yes`, so in the terminal Alt is
the Meta prefix — but AeroSpace grabs its binds globally before any app
sees them. Concrete casualties today: `alt-f` (M-f forward-word), `alt-b`
(M-b backward-word), `alt-enter` (Claude Code newline in kitty),
`alt-h/j/k/l`, `alt-e`, `alt-comma`, `alt-slash`. kitty.conf lines 148-149
(alt+left/right → ESC-b/ESC-f) are the existing workaround and the proof
that word-nav demand is real.

**`alt-f` verdict: keep it.** It is not a macOS system shortcut; nothing at
the system level wants Option-F. It is cross-hand clean on the board
(RAlt+F). The only casualty is shell M-f, which alt+right already
replaces. The felt conflict is the shadowing described above, and it
applies equally to any alt-letter — moving fullscreen elsewhere buys
nothing.

Constraint for any rebinding: each new alt-letter steals another Meta key.
Safe steals (unbound in emacs-mode zsh): `alt-g`, `alt-i`, `alt-v`,
`alt-x`, `alt-z`, `alt-semicolon`. Avoid `alt-n`/`alt-p` (history search),
`alt-d` (kill-word), `alt-t` (transpose-words), `alt-q` (push-line),
`alt-.` (insert-last-word — currently free, keep it free).

## D. Collateral finding: zsh is in vi mode by accident

`home/.zshrc:54` sets `EDITOR='nvim'`; zsh's documented behavior selects
the vi keymap when EDITOR contains "vi". Verified live:
`bindkey -lL main` → `viins`. There is no `bindkey -v` anywhere in the
repo — this is unintended. Consequence: kitty's alt+right map sends ESC-f,
which in viins enters vicmd and arms `f` (find-char), silently swallowing
the next keystroke; alt+left half-works by accident (vicmd `b`). This is
invisible breakage that presents exactly as "keybinds collapsing".
Fix: one line, `bindkey -e`, next to the existing bindkey calls.

## E. Confirmed redundancies (owner-agreed)

- `alt-slash` duplicates `alt-e` (both `layout tiles horizontal vertical`).
  Keep one.
- `alt-s` / `alt-w` / `alt-comma` accordion triplet overlaps. Keep one.
- `alt-o` stays (orientation toggle of the current node — distinct).
- Dead `exec-and-forget sketchybar` in after-startup-command: sketchybar is
  uninstalled (borders/ccstatusline replaced it, commit 81a7ed7). Remove;
  re-adding sketchybar later is a one-line revert and carries no value now.

## F. Recommended change set

AeroSpace side (works identically on standard work keyboards):

1. Service mode → `alt-semicolon` (cross-hand LAlt+semi; M-; unbound).
2. `move-node-to-monitor` → a service-mode key (it is a rare operation;
   service mode is the right altitude) or `alt-g` if it must stay in main.
3. Delete `alt-shift-space` — service mode `f` already toggles floating.
4. Delete `alt-shift-minus/equal` from main; resize mode covers both.
5. Prune `alt-slash` and two of the accordion triplet; remove the
   sketchybar line.
6. Keep `alt-f`, `alt-hjkl`, `alt-1..0`, `alt-enter` as-is. Accept that
   `alt-shift-1/0` stay broken on the Silakka54 until Phase 3; do not
   contort the config around two chords a sticky-mod phase dissolves.

ZMK side: run Phase 3 as locked. It is the designed answer to finding B
and needs no AeroSpace changes to test.

zsh side: `bindkey -e`.

Explicitly not recommended now: the parked WM layer (two sources of truth,
laptop-keyboard divergence), reduced workspace count, and any new
modifier scheme outside the bake-off protocol.

## Addendum 2026-08-23 — superseded in part by the thumb-Alt proposal

Brainstorm with the owner produced architecture "Phase 2.2: thumb-Alt +
mirrored Cmd rails" (LAlt to the left outer thumb, LGUI/RGUI to the top
corners), documented in full at
`~/Dev/zmk-config-silakka54/docs/2026-08-23-thumb-alt-proposal.md`.
Under it, every "impossible" chord in section A becomes typeable, so
recommendation F items 1-3 (service-mode rebind, move-node-to-monitor
relocation, alt-shift-space deletion rationale) are superseded — service
mode stays on `alt-shift-semicolon`. Still standing regardless of that
proposal's fate: the prune set (E), `alt-shift-minus/equal` removal,
`bindkey -e` (D), and zellij's remap-on-its-own-side rule (alt-f stays
AeroSpace's; zellij's entire default alt surface, not just alt-f, is
shadowed).
