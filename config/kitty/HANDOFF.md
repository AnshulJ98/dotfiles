# kitty/zmx workspace layer: design review and handoff

Written 2026-11-28, when this work was frozen. Kitty `0.50.0`, zmx `1.0.1`.
The code works and is used daily. It is frozen until the next issue; whether to
refactor or rebuild is decided then. This file is what that decision needs:
Part 1 is an outside review of the code, Part 2 is the builder's notes on
behaviour, decisions, limits and the open problem.

## Part 1. Design review

Read from the working tree that this commit records. Line numbers are from that
tree. Claims marked *estimate* come from a reading pass that had no line
numbers.

### Verdict

Functional, with the weak design concentrated in four places. The rest is
sound. The recommendation on record: rebuild the sidebar and the watcher from a
written spec, fold the rules that exist in both bash and Python into
`zcore.py`, split `zpick-rows`, and keep everything else. That is roughly
2,000 of about 5,600 lines of code.

### The four weak places

1. **Sidebar model: one dock process per tab.** `cmd+alt+b` closes or launches
   one `zside` process per tab (`zkitty.py:136-170`, `workspaces.py:424-457`).
   The `_sync` docstring records about 10 ms per launch and 125 ms of held
   event loop for 12 tabs. A 50 ms debounce, a 20 ms stagger and a
   3-launches-per-10-s guard (`workspaces.py:412-421`) sit on top of that. The
   guard counts intentional toggles, which is why the sidebar stops appearing
   after four or five fast presses (Part 2, section 4). The cost is in the
   model, so tuning the existing path does not make the toggle feel native.
2. **The watcher, `workspaces.py` (668 lines).** It saves, restores, syncs the
   sidebar, labels zmx sessions, runs the host lifecycle and dispatches user
   vars, all through module-level flags (eight `global` statements).
   `on_set_user_var` is 111 lines (`:526`) and carries pi's markdown feature
   next to signal dispatch. The 40 tests in `tests/test_workspaces.py` make 48
   calls to private helpers (`_save`, `_sync`, `_lifecycle`, `_restore`,
   `_push`, `_missing`, `_label`), so they break on any restructure.
3. **Rules written twice, in bash and in Python.**
   - Host-name pattern: four copies (`bin/kmain:18`, `bin/kmain:177`,
     `bin/zws:39`, `bin/zshell:45`).
   - Workspace/session name from a folder: `zcore.holder` (`zcore.py:15`)
     and `zws unique` (`bin/zws:19`) differ on the collision suffix
     (`-uuid12` against `-2`) and on the 30-character cap (`BASE_MAX`,
     `zcore.py:12`; bash has none).
   - State directory: defined in four files (`zkitty.py:25`,
     `workspaces.py:41`, `bin/zws:12`, `bin/kmain:22`). Session-file path: three.
     `.sidebar-off`: two (`workspaces.py:40`, `zkitty.py:287`).
   - The `zq` question-and-answer format between a pane's shell and the
     watcher is written by `zcore.answer` (`zcore.py:36`) and parsed by
     `bin/zshell:17-18`. They agree by convention only.
   - `git_ref` in `zpick-rows` and `repo()` in `zside` are near-identical
     `.git` walkers; the ahead/behind text is also built in both (*estimate*).
4. **`bin/zpick-rows`.** `main` is 316 lines (`:369`) and mixes pane listing,
   session-file parsing, remote facts and row formatting. The file also ships
   its own source to the remote host over ssh on stdin, so it cannot import a
   sibling module as it stands.

Smaller findings:

- `zkitty.run` is about 85 lines and mixes command parsing with launching
  (*estimate*). `bin/zshell` is one script of about 150 lines whose ssh block
  is about 80 (*estimate*).
- Seven places branch on whether the instance is the Mac or the ssh host
  (*estimate*).
- Session-file text is both written by kitty and parsed by `zws`
  (`bin/zws:131`), so the format is an unstated contract.
- A suspected bug in `zshell`'s answer parsing was checked and dropped: the
  cited line is embedded Python and the claim does not hold.

### Sound, keep as it is

- `zcore.py`: pure rules, tested through its public functions
  (`tests/test_core.py`).
- `bin/zports` scan and cancel behaviour, with its tests.
- `bin/kmain`, the tab bar, the key bindings, and the session-file and zmx
  label formats.
