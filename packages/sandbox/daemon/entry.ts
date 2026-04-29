import { randomUUID } from "node:crypto";
import { loadConfig } from "./config";
import { REPLAY_BYTES } from "./constants";
import { Broadcaster } from "./events/broadcast";
import { ProcessManager } from "./process/run-process";
import { SetupOrchestrator } from "./setup/orchestrator";
import {
  makeReadHandler,
  makeWriteHandler,
  makeEditHandler,
  makeGrepHandler,
  makeGlobHandler,
} from "./routes/fs";
import { makeBashHandler } from "./routes/bash";
import { makeExecHandler } from "./routes/exec";
import { makeKillHandler } from "./routes/kill";
import { makeScriptsHandler } from "./routes/scripts";
import { makeHealthHandler } from "./routes/health";
import { makeEventsHandler } from "./routes/events-stream";
import { makeProxyHandler } from "./proxy";
import { makeWsUpgrader, type WsProxyData } from "./ws-proxy";
import { jsonResponse } from "./routes/body-parser";
import { startUpstreamProbe } from "./probe";
import { BranchStatusMonitor } from "./git/branch-status";
import { discoverDescendantListeningPorts } from "./process/port-discovery";

// Auto-generate DAEMON_BOOT_ID when not provided (dev/test). In production
// the runner supplies a per-container UUID via env.
if (!process.env.DAEMON_BOOT_ID) {
  process.env.DAEMON_BOOT_ID = randomUUID();
}

const config = loadConfig(process.env);

// Inject package-manager cache dirs and corepack behaviour into the process
// environment so every subprocess (install, dev server, user scripts) inherits
// them. Done here rather than in the Kubernetes template so the daemon is the
// single source of truth for sandbox runtime behaviour. Uses ??= so an
// explicit container env var still wins (useful in tests / local overrides).
if (config.cacheDir) {
  process.env.npm_config_cache ??= `${config.cacheDir}/npm`;
  process.env.PNPM_STORE_PATH ??= `${config.cacheDir}/pnpm`;
  process.env.YARN_CACHE_FOLDER ??= `${config.cacheDir}/yarn`;
  process.env.YARN_GLOBAL_FOLDER ??= `${config.cacheDir}/yarn-global`;
  process.env.BUN_INSTALL_CACHE_DIR ??= `${config.cacheDir}/bun`;
  process.env.DENO_DIR ??= `${config.cacheDir}/deno`;
  process.env.XDG_CACHE_HOME ??= `${config.cacheDir}/xdg`;
}
// Always suppress corepack's interactive download prompt — the daemon owns
// install and the dev server must never block on stdin.
process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT ??= "0";

const dropPrivileges = process.env.DAEMON_DROP_PRIVILEGES === "1";

const broadcaster = new Broadcaster(REPLAY_BYTES);
const processManager = new ProcessManager({
  broadcaster,
  dropPrivileges,
  env: process.env,
});
const orchestrator = new SetupOrchestrator({
  config,
  broadcaster,
  processManager,
  dropPrivileges,
});
const branchStatus = new BranchStatusMonitor(config, broadcaster);

let discoveredScripts: string[] | null = null;

// Build the ordered candidate-port list each tick:
//   1. Ports any descendant of a daemon-managed dev process is listening on
//      (Vite v7 / Next / Astro / etc. mostly ignore PORT=$DEV_PORT, so this
//      is the source of truth.)
//   2. config.devPort — the env-hint fallback. Honored by frameworks that
//      respect PORT, and used by the e2e tests where there's no managed
//      dev process and the upstream is started externally.
const excludeFromDiscovery = new Set<number>([config.proxyPort]);
const getCandidatePorts = (): number[] => {
  const ordered: number[] = [];
  const seen = new Set<number>();
  const push = (p: number) => {
    if (!seen.has(p)) {
      seen.add(p);
      ordered.push(p);
    }
  };
  const rootPids = processManager.allPids();
  if (rootPids.length > 0) {
    for (const port of discoverDescendantListeningPorts({
      rootPids,
      excludePorts: excludeFromDiscovery,
    })) {
      push(port);
    }
  }
  push(config.devPort);
  return ordered;
};

const lastStatus = startUpstreamProbe({
  upstreamHost: "localhost",
  getCandidatePorts,
  onChange: (s) =>
    broadcaster.broadcastEvent("status", { type: "status", ...s }),
});

const getDevPort = (): number => lastStatus.port ?? config.devPort;

