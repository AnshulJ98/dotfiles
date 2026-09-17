/**
 * Scout visibility: footer status while a bin/scout child runs, and one chat
 * entry per scout when it finishes. Zero model tokens either way.
 *
 * Contract with bin/scout (the wrapper owns the spawn; this file only reads
 * what it leaves behind under <sessions>/scout/):
 *   .running/<pid>.meta   key=value: pid model thinking started session task
 *   .running/<pid>.out    digest so far (tee'd stdout)
 *   .done/<pid>.meta      the same keys plus rc finished, written last
 *   .done/<pid>.out       final digest
 *   <pid>/*.jsonl         the child's own session file(s); cost comes from here
 *
 * The footer line is ctx.ui.setStatus, refreshed once a second from .running.
 * The chat entry is pi.appendEntry, which pi never sends to the model; it is
 * rendered by registerEntryRenderer, collapsed to one line, digest under
 * ctrl+o. Done files are claimed only by the session that launched the scout
 * (PI_SESSION_FILE recorded by the wrapper), so two pi terminals never steal
 * each other's entries; shell launches with no parent session are discarded.
 *
 * Skipped inside scouts (PI_SCOUT_DEPTH) so a child never polls for itself.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const POLL_MS = 1_000;
const SCOUT_ROOT = join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "sessions", "scout");
const RUNNING_DIR = join(SCOUT_ROOT, ".running");
const DONE_DIR = join(SCOUT_ROOT, ".done");
const ORPHAN_MS = 10 * 60_000;

interface ScoutMeta {
  pid: number;
  model: string;
  thinking: string;
  started: number;
  session: string;
  task: string;
}

interface ScoutDone extends ScoutMeta {
  rc: number;
  finished: number;
}

/** What the chat entry persists; rendered by the entry renderer below. */
interface ScoutEntry {
  model: string;
  thinking: string;
  started: number;
  finished: number;
  rc: number;
  cost: number;
  task: string;
  digest: string;
}

function parseMeta(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) fields[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return fields;
}

function readMetaFile(path: string): Record<string, string> | undefined {
  try {
    return parseMeta(readFileSync(path, "utf8"));
  } catch {
    return undefined; // Torn write or removed between readdir and read; next poll sees the truth.
  }
}

function toMeta(fields: Record<string, string>): ScoutMeta | undefined {
  const pid = Number(fields.pid);
  const started = Number(fields.started);
  if (!Number.isFinite(pid) || !Number.isFinite(started)) return undefined;
  return {
    pid,
    model: fields.model ?? "?",
    thinking: fields.thinking ?? "?",
    started,
    session: fields.session ?? "",
    task: fields.task ?? "",
  };
}

function removeQuietly(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Already gone.
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function listMetaFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".meta"));
  } catch {
    return [];
  }
}

function readRunning(): ScoutMeta[] {
  const scouts: ScoutMeta[] = [];
  for (const name of listMetaFiles(RUNNING_DIR)) {
    const path = join(RUNNING_DIR, name);
    const fields = readMetaFile(path);
    const meta = fields && toMeta(fields);
    if (!meta) continue;
    if (!isAlive(meta.pid)) {
      // The wrapper's EXIT trap did not run (SIGKILL); reap so no phantom scout lingers.
      removeQuietly(path);
      removeQuietly(path.replace(/\.meta$/, ".out"));
      continue;
    }
    scouts.push(meta);
  }
  return scouts.sort((a, b) => a.started - b.started);
}

/** Sum cost of the child's assistant messages stamped at or after `since` (excludes a --fork copy's inherited history). */
function costOf(pid: number, since: number): number {
  const dir = join(SCOUT_ROOT, String(pid));
  let total = 0;
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return 0;
  }
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(join(dir, file), "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      if (!line.includes('"assistant"')) continue;
      try {
        const entry = JSON.parse(line) as {
          type?: string;
          message?: { role?: string; timestamp?: number; usage?: { cost?: { total?: number } } };
        };
        const message = entry.message;
        if (entry.type !== "message" || message?.role !== "assistant") continue;
        if ((message.timestamp ?? 0) < since) continue;
        total += message.usage?.cost?.total ?? 0;
      } catch {
        // Partial trailing line while the child is still writing.
      }
    }
  }
  return total;
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function shortModel(model: string): string {
  return model.split("/").pop() ?? model;
}

