// zmx 1.0.1 documents print-env for the current attaching client's environment.
// A long-running pi keeps the old KITTY_* values across a detach/reattach; never use those
// to target remote control when zmx says there is no attaching kitty.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function kittyEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (!env.ZMX_SESSION) return env;
  const current = { ...env };
  delete current.KITTY_LISTEN_ON;
  delete current.KITTY_WINDOW_ID;
  try {
    // One response keeps the socket and pane id from the same attaching client.
    const output = execFileSync("zmx", ["print-env", "."], {
      env, encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of output.split("\n")) {
      const match = /^(KITTY_LISTEN_ON|KITTY_WINDOW_ID)=(.+)$/.exec(line);
      if (match) current[match[1]] = match[2];
    }
  } catch { /* No attached client or unavailable zmx: no kitty target, not the old pane. */ }
  return current;
}

// Shell callers read two lines without evaluating shell code.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const env = kittyEnvironment();
  if (env.KITTY_LISTEN_ON && /^\d+$/.test(env.KITTY_WINDOW_ID ?? "")) {
    console.log(env.KITTY_LISTEN_ON);
    console.log(env.KITTY_WINDOW_ID);
  } else process.exitCode = 1;
}