- About eleven retry and timeout workarounds in `zshell`, `kmain` and
  `zports`. Each was found by hitting a real race; a ground-up rebuild would
  have to find them again.

### Tests

- 238 tests. The suite takes about 150 to 185 s of wall time for about 29 s of
  CPU; most of the rest is fixed sleeps and subprocess waits. `test_ports.py`
  alone holds roughly 15 s of `time.sleep` (`:215-217`, `:316`, `:466-480`,
  `:565`).
- 123 of the 238 drive the real commands (`test_scripts.py`, 81;
  `test_side.py`, 42) and call no private helper. They can serve as the
  behaviour check for a rebuild. The 40 watcher tests cannot.

### The three options

| Option | Cost | When it is the better pick |
|---|---|---|
| Rebuild the sidebar and the watcher, keep the rest | Three files rewritten (`workspaces.py`, `bin/zside`, `bin/zpick-rows`), `zws` and `zshell` trimmed to call `zcore`; 40 watcher tests rewritten | The toggle should feel native and the patching should stop |
| Ground-up rebuild | All of the above plus re-deriving the race workarounds | The foundation changes: no zmx, or a different session-file format |
| Targeted fixes in place | Smallest; Part 2 section 4 option 1 | The toggle only has to be correct under spam, and work stops there |

### If the sidebar is rebuilt

1. Test first whether one dock can be kept alive and hidden or shrunk instead
   of destroyed (Part 2, section 4, option 2). The result decides the design.
2. Write the spec from Part 2 sections 2 and 3 before any code.
3. A small pure core is enough to remove the duplication: `session_name(cwd,
   home, taken)`, `validate(name, host)`, `encode_answer` and
   `parse_answer` for the `zq` format, `plan_save` and `plan_restore`, and
   one `Paths(state_dir, host)` that owns `.open`, `.sidebar-off` and the
   socket paths.

## Part 2. Builder's notes

Written by the session that built this, at the freeze. Section 5 was updated
after the commit.

### 1. Where we started and what done looks like

- Original goal: “building an tui for kitty tab bar.” The chosen UI is kitty’s native top tab bar plus a left sidebar for workspaces and agents. The user rejected putting the tabs on the left. No replacement top-bar TUI was approved.
- The next issue was reattaching a detached zmx session to the workspace it came from. The user wanted to work independently in multiple kitty OS windows, but did not approve mirroring the same workspace in two windows. The current design moves live tabs instead.
- **Frozen today.** After restarting kitty, the user reported that `cmd+alt+g` “works as intented at least initial testing.” That is a smoke test, not verification of every case below.
- **Open issue:** `cmd+alt+b` should feel native and “i should be able to spam it & it should still work as intended.” After 4–5 fast presses, the sidebar stops showing until the user switches spaces. The user asked to step back: “i dont trust this code. it is functional , but unoptimized slop code.” Review the design before adding another timer or retry. No further fix or rebuild was approved.

### 2. Current behaviour and decisions

#### Workspaces, windows, tabs and panes

