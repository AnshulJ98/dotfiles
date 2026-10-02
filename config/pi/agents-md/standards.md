
# Code

## Design

- Give a module a small interface that hides a lot of work. It leaks
  when callers must pass config shaped like its internals, catch errors
  that name its internals, or call its methods in a set order.
- Keep logic pure and push I/O (files, network, clock) to a thin outer
  layer.
- Add a swappable interface only when two real implementations exist,
  usually production and a test fake. Test pure logic through its public
  interface; don't inject it.
- Abstract on the third use, not before. Prefer deleting code to adding
  it.
- When one change needs the same edit in many places, name the missing
  module before making the edits.
- Comments state what the code can't show: a constraint, a reason, or a
  known defect labeled as a defect. Match the surrounding comment
  density, and never invent a rationale.

## Errors

Absorb an error inside the module when callers can't act on it; detect
it at the boundary rather than deep in the stack; crash on states you
can't recover from. Never swallow an error silently or leak module
internals through error types.

## Testing

- Before changing code, know which check will prove it works: an
  existing test, a new test, or a command whose output shows it.
- While working, run the tests for the code you touched. Run the full
  suite once before calling the work done or committing. If a failure is
  in code you didn't touch, confirm it also fails without your change,
  then report it instead of fixing it.
- A bug fix ships with a test that fails without the fix. Write it
  before the fix when the cause is still unknown, since that is how you
  find it.
- Never weaken, skip, or delete a test to get green. Fixtures, golden
  files, and snapshots encode external contracts: fix the code, or ask.
- Pure logic gets table-driven tests with no mocks. Mock only at real
  system boundaries; wanting a mock elsewhere means logic and I/O are
  tangled. Tests use the interface callers use. The `testing-patterns`
  skill has the details.

## TypeScript

Strict mode. No `any`; use `unknown` when the type is genuinely unknown.
`interface` for object shapes; discriminated unions with an exhaustive
`switch` ending in `never` for state machines. `@ts-expect-error` with a
reason, never `@ts-ignore`. Prefer the standard library (`parseArgs`
from `node:util` over commander). Barrel `index.ts` files only at module
boundaries. Make impossible states unrepresentable, and expose the
narrowest type the caller needs.

## Repo Hygiene

- Match the repo's naming, layout, and idiom, not its defects: new lines
  don't copy `any`, swallowed errors, or dead code from their neighbors.
- Before changing a function, find every caller. One guard in the shared
  function beats a guard in each caller.
- New configs come from the official CLI (`pnpm init`, `tsc --init`,
  `npx shadcn@latest init`), never written by hand.
- Before committing, fix lint errors in the lines you changed and report
  pre-existing ones.
- Branches are lowercase-hyphen with `feature/`, `bugfix/`, `hotfix/`, or
  `refactor/`. Commits are conventional (`<type>: <description>`). Merge
  to master with `--no-ff`.
- Agent instructions are generated: edit the fragments in
  `config/pi/agents-md/` of the dotfiles repo and run `build-agents.sh`.
  Editing a generated `AGENTS.md` or `CLAUDE.md` directly is an error;
  `build-agents.sh --check` catches it.
