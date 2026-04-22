#!/usr/bin/env node
/**
 * Sandbox daemon entry: builds the HTTP server, routes control-plane requests
 * under `/_daemon/*`, and tears down the dev process on SIGINT/SIGTERM.
 *
 * Port layout inside the container:
 *   - `:DEV_PORT` (3000)  — the user's dev server, bound directly. Pods
 *     expose this port externally; the daemon does NOT proxy dev traffic.
 *   - `:DAEMON_PORT` (9000) — this daemon. Everything is under `/_daemon/*`
 *     and bearer-authed. Anything else on 9000 returns 404.
 */

import { spawn } from "node:child_process";
import http from "node:http";
import { authorized } from "./daemon/auth.mjs";
import {
  LOG_RING_CAP,
  MAX_SSE_CLIENTS,
  PORT,
  WORKDIR,
} from "./daemon/config.mjs";
import { startDecoWatcher } from "./daemon/deco-watcher.mjs";
import { startDev, stopDev } from "./daemon/dev-process.mjs";
import { dev } from "./daemon/dev-state.mjs";
import {
  appendLog,
  currentStatusPayload,
  readLogs,
  replayTo,
  subscribers,
} from "./daemon/events.mjs";
import {
  handleFsEdit,
  handleFsGlob,
  handleFsGrep,
  handleFsRead,
  handleFsWrite,
} from "./daemon/fs-ops.mjs";
import { readJson, send, sendText } from "./daemon/http-helpers.mjs";
import { childEnv } from "./daemon/lazy-install.mjs";
import { inspectWorkdir } from "./daemon/workdir.mjs";

const DAEMON_PREFIX = "/_daemon";

function runBash(command, timeoutMs, cwd = WORKDIR) {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], { cwd, env: childEnv() });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1, timedOut });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(err), exitCode: -1, timedOut });
    });
  });
}

/**
 * Reject any request that still carries a `threadId` param, so stale callers
 * surface as 400s instead of being silently accepted. Pod-per-thread → the
 * daemon has no thread concept any more.
 */
async function rejectsThreadId(req, res, url) {
  const u = new URL(url, "http://local");
  if (u.searchParams.has("threadId")) {
    send(res, 400, {
      error:
        "threadId is no longer supported — pod-per-thread; one sandbox, one dev process",
    });
    return true;
  }
  if (req.method === "POST") {
    const ctype = (req.headers["content-type"] ?? "").toLowerCase();
    if (ctype.includes("application/json")) {
      const body = await readJson(req).catch(() => null);
      if (body && typeof body === "object" && "threadId" in body) {
        send(res, 400, {
          error:
            "threadId is no longer supported — pod-per-thread; one sandbox, one dev process",
        });
        return true;
      }
      // Stash the already-parsed body so route handlers don't re-read the
      // stream (Node's IncomingMessage only yields its data once).
      req._parsedBody = body ?? {};
    }
  }
  return false;
}

async function parsedBody(req) {
  if (req._parsedBody !== undefined) return req._parsedBody;
  return (await readJson(req).catch(() => ({}))) ?? {};
}

