/**
 * Deferred installation of runtimes / CLIs that the base image doesn't ship.
 * The base stays lean; repos that actually need Deno pay the install cost
 * once, on first use, and subsequent calls short-circuit.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import { DENO_BIN, DENO_INSTALL_DIR, WORKDIR } from "./config.mjs";
import { appendLog } from "./events.mjs";

/**
 * Shallow clone of `process.env` with `DAEMON_TOKEN` stripped. Every spawned
 * child gets this — the token must never leak to user code or installed CLIs.
 */
export function childEnv(extra) {
  const env = { ...process.env, ...(extra ?? {}) };
  delete env.DAEMON_TOKEN;
  return env;
}

/**
 * Shared lazy-install runner. Short-circuits if `checkReady` is already true,
 * dedupes concurrent callers via an in-flight Map, pipes subprocess output
 * into the setup log ring, and runs an optional `onSuccess` hook before the
 * final readiness check. Resolves true iff the install exited 0 AND
 * `checkReady` passes afterward.
 */
const installPromises = new Map();
function lazyInstall(key, opts) {
  if (opts.checkReady()) return Promise.resolve(true);
  const existing = installPromises.get(key);
  if (existing) return existing;
  const p = new Promise((resolve) => {
    appendLog("setup", opts.startLog);
    const child = spawn(opts.cmd, opts.args, {
      cwd: WORKDIR,
      env: childEnv(opts.env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => appendLog("setup", d));
    child.stderr.on("data", (d) => appendLog("setup", d));
    child.on("close", (code) => {
      if (code === 0 && opts.onSuccess) {
        try {
          opts.onSuccess();
        } catch (err) {
          appendLog(
            "setup",
            `[setup] ${opts.name} post-install error: ${String(err)}\n`,
          );
        }
      }
      const ok = code === 0 && opts.checkReady();
      if (!ok) {
        appendLog(
          "setup",
          `[setup] ${opts.name} install failed (exit ${code})\n`,
        );
      }
      installPromises.delete(key);
      resolve(ok);
    });
    child.on("error", (err) => {
      appendLog(
        "setup",
        `[setup] ${opts.name} install spawn error: ${String(err)}\n`,
      );
      installPromises.delete(key);
      resolve(false);
    });
  });
  installPromises.set(key, p);
  return p;
}

/** Install Deno into `/opt/deno` on first use. Base image ships Node + Bun only. */
export function ensureDenoInstalled() {
  return lazyInstall("deno", {
    name: "Deno",
    startLog: `[setup] installing Deno into ${DENO_INSTALL_DIR}\n`,
    checkReady: () => fs.existsSync(DENO_BIN),
    cmd: "bash",
    args: ["-lc", "curl -fsSL https://deno.land/install.sh | sh -s -- -y"],
    env: { DENO_INSTALL: DENO_INSTALL_DIR },
  });
}
