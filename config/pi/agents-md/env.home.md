# Home Setup

Repos in `~/Dev` on the Mac (layout since 11-27):

- `dotfiles` (public): config, the pi harness, skills; source of the global
  AGENTS.md.
- `memory` (private): `memory.md`, linked from `~/.pi/agent/memory.md` and
  committed and pushed every 10 minutes by `memory-sync`. Memory never goes
  in dotfiles, which is public.
- `durable-agent` (public): the always-on agent service for winpc, with
  `browser/`.
- `labs` (private): `/learn` tutorials, one folder per lab.
- `scratchpad` (public): `spikes/` only.
- `kits` (private): interview prep in `prep/`, take-homes in
  `take-homes/`.
- `compendium` (private): `STREAMS.md` (each stream and its state) and
  `LOG.md` (one dated line per finished thing, with a receipt). Keep it
  terse; add to it when I ask.
- `projects/`: rubiks-cube, tdb, zmk-config-silakka54, FItWeBall,
  sdlc-kit (owns the shared ladder, ops, standards and six prompts),
  vscodext, clock-app.
- `archive/`: old repos kept as they were, plus `pi-lab` and `sim`, the
  agent-eval fixtures. Don't edit them.

winpc (`ssh winpc`, Ubuntu in WSL2) has `dotfiles`, `memory`,
`durable-agent`, `scratchpad` and `labs`; its services are systemd user
units.

- Agent instructions live only at the global level: no `AGENTS.md` or
  `CLAUDE.md` in a repo, except a kit's own guard file.
- Deletions go through `trash`, never `rm`.
- Pi sessions in kitty panes are driven with the `kitty-orchestrate` skill.