- A **workspace** is a named kitty session. A **tab** belongs to one kitty OS window. A **pane** is a kitty window inside a tab; its persistent terminal is usually a zmx session. Closing a zmx-backed pane or tab detaches its terminal; killing the zmx session ends it. Plain shells and non-zmx programs do not get that persistence.
- `cmd+enter` focuses or starts the main workspace kitty (`kmain`). `cmd+shift+enter` opens the configured SSH workspace kitty, with separate workspace state. `cmd+alt+enter` opens a separate throwaway kitty using plain zsh, with no workspace or sidebar by default. `cmd+n` is different: it creates a free-form OS window **in the current kitty instance**, outside any workspace; it can still use `zshell`.
- `cmd+alt+n` creates a workspace named from the current folder. `cmd+alt+shift+n` asks for the name. `cmd+shift+n` creates a workspace in its own OS window. `cmd+alt+w` closes the workspace while leaving its zmx sessions alive. `cmd+alt+1..9` selects a workspace; `ctrl+alt+[` and `ctrl+alt+]` cycle workspaces. Selecting an already-open workspace by the normal workspace commands can focus its other OS window. The picker’s special reattach rules below do not change those commands.
- The watcher saves workspace layout and working directories into `*.kitty-session` files. `.open` records which workspaces to reopen, with the active workspace last. Startup reopens them; workspace files distinguish a separate OS window from a shared one. The watcher saves before a confirmed quit and stops saving during pane teardown so the restore list is not emptied. After a reboot, layout and directories can come back; zmx processes cannot.
- `cmd+t` opens a tab at the current folder; `cmd+shift+t` opens a default new tab; `cmd+shift+i` renames it. `cmd+1..9` selects a tab, `cmd+shift+w` closes it, `cmd+shift+b` detaches it to a new OS window, and `cmd+shift+j` asks where to move it. `cmd+alt+t` opens a plain shell outside zmx. `cmd+alt+l` opens Hunk diff review in a tab outside the workspace; `q` closes it.
- `cmd+d` splits right; `cmd+shift+d` splits down; `cmd+w` closes the pane. `cmd+opt+arrow` navigates panes; `cmd+ctrl+arrow` resizes; `cmd+alt+f` toggles stack/zoom; `cmd+shift+[` and `cmd+shift+]` cycle panes; `cmd+shift+l` cycles layouts.
- `cmd+/` opens key help. `cmd+alt+e` and `ctrl+shift+h` open scrollback in Neovim; `ctrl+shift+g` opens the last command output. `cmd+shift+e` follows a URL hint, `cmd+shift+f` inserts a path, and `cmd+shift+g` follows a file/line hint. `cmd+equal`, `cmd+minus`, and `cmd+0` change or reset font size. The checked-in help does not list the new picker `ctrl-o`; the picker footer does.
- The top bar uses `tab_bar_filter session:~ or session:^$`: current workspace tabs plus unassigned tabs. Its titles carry program status and pane count; the right end shows workspace number and time. The sidebar is separate so tabs stay on top.
- `zws new [--ask | --window] CWD` also accepts `--holder SESSION` before `CWD` to adopt an existing zmx terminal. Sidebar actions use `zws rename NAME`, `zws close NAME`, and `zws worktree new|open CWD`. Rename changes the display name (`ws_name`), not the stable session name; a blank rename returns to the folder-derived name.

#### Pickers and reattach

- `cmd+alt+g` opens or focuses the single **Go to** tab; invoking it while focused switches views like `ctrl+t`. Views are all workspace/tab/pane rows plus detached and closed items, or detached and closed only. A one-pane tab is one row, deliberately avoiding duplicate tab/pane entries. The preview uses `zmx history --vt`; the picker checks for zmx changes every 2 s and reloads fzf on a change. `Tab` marks rows; `Esc` closes. Marked rows are processed in order; ordinary focus-taking actions leave focus on the last successful selection.
- `ctrl+s` reattaches a detached terminal as a split alongside the picker’s origin pane, regardless of its original workspace. `ctrl+x` kills a detached session immediately, requires a second press for an attached one, and protects the originating pane in the pane-row kill path. On a closed workspace row it forgets the workspace file, leaving zmx sessions alive.
- `ctrl+backslash` opens the same picker in kitty. If the pane is running ordinary SSH, the key goes through to the remote terminal instead. A pane managed by the dedicated SSH workspace kitty opens the local picker against remote facts; its remote zmx detach key is disabled.
- `zmx-pick [NAME]` uses `zpick --zmx` in other terminals and does not drive kitty. With `NAME` it enters that session first; otherwise select a session or type a name. `ctrl+n` uses the typed name. `ctrl+backslash` detaches back to the picker. `Esc` goes to a login shell, or returns to the caller with `ZMX_PICK_ESC=return`. Inside zmx it switches once rather than nesting. The shared picker keeps this lane consistent with kitty; the proposed extraction was dropped because zmx mode also understands saved workspaces and uses the same row, preview and remote-facts machinery.

For a **detached** row, `W` is the valid workspace named by its live `space=` label, or, if there is no label, by the newest saved workspace file holding it. Resolution happens at selection time. A label for a deleted workspace does not automatically fall back to a different saved workspace.