const scriptsHandler = makeScriptsHandler(() => discoveredScripts ?? []);

// Intercept the `scripts` event so SSE replay can serve the latest list on
// connect. The orchestrator broadcasts this once setup completes.
const origEvent = broadcaster.broadcastEvent.bind(broadcaster);
broadcaster.broadcastEvent = (event: string, data: unknown) => {
  if (event === "scripts") {
    discoveredScripts = (data as { scripts?: string[] }).scripts ?? [];
  }
  origEvent(event, data);
};

const readH = makeReadHandler({ appRoot: config.appRoot, dropPrivileges });
const writeH = makeWriteHandler({ appRoot: config.appRoot, dropPrivileges });
const editH = makeEditHandler({ appRoot: config.appRoot, dropPrivileges });
const grepH = makeGrepHandler({ appRoot: config.appRoot, dropPrivileges });
const globH = makeGlobHandler({ appRoot: config.appRoot, dropPrivileges });
const bashH = makeBashHandler({ appRoot: config.appRoot, dropPrivileges });
const execH = makeExecHandler({
  config,
  processManager,
  orchestrator,
  setupState: orchestrator.state,
});
const killH = makeKillHandler(processManager);
const healthH = makeHealthHandler({
  config,
  getReady: () => lastStatus.ready,
  getSetup: () => ({ ...orchestrator.state }),
});
const eventsH = makeEventsHandler({
  broadcaster,
  getLastStatus: () => lastStatus,
  getDiscoveredScripts: () => discoveredScripts,
  getActiveProcesses: () => processManager.activeNames(),
  getLastBranchStatus: () => branchStatus.getLast(),
});
const proxyH = makeProxyHandler({ broadcaster, getDevPort });
const wsProxy = makeWsUpgrader(getDevPort);

Bun.serve<WsProxyData, never>({
  port: config.proxyPort,
  hostname: "0.0.0.0",
  idleTimeout: 0,
  async fetch(req, server) {
    const url = new URL(req.url);
    const p = url.pathname;

    // WebSocket upgrade — Vite HMR + any other dev-server WS. We forward
    // to in-pod localhost:devPort so HMR survives the daemon's reverse
    // proxy. Daemon-internal SSE (/_decopilot_vm/events) stays HTTP.
    if (
      req.headers.get("upgrade")?.toLowerCase() === "websocket" &&
      !p.startsWith("/_decopilot_vm/")
    ) {
      const ok = server.upgrade(req, { data: wsProxy.upgradeData(req) });
      if (ok) return undefined as unknown as Response;
      return new Response("Upgrade failed", { status: 400 });
    }

    if (p === "/health" && req.method === "GET") return healthH();

    if (req.method === "GET" && p === "/_decopilot_vm/events") return eventsH();
    if (req.method === "GET" && p === "/_decopilot_vm/scripts")
      return scriptsHandler();

    if (req.method === "POST") {
      if (p === "/_decopilot_vm/read") return readH(req);
      if (p === "/_decopilot_vm/write") return writeH(req);
      if (p === "/_decopilot_vm/edit") return editH(req);
      if (p === "/_decopilot_vm/grep") return grepH(req);
      if (p === "/_decopilot_vm/glob") return globH(req);
      if (p === "/_decopilot_vm/bash") return bashH(req);
      if (p.startsWith("/_decopilot_vm/exec/")) return execH(req);
      if (p.startsWith("/_decopilot_vm/kill/")) return killH(req);
    }

    if (req.method === "OPTIONS" && p.startsWith("/_decopilot_vm/")) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST",
          "Access-Control-Allow-Headers":
            "Content-Type, Accept, Cache-Control, Authorization",
        },
      });
    }

    if (p.startsWith("/_decopilot_vm/")) {
      return jsonResponse({ error: `Not found: ${p}` }, 404);
    }

    return proxyH(req);
  },
  websocket: {
    open: wsProxy.open,
    message: wsProxy.message,
    close: wsProxy.close,
  },
});

// Start the branch-status monitor once .git is on disk. Two paths:
// (1) resume-on-restart — the .git already exists before we call run();
// (2) fresh clone — .git appears after orchestrator finishes cloning.
// Either way, emit+watch after orchestrator.run() completes.
async function runBootSetup() {
  await orchestrator.run();
  branchStatus.emit();
  branchStatus.watch();
}

// Kick boot setup unless opted out (used only by tests).
if (process.env.DAEMON_NO_AUTOSTART !== "1") {
  void runBootSetup();
}
