// Run: node --test config/nvim/tests/nvfmt.test.ts
// bin/nvfmt against the installed nvim config: real nvim, conform, shfmt, prettierd, shellcheck and git.
// Temp directories only. Skipped where that config is not installed.
import "../../pi/tests/hermetic.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const NVFMT = resolve(import.meta.dirname, "../bin/nvfmt");
const UGLY = '#!/bin/sh\nif true; then\n        echo "hi"\nfi\n';
const TIDY = '#!/bin/sh\nif true; then\n  echo "hi"\nfi\n';

const PROBE = [
  'local ok, conform = pcall(require, "conform")',
  'local ready = ok and pcall(require, "lint") and vim.fn.executable("shellcheck") == 1',
  'for _, name in ipairs({ "shfmt", "prettierd" }) do ready = ready and conform.get_formatter_info(name).available end',
  'vim.cmd("cquit " .. (ready and 0 or 1))',
].join("; ");
const probe = spawnSync(
  "nvim",
  ["--headless", "-c", `lua ${PROBE}`, "-c", "cquit 1"],
  { stdio: "ignore" },
);
const skip =
  probe.status === 0
    ? false
    : "the nvim config with conform, shfmt, prettierd and shellcheck is not installed";

const tmp = (): string => realpathSync(mkdtempSync(join(tmpdir(), "nvfmt-")));
const emptyConfig = join(tmp(), "gitconfig");
writeFileSync(emptyConfig, "");
const env: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: emptyConfig,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
};

interface Result {
  status: number | null;
  stdout: string;
  stderr: string;
}
const run = (cwd: string, command: string, ...args: string[]): Result => {
  const r = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};
const git = (cwd: string, ...args: string[]): Result => {
  const r = run(cwd, "git", ...args);
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r;
};
const put = (dir: string, name: string, content: string): void => {
  mkdirSync(resolve(dir, name, ".."), { recursive: true });
  writeFileSync(join(dir, name), content);
};
const get = (dir: string, name: string): string =>
  readFileSync(join(dir, name), "utf8");
const repo = (): string => {
  const dir = tmp();
  git(dir, "init", "-q");
  return dir;
};

test(
  "named files are formatted outside a repo, and the exempt ones are left alone",
  { skip },
  () => {
    const dir = tmp();
    const markdown = "#  title\n\n\n\ntext\n";
    const generated = `# GENERATED from x. Do not edit.\n${UGLY}`;
    put(dir, "a.sh", UGLY);
    put(dir, "b.ts", "const a = {x:1}\n");
    put(dir, "notes.md", markdown);
    put(dir, "gen.sh", generated);
    put(dir, "target.sh", UGLY);
    symlinkSync(join(dir, "target.sh"), join(dir, "link.sh"));

    const r = run(dir, NVFMT, "a.sh", "b.ts", "notes.md", "gen.sh", "link.sh");

    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(get(dir, "a.sh"), TIDY);
    assert.equal(get(dir, "b.ts"), "const a = { x: 1 };\n");
    assert.equal(get(dir, "notes.md"), markdown);
    assert.equal(get(dir, "gen.sh"), generated);
    assert.equal(get(dir, "target.sh"), UGLY);
    assert.match(r.stdout, /^formatted a\.sh$/m);
    assert.match(
      r.stdout,
      /^nvfmt: 4 files, 2 formatted, 0 lint findings, 0 failed$/m,
    );
    assert.equal(run(dir, NVFMT).status, 2, "no files named outside a repo");
  },
);

test("a lint finding is printed with its line and exits 1", { skip }, () => {
  const dir = tmp();
  put(dir, "c.sh", "#!/bin/sh\necho $1\n");

  const r = run(dir, NVFMT, "c.sh");

  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^c\.sh:2:\d+: shellcheck 2086 /m);
});

test(
  "a formatter failure exits 2 and leaves the file as it was",
  { skip },
  () => {
    const dir = tmp();
    put(dir, "bad.ts", "const = ;\n");

    const r = run(dir, NVFMT, "bad.ts");

    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /bad\.ts: .*prettierd/);
    assert.equal(get(dir, "bad.ts"), "const = ;\n");
  },
);

test(
  "with no files it takes a repo's changed and untracked files, and skips -nvfmt paths",
  { skip },
  () => {
    const dir = repo();
    put(dir, ".gitattributes", "fixtures/** -nvfmt\n");
    put(dir, "old.sh", UGLY);
    put(dir, "mod.sh", TIDY);
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "base");
    put(dir, "mod.sh", UGLY);
    put(dir, "new.sh", UGLY);
    put(dir, "fixtures/x.sh", UGLY);

    const r = run(join(dir, "fixtures"), NVFMT);

    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(get(dir, "mod.sh"), TIDY);
    assert.equal(get(dir, "new.sh"), TIDY);
    assert.equal(get(dir, "old.sh"), UGLY, "unchanged since HEAD");
    assert.equal(get(dir, "fixtures/x.sh"), UGLY, "-nvfmt");
  },
);

test(
  "--staged in a pre-commit hook puts the formatted file in the commit",
  { skip },
  () => {
    const dir = repo();
    put(dir, ".git/hooks/pre-commit", `#!/bin/sh\nexec "${NVFMT}" --staged\n`);
    chmodSync(join(dir, ".git/hooks/pre-commit"), 0o755);
    const committed = (name: string): string =>
      git(dir, "show", `HEAD:${name}`).stdout;

    put(dir, "a.sh", UGLY);
    git(dir, "add", "a.sh");
    git(dir, "commit", "-qm", "staged");
    assert.equal(committed("a.sh"), TIDY);
    assert.equal(git(dir, "status", "--porcelain").stdout, "");

    put(dir, "a.sh", `${UGLY}echo more\n`);
    git(dir, "commit", "-qam", "all");
    assert.equal(committed("a.sh"), `${TIDY}echo more\n`, "git commit -a");
    assert.equal(git(dir, "status", "--porcelain").stdout, "");

    put(dir, "both.sh", UGLY);
    git(dir, "add", "both.sh");
    put(dir, "both.sh", `${UGLY}echo later\n`);
    const partly = git(dir, "commit", "-m", "partly staged");
    assert.equal(
      committed("both.sh"),
      UGLY,
      "a file with unstaged changes is committed as staged",
    );
    assert.match(
      partly.stderr,
      /left alone, it has unstaged changes: both\.sh/,
    );
    assert.equal(get(dir, "both.sh"), `${UGLY}echo later\n`);

    put(dir, "a.sh", `${UGLY}echo more\necho last\n`);
    const first = run(dir, "git", "commit", "-m", "by path", "a.sh");
    assert.notEqual(
      first.status,
      0,
      "git commit <paths> is refused once the hook formatted",
    );
    assert.match(first.stderr, /run the commit again/);
    git(dir, "commit", "-qm", "by path", "a.sh");
    assert.equal(committed("a.sh"), `${TIDY}echo more\necho last\n`);
    assert.equal(git(dir, "status", "--porcelain").stdout, " M both.sh\n");
  },
);
