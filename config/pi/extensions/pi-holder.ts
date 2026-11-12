// Tell kitty which pi session runs in this pane, as the user var `pi_session` (OSC 1337
// SetUserVar). kitty's save_as_session writes it as `--var`, and kitty/bin/zshell resumes that
// session when the pane's zmx session is gone (after a reboot). A clean quit clears it.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const setVar = (value?: string): void => {
  const v = value === undefined ? "" : `=${Buffer.from(value).toString("base64")}`;
  process.stdout.write(`\x1b]1337;SetUserVar=pi_session${v}\x07`);
};

export default function (pi: ExtensionAPI): void {
  if (!process.env.KITTY_WINDOW_ID) return;
  pi.on("session_start", async (_event, ctx) => {
    const file = ctx.sessionManager.getSessionFile();
    if (file) setVar(file);
  });
  pi.on("session_shutdown", async (event) => {
    if (event.reason === "quit") setVar();
  });
}