function renderStatus(scouts: ScoutMeta[], now: number): string {
  const first = scouts[0]!;
  const cost = scouts.reduce((sum, s) => sum + costOf(s.pid, s.started), 0);
  const label = scouts.length === 1 ? "scout" : `scout ×${scouts.length}`;
  return `⟳ ${label} ${shortModel(first.model)}/${first.thinking} ${formatElapsed(now - first.started)} $${cost.toFixed(3)}`;
}

function outcome(rc: number): string {
  switch (rc) {
    case 0:
      return "done";
    case 124:
      return "timeout";
    case 2:
      return "usage error";
    default:
      return `rc ${rc}`;
  }
}

/** Claim finished scouts that belong to `sessionFile`; discard orphans and other sessions' stale leftovers. */
function takeDone(sessionFile: string, now: number): ScoutEntry[] {
  const entries: ScoutEntry[] = [];
  for (const name of listMetaFiles(DONE_DIR)) {
    const metaPath = join(DONE_DIR, name);
    const outPath = metaPath.replace(/\.meta$/, ".out");
    const fields = readMetaFile(metaPath);
    const meta = fields && toMeta(fields);
    if (!meta) continue;
    const finished = Number(fields.finished) || now;
    const mine = meta.session !== "" && meta.session === sessionFile;
    const orphan = meta.session === "" || now - finished > ORPHAN_MS;
    if (!mine && !orphan) continue;
    if (mine) {
      let digest = "";
      try {
        digest = readFileSync(outPath, "utf8").trim();
      } catch {
        // No digest captured (killed before any output).
      }
      const done: ScoutDone = { ...meta, rc: Number(fields.rc) || 0, finished };
      entries.push({
        model: done.model,
        thinking: done.thinking,
        started: done.started,
        finished: done.finished,
        rc: done.rc,
        cost: costOf(done.pid, done.started),
        task: done.task,
        digest,
      });
    }
    removeQuietly(metaPath);
    removeQuietly(outPath);
  }
  return entries.sort((a, b) => a.started - b.started);
}

export default function (pi: ExtensionAPI) {
  if (process.env.PI_SCOUT_DEPTH) return;

  let timer: ReturnType<typeof setInterval> | undefined;
  let shown = false;

  pi.registerEntryRenderer<ScoutEntry>("scout", (entry, { expanded }, theme) => {
    const d = entry.data;
    if (!d) return undefined;
    const status = d.rc === 0 ? theme.fg("success", outcome(d.rc)) : theme.fg("error", outcome(d.rc));
    const header =
      theme.fg("toolTitle", theme.bold("scout ")) +
      theme.fg("accent", `${shortModel(d.model)}/${d.thinking}`) +
      theme.fg("muted", ` · ${formatElapsed(d.finished - d.started)} · $${d.cost.toFixed(3)} · `) +
      status +
      theme.fg("dim", ` · ${d.task}`);
    if (!expanded) return new Text(header, 0, 0);
    const body = d.digest.length > 0 ? d.digest : "(no digest)";
    return new Text(`${header}\n${theme.fg("dim", body)}`, 0, 0);
  });

  const tick = (ctx: ExtensionContext) => {
    const now = Date.now();
    const sessionFile = ctx.sessionManager.getSessionFile() ?? "";
    for (const entry of takeDone(sessionFile, now)) {
      pi.appendEntry<ScoutEntry>("scout", entry);
    }
    const scouts = readRunning();
    if (scouts.length === 0) {
      if (shown) ctx.ui.setStatus("scout", undefined);
      shown = false;
      return;
    }
    ctx.ui.setStatus("scout", ctx.ui.theme.fg("accent", renderStatus(scouts, now)));
    shown = true;
  };

  const start = (ctx: ExtensionContext) => {
    if (timer) clearInterval(timer);
    timer = setInterval(() => tick(ctx), POLL_MS);
    // Headless runs must exit when the turn ends; the poll must not hold the event loop open.
    timer.unref();
  };

  // session_start also fires for /new, /resume and fork, with the new ctx.
  pi.on("session_start", async (_event, ctx) => start(ctx));
  // Headless parents exit before the next poll; claim whatever finished in the last second.
  pi.on("session_shutdown", async (_event, ctx) => {
    if (timer) clearInterval(timer);
    timer = undefined;
    tick(ctx);
  });
}
