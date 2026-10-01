# Zoom / fullscreen plan — kitty 0.48.2 + AeroSpace 0.20.3-Beta

Planning only. No config changed. Files in scope:
`config/kitty/kitty.conf`, `config/aerospace/aerospace.toml`.

## 1. kitty: pane zoom (replaces abusing cmd+shift+l)

Current: `enabled_layouts splits,tall,fat,grid,stack` and
`map cmd+shift+l next_layout`. Reaching the zoom state costs up to four
presses through tall/fat/grid, and there is no way back in one key.

```
map cmd+alt+f toggle_layout stack
```

`toggle_layout` goes to `stack`, and when already in `stack` calls
`last_used_layout()` (kitty/tabs.py). Layout objects are cached per tab in
`_used_layouts`, so the `splits` tree and its resize biases survive the round
trip. Keep `cmd+shift+l` for real layout cycling; the two do not collide.

Caveats:
- kitty#7893: content is not re-anchored on zoom, so a short buffer leaves the
  bottom half of the zoomed pane blank.
- `stack` is already in `enabled_layouts`, required for `toggle_layout` to
  resolve the name.

### Blocking defect this exposes

All pane navigation in the config is `neighboring_window left/right/up/down`
(`cmd+opt+arrow`). In `stack` there are no neighbours, so once zoomed those
four keys are dead and the other panes are unreachable. Zoom is unusable
without adding:

```
map cmd+shift+bracketright next_window
map cmd+shift+bracketleft  previous_window
```

## 2. kitty: knowing splits exist, and which pane is focused

Available facts, verified against the local man page and the 0.48.2 option list:

- `tab_title_template` exposes `{layout_name}` and `{num_windows}`. A marker
  like `stack` plus the window count is one conditional appended to the
  existing template. It answers "there are 3 panes and one is covering them".
- `window_title_bar_min_windows` (default `0` = never) with
  `window_title_template` / `active_window_title_template` draws a per-pane
  title bar. Set to `2` to get bars only when a tab is actually split. In
  `stack` only one window is visible, so the bars vanish exactly when zoomed.
- There is **no** active-window-index variable. `window_title_template`
  offers only `title`, `bell_symbol`, `activity_symbol`, `progress_percent`,
  `is_active`, `custom`. "Pane 2 of 3" requires a custom `draw_title(data)` in
  `~/.config/kitty/tab_bar.py` (exposed as `{custom}`) computing the active
  window's index from the tab. That is real Python in the config dir, and the
  only way to get the number.

Cheapest useful combination: tab title marker (count + stack flag) plus
`window_title_bar_min_windows 2`. Skip the custom Python unless the index
genuinely matters.

## 3. kitty: independent content per split — not supported

kitty's window list and layout are per **tab**. There is no per-split stack,
so "cycle only what is in the right pane" has no native binding. The three
real options:

1. `launch --type=overlay` — the new window occupies the same split cell as
   its parent (same window group). It stacks inside that pane only. But there
   is no cycling: the top overlay is visible, and you close it to reveal the
   parent. Good for transient things (pager, scratch editor), not for
   alternating between two long-lived shells.
2. `swap_with_window` (interactive picker) plus `move_window
   forward/backward` — rearranges which existing window sits in which cell,
   manually.
3. tmux inside the right pane. A tmux session there has its own window list
   and `C-b n/p`, which is exactly the requested semantics, and the repo
   already carries `config/tmux`.

Verdict: if the right pane needs N cyclable long-lived programs, run tmux in
it. Do not try to emulate it with kitty layouts.

## 4. AeroSpace: alt-f eating gaps and the menu bar

```toml
alt-f = 'fullscreen --no-outer-gaps'
```

`--no-outer-gaps` drops the four `outer.*` 10pt gaps for the fullscreen
window only. Documented flag, present in the current command reference.

The menu bar cannot be covered by `fullscreen`: AeroSpace lays windows out
inside the screen's visible frame. Two ways to get the strip back:

- **Recommended.** macOS: Menu Bar settings, "Automatically hide and show the
  menu bar" = Always (`defaults write NSGlobalDomain _HIHideMenuBar -bool
  true`, currently `0` on this machine, needs a re-login to take effect
  reliably). The visible frame then spans the full display, so
  `fullscreen --no-outer-gaps` covers everything while the window stays in its
  AeroSpace workspace and tiling tree.
- `macos-native-fullscreen` hides the menu bar, but moves the window to its own
  macOS Space. Workspace and tiling are lost. Rejected.

## 5. AeroSpace: toggling gapped vs gapless globally

Gaps are config-only; there is no `aerospace config --set` (upstream issue
#355, still declined). The only mechanism is rewriting the config and running
`aerospace reload-config`, i.e. a script that swaps a symlinked
`aerospace.toml` between a gapped and a zero-gap variant.

Verdict: not worth the machinery. The actual need is "one window, no gaps, no
menu bar", and `alt-f = 'fullscreen --no-outer-gaps'` with the menu bar on
auto-hide delivers it in one key with no state to desynchronise. Revisit only
if every window in a workspace should be gapless at once.

Sketchybar does not help here. It cannot change gaps; it would only replace
the information from the hidden menu bar, and it would itself need an
`outer.top` gap to remain visible, reintroducing the strip that alt-f is
supposed to eat.
