/**
 * One-off script execution via `<pm> run <name>` (or `deno task <name>`),
 * streamed into the shared SSE log ring under `source: <name>`.
 *
 * Errors carry `code` so the HTTP layer can pick the right status:
 *   INVALID | NOT_FOUND | ALREADY_RUNNING | DEV_OWNS
 */

import { spawn } from "node:child_process";
import { DEV_PORT, WORKDIR, childEnv } from "./config.mjs";
import { dev } from "./dev-state.mjs";
import { appendLog, broadcastProcesses } from "./events.mjs";
import { execChildren } from "./exec-state.mjs";
import { inspectWorkdir } from "./workdir.mjs";

export function startExec(name, cwd) {
  if (typeof name !== "string" || name.length === 0) {
    throw execError("script name required", "INVALID");
  }
  if (execChildren.has(name)) {
    throw execError(`script "${name}" already running`, "ALREADY_RUNNING");
  }
  const workdir = typeof cwd === "string" && cwd.length > 0 ? cwd : WORKDIR;
  const { scripts, pm } = inspectWorkdir(workdir);
  if (!scripts.includes(name)) {
    throw execError(`script "${name}" not found in ${workdir}`, "NOT_FOUND");
  }
  // The dev server owns :DEV_PORT and the phase machine — running its script
  // here would race /dev/start; route the caller to /dev/stop first.
  if (dev.pid && dev.script === name) {
    throw execError(
      `"${name}" is the active dev script — POST /dev/stop first`,
      "DEV_OWNS",
    );
  }

  const { cmd, args } = runCommand(pm, name);
  const child = spawn(cmd, args, {
    cwd: workdir,
    env: childEnv({ HOST: "0.0.0.0", PORT: String(DEV_PORT) }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  execChildren.set(name, child);
  appendLog(
    "daemon",
    `[sandbox-daemon] exec spawned ${cmd} ${args.join(" ")} (pid ${child.pid}, cwd ${workdir})\n`,
  );
  broadcastProcesses();

  child.stdout.on("data", (d) => appendLog(name, d));
  child.stderr.on("data", (d) => appendLog(name, d));
  child.on("exit", (code, signal) => {
    if (execChildren.get(name) === child) execChildren.delete(name);
    appendLog(
      "daemon",
      `[sandbox-daemon] exec ${name} exited (code=${code}, signal=${signal})\n`,
    );
    broadcastProcesses();
  });
  child.on("error", (err) => {
    if (execChildren.get(name) === child) execChildren.delete(name);
    appendLog(
      "daemon",
      `[sandbox-daemon] exec ${name} spawn error: ${String(err)}\n`,
    );
    broadcastProcesses();
  });

  return { pid: child.pid ?? null, pm, cwd: workdir };
}

/** SIGKILL so the UI's kill button is decisive; exit handler rebroadcasts. */
export function killExec(name) {
  const child = execChildren.get(name);
  if (!child) return false;
  try {
    child.kill("SIGKILL");
  } catch {}
  return true;
}

/** Best-effort: drain the map on daemon shutdown. */
export function stopAllExec() {
  for (const child of execChildren.values()) {
    try {
      child.kill("SIGKILL");
    } catch {}
  }
}

function runCommand(pm, name) {
  if (pm === "deno") return { cmd: "deno", args: ["task", name] };
  return { cmd: pm, args: ["run", name] };
}

function execError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}