const server = http.createServer(async (req, res) => {
  // Health is intentionally unauthenticated — runner probes it before a
  // token is in play. No /_daemon prefix because this is the only non-
  // /_daemon route the daemon answers.
  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, { ok: true });
    return;
  }

  const rawUrl = req.url ?? "/";

  // Everything else must be under /_daemon/*. Anything else is 404.
  if (!rawUrl.startsWith(`${DAEMON_PREFIX}/`) && rawUrl !== DAEMON_PREFIX) {
    send(res, 404, { error: "not found" });
    return;
  }

  // Sub-path after the daemon prefix, with query preserved.
  const sub = rawUrl.slice(DAEMON_PREFIX.length);
  const subUrl = sub.length === 0 ? "/" : sub;

  // CORS preflight for daemon-direct routes. Mesh normally proxies these
  // server-to-server so preflight rarely fires in practice, but browsers
  // that hit the daemon directly (dev loops, tools) still need the OK.
  if (
    req.method === "OPTIONS" &&
    (subUrl.startsWith("/fs/") || subUrl.startsWith("/_decopilot_vm/"))
  ) {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    });
    res.end();
    return;
  }

  if (!authorized(req)) {
    send(res, 401, { error: "unauthorized" });
    return;
  }

  if (await rejectsThreadId(req, res, subUrl)) return;

  if (req.method === "GET" && subUrl.startsWith("/_decopilot_vm/events")) {
    if (subscribers.size >= MAX_SSE_CLIENTS) {
      send(res, 429, { error: "too many SSE subscribers" });
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    subscribers.add(res);
    replayTo(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
        subscribers.delete(res);
      }
    }, 15_000);
    heartbeat.unref?.();
    res.on("close", () => {
      clearInterval(heartbeat);
      subscribers.delete(res);
    });
    return;
  }

  if (req.method === "POST" && subUrl === "/dev/start") {
    const body = await parsedBody(req);
    startDev(body).catch((err) => {
      appendLog(
        "daemon",
        `[sandbox-daemon] /dev/start error: ${String(err)}\n`,
      );
    });
    send(res, 202, currentStatusPayload());
    return;
  }
  if (req.method === "POST" && subUrl === "/dev/stop") {
    await stopDev().catch(() => {});
    send(res, 200, currentStatusPayload());
    return;
  }
  if (req.method === "GET" && subUrl.startsWith("/dev/status")) {
    send(res, 200, currentStatusPayload());
    return;
  }
  if (req.method === "GET" && subUrl.startsWith("/dev/logs")) {
    const u = new URL(subUrl, "http://local");
    const tail = Math.max(
      1,
      Math.min(LOG_RING_CAP, Number(u.searchParams.get("tail") ?? 200)),
    );
    const source = u.searchParams.get("source");
    const entries = readLogs(source)
      .slice(-tail)
      .map((e) => e.line)
      .join("\n");
    sendText(res, 200, entries + (entries ? "\n" : ""));
    return;
  }
  if (req.method === "GET" && subUrl.startsWith("/dev/scripts")) {
    const u = new URL(subUrl, "http://local");
    const cwdParam = u.searchParams.get("cwd");
    const scriptsCwd =
      cwdParam && cwdParam.length > 0 ? cwdParam : dev.cwd || WORKDIR;
    const { scripts, pm } = inspectWorkdir(scriptsCwd);
    send(res, 200, { scripts, pm, cwd: scriptsCwd });
    return;
  }

  if (req.method === "POST" && subUrl === "/fs/read")
    return handleFsRead(req, res);
  if (req.method === "POST" && subUrl === "/fs/write")
    return handleFsWrite(req, res);
  if (req.method === "POST" && subUrl === "/fs/edit")
    return handleFsEdit(req, res);
  if (req.method === "POST" && subUrl === "/fs/grep")
    return handleFsGrep(req, res);
  if (req.method === "POST" && subUrl === "/fs/glob")
    return handleFsGlob(req, res);

  if (req.method === "POST" && subUrl === "/bash") {
    try {
      const body = await parsedBody(req);
      const { command, timeout = 60_000, cwd } = body;
      if (typeof command !== "string" || command.length === 0) {
        send(res, 400, { error: "command is required" });
        return;
      }
      const result = await runBash(command, Number(timeout), cwd);
      send(res, 200, result);
    } catch (err) {
      send(res, 500, { error: String(err) });
    }
    return;
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[sandbox-daemon] listening on 0.0.0.0:${PORT}, workdir=${WORKDIR}`,
  );
});

const stopDecoWatcher = startDecoWatcher();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    stopDecoWatcher();
    await stopDev().catch(() => {});
    server.close(() => process.exit(0));
  });
}