| Case | Enter | `ctrl-o` |
|---|---|---|
| **A. W is open in this OS window** | Reattach in W and focus the pane. Use its old tab-mate if possible, else its old tab index, else the last tab. | Same as Enter. |
| **B. W is open in another OS window** | Move W’s tabs into the originating OS window using `detach-tab`, then reattach and focus there. Existing panes stay attached; there is no deliberate close/reopen. The old OS window can disappear if emptied. | Leave W there and reattach with `--keep-focus`. A tab-mate split is supported; a standalone tab goes last because placement at its old slot would require activating a destination tab. |
| **C. W is closed, but its file exists** | Ask `reopen <W>? [Y/n]`. Yes reopens the entire workspace, then resolves placement again. No brings only the selected terminal into the current workspace. | Same as Enter. |
| **D. W is unknown, invalid, or deleted** | Ask `<session> in this workspace? (n: a new one) [Y/n]`. Yes opens it here; no creates a workspace for it. | Same as Enter. |
| **E. Origin has no `holder`** | Route `plain`: attach in a tab here with an explicit `zshell` command, so throwaway kitty does not launch a plain shell instead. This detection is by the origin pane, not by an instance flag. | Same as Enter. `ctrl+s` uses explicit `zshell` in a split. |

- `near=` points to one tab-mate, not an exact split tree. A surviving tab-mate in W wins over `slot=`. Otherwise insert before the tab now at the saved zero-based slot, or append if it no longer exists. Automatic split direction is used; old direction, size, and exact split position are not restored. Previously detached sessions without these labels have no old position to restore.
- An empty route, or a failed targeted attach, falls back to a tab near the origin. `ctrl-b` is retired. The user chose keys over another prompt for case B because the old close/reopen redrew the panes, automatic cross-window focus was unwelcome, and appending every pane lost its place.

#### Sidebar, SSH and ports

- `zside` is a 24-column left `tab-dock`, skipped by keyboard focus. Workspace tabs get one dock each when shown; unassigned tabs get none. The dock displays open workspaces at the top and agents from all workspaces below. It highlights the current workspace and active agent, shows status and available model/context, and reads branch/Git information without blocking initial paint. Click a workspace or agent to go there; `ctrl+alt+1..9` selects the corresponding agent. Right-click a workspace for rename/close and, where a repo is known, worktree actions.
- The watcher snapshots kitty state and pushes a framed view after the dock’s `ready` signal; identical views per dock are suppressed. `zside` renders and emits click intents; it does not own workspace state. `cmd+alt+b` changes the persisted `.sidebar-off` preference for that instance and has the watcher close or recreate docks.
- The SSH workspace instance keeps its own restore and attachment state. A manually closed remote instance stays detached; a following instance can save and end when main kitty goes away without treating that as a deliberate detach. `zshell` runs the holder on the remote machine over a shared OpenSSH `ControlMaster`; retry does not silently substitute local zsh. After about two minutes offline the pane waits for a key. `zhost` is the bounded noninteractive command path (`BatchMode=yes`, `ConnectTimeout=2`); `zrun` runs interactive remote programs. Picker list, preview, kill, labels and working directories use remote data in that instance. Text/path hints open remote Neovim on the remote file, not a local file with the same name.
- `zports` scans remote TCP listeners about every 2 s through that master. Automatic candidates are loopback/wildcard listeners at ports `>=1024`, excluding the SSH port; cap **20 automatic forwards**. It removes automatic forwards when their listeners disappear and reapplies forwards when the master changes. It tries the same local port first and increments on local collisions; a connection failure is retried rather than treated as a collision. This is the current implementation, superseding the earlier “skip collisions” assessment.
- The host sidebar lists auto/manual mappings, program names when known, inactive and waiting entries, and `forward port…`. Port menu: **Open in browser** and **Stop forwarding**. Stop suppresses automatic re-add; a manual forward clears that suppression. The agent uses loopback local binds, validates the manual range `1..65535`, and announces newly active automatic forwards on macOS. No broad exclude list was added.
- Adjacent committed shell UX: `alt-c` fuzzy directory jump (`zoxide` ranking plus shallow `fd` results); `alt-y` opens Yazi, with `q` returning its last directory to the shell; Yazi `alt-t` opens the hovered folder in a kitty tab. Yazi split/open-editor keys and the follow pane were dropped after the demo; `alt-e` was taken globally. Yazi `alt-t` is local-only. The local demo verified a path with spaces and an apostrophe.

### 3. Iterations, limits and evidence

