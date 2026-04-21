#!/usr/bin/env node
/**
 * Sandbox daemon entry: builds the HTTP server, routes incoming requests to
 * feature modules, wires the WebSocket upgrade handler, and tears down dev
 * processes on SIGINT/SIGTERM.
 *
 * Each concern lives in `./daemon/<name>.mjs` — this file is intentionally
 * just the dispatch table so the routes read as a straight list.
 */

import { spawn } from "node:child_process";
import http from "node:http";
import { authorized } from "./daemon/auth.mjs";
import { handleClaudeCodeQuery } from "./daemon/claude-code.mjs";
import {
  LOG_RING_CAP,
  MAX_SSE_CLIENTS,
  PORT,
  WORKDIR,
} from "./daemon/config.mjs";
import { startDev, stopDev } from "./daemon/dev-process.mjs";
import { devByThread, getDev } from "./daemon/dev-state.mjs";
import {
  appendLog,
  currentStatusPayload,
  readMergedLogs,
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
import { handleUpgrade, parseProxyUrl, proxyHttp } from "./daemon/proxy.mjs";
import { inspectWorkdir } from "./daemon/workdir.mjs";

// ─── Legacy bash endpoint ───────────────────────────────────────────────────

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

// ─── Server ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // Health is intentionally unauthenticated — runner probes it before a
  // token is in play.
  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, { ok: true });
    return;
  }

  const url = req.url ?? "/";

  // CORS preflight for daemon-direct routes. Mesh normally proxies these
  // server-to-server so preflight rarely fires in practice, but browsers
  // that hit the daemon directly (dev loops, tools) still need the OK.
  if (
    req.method === "OPTIONS" &&
    (url.startsWith("/fs/") || url.startsWith("/_decopilot_vm/"))
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

  // Dev SSE — browser-visible via the mesh proxy. Auth already checked above
  // (the mesh forwards the bearer on our behalf).
  if (req.method === "GET" && url.startsWith("/_decopilot_vm/events")) {
    if (subscribers.size >= MAX_SSE_CLIENTS) {
      send(res, 429, { error: "too many SSE subscribers" });
      return;
    }
    const u = new URL(url, "http://local");
    const threadId = u.searchParams.get("threadId") || null;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    subscribers.set(res, { threadId });
    replayTo(res, threadId);
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

  // Dev lifecycle. All endpoints accept an optional `threadId` (query for
  // GETs, body for POSTs). Omitted → DEFAULT_THREAD for backward compat.
  if (req.method === "POST" && url === "/dev/start") {
    const body = await readJson(req).catch(() => ({}));
    startDev(body).catch((err) => {
      appendLog(
        "daemon",
        `[sandbox-daemon] /dev/start error: ${String(err)}\n`,
        body?.threadId || null,
      );
    });
    send(res, 202, currentStatusPayload(body?.threadId));
    return;
  }
  if (req.method === "POST" && url === "/dev/stop") {
    const body = await readJson(req).catch(() => ({}));
    await stopDev(body?.threadId).catch(() => {});
    send(res, 200, currentStatusPayload(body?.threadId));
    return;
  }
  if (req.method === "GET" && url.startsWith("/dev/status")) {
    const u = new URL(url, "http://local");
    if (u.searchParams.get("all") === "1") {
      const threads = {};
      for (const k of devByThread.keys()) {
        threads[k] = currentStatusPayload(k);
      }
      send(res, 200, { threads });
      return;
    }
    const threadId = u.searchParams.get("threadId") || null;
    send(res, 200, currentStatusPayload(threadId));
    return;
  }
  if (req.method === "GET" && url.startsWith("/dev/logs")) {
    const u = new URL(url, "http://local");
    const tail = Math.max(
      1,
      Math.min(LOG_RING_CAP, Number(u.searchParams.get("tail") ?? 200)),
    );
    const source = u.searchParams.get("source");
    const threadId = u.searchParams.get("threadId") || null;
    const entries = readMergedLogs(threadId, source)
      .slice(-tail)
      .map((e) => e.line)
      .join("\n");
    sendText(res, 200, entries + (entries ? "\n" : ""));
    return;
  }
  if (req.method === "GET" && url.startsWith("/dev/scripts")) {
    const u = new URL(url, "http://local");
    const threadId = u.searchParams.get("threadId") || null;
    const cwdParam = u.searchParams.get("cwd");
    const scriptsCwd =
      cwdParam && cwdParam.length > 0
        ? cwdParam
        : threadId
          ? getDev(threadId).cwd
          : WORKDIR;
    const { scripts, pm } = inspectWorkdir(scriptsCwd);
    send(res, 200, { scripts, pm, cwd: scriptsCwd });
    return;
  }

  // Claude Code streaming query — kept above the generic /proxy catch-all
  // so the path isn't mistaken for a dev-server proxy.
  if (req.method === "POST" && url === "/claude-code/query") {
    await handleClaudeCodeQuery(req, res).catch((err) => {
      appendLog(
        "claude-code",
        `[sandbox-daemon] /claude-code/query error: ${String(err)}\n`,
      );
      if (!res.headersSent) {
        send(res, 500, { error: String(err) });
      } else {
        try {
          res.end();
        } catch {}
      }
    });
    return;
  }

  // Typed file ops. Plain JSON bodies, paths rooted at /app (or body.cwd).
  if (req.method === "POST" && url === "/fs/read")
    return handleFsRead(req, res);
  if (req.method === "POST" && url === "/fs/write")
    return handleFsWrite(req, res);
  if (req.method === "POST" && url === "/fs/edit")
    return handleFsEdit(req, res);
  if (req.method === "POST" && url === "/fs/grep")
    return handleFsGrep(req, res);
  if (req.method === "POST" && url === "/fs/glob")
    return handleFsGlob(req, res);

  // HTTP proxy to container loopback.
  if (url.startsWith("/proxy/")) {
    const parsed = parseProxyUrl(url);
    if (!parsed) {
      send(res, 400, { error: "Invalid proxy URL" });
      return;
    }
    proxyHttp(req, res, parsed);
    return;
  }

  // Legacy bash endpoint — kept for one-shot commands.
  if (req.method === "POST" && url === "/bash") {
    try {
      const { command, timeoutMs = 60_000, cwd } = await readJson(req);
      if (typeof command !== "string" || command.length === 0) {
        send(res, 400, { error: "command is required" });
        return;
      }
      const result = await runBash(command, Number(timeoutMs), cwd);
      send(res, 200, result);
    } catch (err) {
      send(res, 500, { error: String(err) });
    }
    return;
  }

  send(res, 404, { error: "not found" });
});

server.on("upgrade", handleUpgrade);

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[sandbox-daemon] listening on 0.0.0.0:${PORT}, workdir=${WORKDIR}`,
  );
  // No boot-time auto-start: the daemon listens before the provisioner has
  // had a chance to clone the repo (the clone flows through /bash). The
  // caller fires /dev/start explicitly once `ensure()` returns — so the
  // workdir is guaranteed populated before script detection runs.
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await Promise.all(
      Array.from(devByThread.keys()).map((k) => stopDev(k).catch(() => {})),
    );
    server.close(() => process.exit(0));
  });
}
