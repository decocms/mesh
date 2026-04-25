import { randomUUID } from "node:crypto";
import { loadConfig } from "./config";
import { MAX_SSE_CLIENTS, REPLAY_BYTES } from "./constants";
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
import { jsonResponse } from "./routes/body-parser";
import { startUpstreamProbe } from "./probe";
import { BranchStatusMonitor } from "./git/branch-status";

// Auto-generate DAEMON_BOOT_ID when not provided (dev/test). In production
// the runner supplies a per-container UUID via env.
if (!process.env.DAEMON_BOOT_ID) {
  process.env.DAEMON_BOOT_ID = randomUUID();
}

const config = loadConfig(process.env);
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
const lastStatus = startUpstreamProbe({
  upstreamHost: "localhost",
  upstreamPort: config.devPort,
  onChange: (s) =>
    broadcaster.broadcastEvent("status", { type: "status", ...s }),
});

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
const proxyH = makeProxyHandler({ config, broadcaster });

Bun.serve({
  port: config.proxyPort,
  hostname: "0.0.0.0",
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;

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