1. **Native kitty plus zmx replaced herdr.** Keep workspace/pane persistence separate from rendering and keep the native top bar. A proposed picker/SSH decomposition was investigated and dropped: not enough duplication removed, and `zpick-rows` is itself sent over SSH on stdin, so pulling in a local sibling module would break remote discovery. No general compatibility or new public API was approved.
2. **First reattach** (`86be986`): resolve W; Enter attaches there even if it focuses a different OS window. `ctrl-b` used `zws bring`: save, `close-tab`, wait for removal, strip leading `new_os_window`, reopen. `close_session` was unsuitable for this operation because `confirm_os_window_close -1` can prompt when a running zmx client counts as an active process. The user disliked redraw, focus jumps, and landing last. The bring script was replaced, not retained as a fallback.
3. **Sidebar latency change** (also `86be986`): `_sync` starts docks for on-screen tabs first and starts the rest one per timer pass, **20 ms** apart. The regression test failed against the preceding code. The full suite then passed **235** tests. The original dock relaunch guard was preserved; the new test did not cover repeated toggles.
4. **Second reattach (this commit):** live tab moves, `ctrl-o`, and placement hints. Initial user testing after restart was positive; not separately verified live: each A–E branch, rapid reattach after changing layout, host reattach, move order, and recorded old slot/split in every layout. Tests exercise routing and command arguments with fakes.

**Pinned or checked versions:** kitty `0.50.0`, zmx `1.0.1`, fzf `0.75.0`, Yazi `26.9.1`. Some scripts target macOS Python `3.9`; keep that constraint when changing the stdin payload or sidebar.

- **kitty `0.50.0`:** `active_session` comes from the focused OS window and is global to a kitty process; `goto_session` on an open workspace can focus another OS window. A tab is not a shared view. `_move_tab_to` creates a replacement tab and preserves its panes but drops the tab’s `created_in_session_name`. Without repair, the renamed tab metadata is absent from filtering and session serialization. `launch --next-to` chooses a pane/tab destination, but new-tab `before`/`after` placement uses the destination manager’s active tab among shown tabs. The watcher and custom tab bar depend on internals; `INTERNALS`, `FUNCTIONS`, and `_missing` are checks, not a compatibility layer.
- **Dock API:** `launch --type=tab-dock` creates the dock outside the usual layout; it closes when the last non-docked pane closes. The pinned docs do not document hide/show or in-place dock resize; layout resize is not proof that a dock can resize. No live dock-resize test ran.
- **zmx `1.0.1`:** labels survive detach; `zmx set` accepts restricted label text, so names are hex-encoded. A pane closed before the roughly 2 s save/label pass may never get a label or may have stale placement. A pane outside a workspace gets no workspace label by design. Remote `zmx set` refusals have been seen; the command is attempted through `zhost`, with bounded retries via `zlabel=retry`. End-to-end remote placement labels were not verified. zmx has a Unix socket name/length limit; keep the holder name guard. Never use bare `zmx detach` in a test: without a name it detaches the current session’s clients.
- **Remote limits:** keepalives are not proof of sleep/wake recovery. A wedged shared master and typed keys reaching a session after reconnect remain open risks; logout behaviour has unit coverage but was not exhaustively exercised live. zmx reboot persistence is an upstream limitation, not a workspace restore bug.

### 4. Open problem: sidebar speed and rapid toggling

**Repro:** after restart, toggle `cmd+alt+b` 4–5 times back to back in a populated workspace. The user saw it stop showing until switching spaces. The target is both native-feeling visible response and the correct final state after repeated presses, without a workspace switch.

- **Confirmed defect in the code:** `_dock` counts all launches, including intentional off/on cycles. After three launches within 10 s for a tab, it refuses another. That guard dates to the initial dock implementation (`3506b1a`); it was meant to stop a crashing child from relaunching indefinitely. No retry is scheduled solely for expiry of that guard.
- **Separate race identified from source, not independently reproduced:** kitty’s close request marks the dock for later removal. A quick on pass can still see the closing dock and decide there is nothing to launch. The toggle has no explicit close-completion reconciliation. A workspace switch dirties the bar and gives `_sync` another pass; that does not distinguish guard expiry, another tab’s budget, and the close race.
- **Measurements before the visible-first change, with 12 docks:** remote toggle command returned about **150 ms on**, **28 ms off**, and **22 ms** for a no-op user var. Dock launch cost was about **10 ms each**; the batch held kitty’s loop for about **125 ms**. Standalone `zside` reported ready in about **45 ms**; first visible text was observed at around **250 ms** with coarse polling. These are not post-change end-to-end measurements. The structural cost remains: closing and recreating a Python process, terminal layout changes, then `ready`/push before paint.

