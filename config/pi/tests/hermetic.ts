// Import first in every test file. It gives the test process its own TMPDIR, removed when
// the process exits, so neither the tests nor the scripts they spawn leave temp dirs behind
// (64k of them had piled up). It also drops secret-looking variables from the environment,
// so no test, fake or child process sees a real credential (scout sandboxes once wrote the
// GitHub token to disk).
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SECRET_NAME =
  /TOKEN|SECRET|PASSW|API_?KEY|ACCESS_KEY|CREDENTIAL|PRIVATE_KEY/i;

for (const name of Object.keys(process.env))
  if (SECRET_NAME.test(name)) delete process.env[name];

// realpath: macOS's TMPDIR sits under the /var -> /private/var link, and a child's cwd comes back resolved
export const TEST_ROOT = realpathSync(mkdtempSync(join(tmpdir(), "pi-test-")));
process.env.TMPDIR = TEST_ROOT;
process.on("exit", () => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});
