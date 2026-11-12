// Tell kitty about the pi in this pane through user vars (OSC 1337 SetUserVar):
//  - pi_session: kitty's save_as_session writes it as --var, and kitty/bin/zshell resumes that
//    session when the pane's zmx session is gone (after a reboot).
//  - pi_model, pi_ctx: the model and context use shown in the sidebar (kitty/bin/zside).
// A clean quit clears them.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const setVar = (name: string, value?: string): void => {
  const v = value === undefined ? "" : `=${Buffer.from(value).toString("base64")}`;
  process.stdout.write(`\x1b]1337;SetUserVar=${name}${v}\x07`);
};

const setUsage = (ctx: ExtensionContext): void => {
  const percent = ctx.getContextUsage()?.percent;
  setVar("pi_ctx", percent == null ? undefined : `${Math.round(percent)}%`);
};

export default function (pi: ExtensionAPI): void {
  if (!process.env.KITTY_WINDOW_ID) return;
  pi.on("session_start", async (_event, ctx) => {
    const file = ctx.sessionManager.getSessionFile();
    if (file) setVar("pi_session", file);
    setVar("pi_model", ctx.model?.id);
    setUsage(ctx);
  });
  pi.on("model_select", async (event) => setVar("pi_model", event.model.id));
  pi.on("turn_end", async (_event, ctx) => setUsage(ctx));
  pi.on("session_compact", async (_event, ctx) => setUsage(ctx));
  pi.on("session_shutdown", async (event) => {
    if (event.reason === "quit") for (const name of ["pi_session", "pi_model", "pi_ctx"]) setVar(name);
  });
}