Four options, none implemented for this issue:

| Option | What is known |
|---|---|
| **1. Correct the existing lifecycle** | Track expected closes separately from crashes, and reconcile after removal. Do not count intentional toggles against recovery. The original estimate was a small watcher change plus race and spam tests; measure before claiming any latency gain. Still starts a process on show. Avoid replacing a closing dock in a way that produces two visible docks or needless reflow. |
| **2. Test a warm dock that shrinks and grows** | Try it on one disposable dock. It could avoid child startup if the API works. A one-column dock would still reserve space. Docks sit outside the layout and the pinned docs give no supported resize/hide action; this is a hypothesis, not an available solution. |
| **3. Review the whole sidebar path first** | Recommended: review toggle state, launch/close ownership, `_sync` scheduling, `_push`, `zside` startup, and `zkitty.dock` before editing. Roughly 1,000 lines in scope. In particular, check both the watcher and the eager dock launch from `zkitty.run()` on new tabs. A rebuild decision follows the review, not the symptom. |
| **4. Ask upstream for native dock hide/show** | A native layout/visibility action could keep the dock process and screen alive without a one-column remnant or a private geometry mutation. No upstream request was filed in this session. It does not fix this checkout now. |

### 5. Exact checkout and verification

The first reattach and the visible-first sidebar are in `86be986`; the shell and Yazi changes are in `30550fc`. The commit that adds this file also records the second reattach change, seven files (281 insertions, 137 deletions under `config/kitty`):

| File | Change |
|---|---|
| `~/Dev/dotfiles/config/kitty/bin/zpick` | Separates origin `attach()` from workspace `put()`. Reads four route fields, adds neighbour and slot placement, moves tabs before default case-B attach, uses `--keep-focus` for `ctrl-o`, reroutes after reopening, and changes fzf’s key list and footer. |
| `~/Dev/dotfiles/config/kitty/bin/zpick-rows` | Extends `route()` to `(state, workspace, place, window)`; decodes `near`, reads `slot`, excludes sidebar docks from placement candidates, prefers a live tab-mate in W, falls back to the saved tab index. Display row format is unchanged. |
| `~/Dev/dotfiles/config/kitty/bin/zws` | Removes `bring` and its usage line. Corrects the usage-header range from `2,10p` to `2,9p`. `new --holder`, rename, close and worktree actions remain. |
| `~/Dev/dotfiles/config/kitty/workspaces.py` | `_label` walks tabs, computes `space`, `slot`, and `near`, caches the label tuple, and updates the local/remote launch arguments while retaining retry. `_adopt` runs on tab-bar dirty and gives an unnamed tab a workspace name when all its panes agree on one nonempty name. Adds the tab attribute to the internal API check. No sidebar spam fix is in this diff. |
| `~/Dev/dotfiles/config/kitty/tests/test_scripts.py` | Replaces fake close/reopen assertions with move/keep-focus/placement cases; retains the prompts, no-route fallback and explicit `zshell` checks. |
| `~/Dev/dotfiles/config/kitty/tests/test_side.py` | Updates route result shape and adds tab-mate precedence, slot fallback, dock exclusion, wrong-workspace and invalid-label cases. |
| `~/Dev/dotfiles/config/kitty/tests/test_workspaces.py` | Adds tabs to the fake boss; checks labels and relabelling, dock exclusion, tab adoption, remote argument order and retry bookkeeping. |

**Status: implemented, smoke-tested by the user, not verified case by case.** Full suite on the committed tree, 2026-11-28: `./config/kitty/check.sh` ran **238 tests in 172.6 s, OK**. `python3 -m unittest discover -s config/zmx/tests` from `~/Dev/dotfiles` passed **10**. The `ResourceWarning` lines the suite prints for unclosed row files predate this change. `nvfmt` reported existing lint findings outside the changed lines.

### 6. Gotchas and references

- **Restart boundary:** kitty loads watcher/custom-tab-bar Python into its process. Restart with `cmd+q`, then `cmd+enter` for watcher changes; `bin/` script changes alone are read on invocation. The user already restarted for this working tree. Leave `DrawData` colours as kitty `Color` objects; ints raised `TypeError` and caused fallback to the fade tab style.
- **Window identity:** a persistent zmx shell may keep stale `KITTY_WINDOW_ID`. Resolve the current pane from live kitty data using `var:holder` when validating a reattach. `remote_control_script` on `0.50.0` also did not expand `@active-kitty-window-id` here; `zgoto` handles that. Do not use real user panes for lifecycle tests.
- **Launch semantics:** an externally launched tab does not automatically join the caller’s workspace. Use explicit source/session targeting as appropriate; local Yazi uses `--source-window` and `--add-to-session .`. Yazi `26.9.1` passes the hover as `%h`; pass it as a separate `sh -c` argument. The picker leaves normal reattach commands to the configured shell, but must name `zshell` explicitly in a plain instance.
- **Intent channels:** `zdo` from a dock is role/argv checked. `zside=toggle` uses another user-var path; do not assume `zdo` guards it. The watcher clears command variables so session restore cannot replay a toggle. Keep process launch in kitty’s launch path, not a `subprocess` in the watcher thread. The picker’s y/n prompt deliberately saves terminal file descriptors `3` and `4`, separate from its row input and suppressed command output.
- **Tests:** stale bytecode for the extensionless `zpick-rows` under `~/Dev/dotfiles/config/kitty/bin/__pycache__` previously made full discovery load an old module while targeted tests passed. The symptom was `has no attribute 'route'`. `PYTHONDONTWRITEBYTECODE=1` stops writes, not reads of existing bytecode. Existing `ResourceWarning` messages in row-file reads predate this redesign.
- **Code:** `~/Dev/dotfiles/config/kitty/kitty.conf:245–279` and `~/Dev/dotfiles/config/kitty/keys.txt` for keys; `~/Dev/dotfiles/config/kitty/bin/zpick:194–248` and `~/Dev/dotfiles/config/kitty/bin/zpick-rows:133` for routing; `~/Dev/dotfiles/config/kitty/workspaces.py:199`, `:265`, `:376`, `:412`, `:424`, `:503`, and `:591` for labels, adoption, view push and toggle. `~/Dev/dotfiles/config/kitty/zkitty.py:136` launches the dock; `~/Dev/dotfiles/config/kitty/bin/zside:601` owns its terminal loop. SSH/ports: `~/Dev/dotfiles/config/kitty/bin/kmain`, `~/Dev/dotfiles/config/kitty/bin/zshell`, `~/Dev/dotfiles/config/kitty/bin/zhost`, `~/Dev/dotfiles/config/kitty/bin/zrun`, and `~/Dev/dotfiles/config/kitty/bin/zports`.
- **Upstream references:** `kovidgoyal/kitty` tag `v0.50.0`: `Boss._move_tab_to`, `Boss.mark_window_for_close`, `Tab.take_over_from`, `TabManager.new_tab`, `tab_for_window`, and the **Docked windows** documentation. These were checked in version-tagged source and docs; the documentation lookup service returned HTTP 429, so it was not used as evidence. `neurosnap/zmx`: reboot persistence issue `#76`, stable protocol request `#307`, and switch/label leak fix PR `#320`. No external community survey was used to diagnose the toggle.

### 7. When the freeze lifts

1. `cd ~/Dev/dotfiles && ./config/kitty/check.sh`: get a clean full-suite result before building on it.
2. Review the sidebar path before editing. Establish a disposable live baseline for one tab and many tabs; measure key-to-first-visible-paint and off latency, and test odd/even bursts without switching workspaces. Test intentional close, delayed removal, launch failure and a genuinely crashing dock separately. Expected: latest toggle wins; one dock per eligible tab when on, none when off; crash protection still bounds retries.
3. Preserve reattach semantics and native tab placement during the sidebar work. Do not restart the user’s kitty or clean unrelated changes on the strength of these notes. Before a rebuild, verify A–E and `ctrl-s` manually, including `ctrl-o` focus, move order, and stale or absent placement labels.
4. To check this handoff against the checkout: `cd ~/Dev/dotfiles && git log -3 --oneline -- config/kitty && git diff --check -- config/kitty && python3 -m unittest discover -s config/zmx/tests`.
