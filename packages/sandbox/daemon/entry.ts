import { randomUUID } from "node:crypto";
import { loadConfig } from "./config";
import { configFromBootstrap } from "./bootstrap-config";
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
  makeWriteFromUrlHandler,
  makeUploadToUrlHandler,
} from "./routes/fs";
import { makeBashHandler } from "./routes/bash";
import { makeExecHandler } from "./routes/exec";
import { makeKillHandler } from "./routes/kill";
import { makeScriptsHandler } from "./routes/scripts";
import { makeHealthHandler } from "./routes/health";
import { makeEventsHandler } from "./routes/events-stream";
import { makeIdleHandler } from "./routes/idle";
import { makeProxyHandler } from "./proxy";
import { makeWsUpgrader, type WsProxyData } from "./ws-proxy";
import { jsonResponse } from "./routes/body-parser";
import { requireToken } from "./auth";
import { bumpActivity } from "./activity";
import { startUpstreamProbe } from "./probe";
import { BranchStatusMonitor } from "./git/branch-status";
import { discoverDescendantListeningPorts } from "./process/port-discovery";
import { readBootstrap, type BootstrapPayload } from "./persistence";
import {
  bootstrapMutex,
  getPhase,
  peekConfig,
  setBootstrapHash,
  setConfig,
  setPhase,
} from "./state";
import { makeBootstrapHandler } from "./bootstrap";
import type { Config } from "./types";

// Auto-generate DAEMON_BOOT_ID when not provided (dev/test). In production
// the runner supplies a per-container UUID via env.
if (!process.env.DAEMON_BOOT_ID) {
  process.env.DAEMON_BOOT_ID = randomUUID();
}
const DAEMON_BOOT_ID = process.env.DAEMON_BOOT_ID;

const dropPrivileges = process.env.DAEMON_DROP_PRIVILEGES === "1";
const PROXY_PORT = parseInt(process.env.PROXY_PORT ?? "9000", 10);

const BOOTSTRAP_TIMEOUT_MS = parseInt(
  process.env.BOOTSTRAP_TIMEOUT_MS ?? `${5 * 60 * 1000}`,
  10,
);

// Storage substrate for bootstrap.json. Override via env for tests.
const BOOTSTRAP_DIR =
  process.env.DAEMON_BOOTSTRAP_DIR ?? "/home/sandbox/.daemon";

const broadcaster = new Broadcaster(REPLAY_BYTES);
const processManager = new ProcessManager({
  broadcaster,
  dropPrivileges,
  env: process.env,
});

// Lazily-bound state — created when Config arrives (env-driven path or
// post-bootstrap). Until then, mutating routes 503.
let orchestrator: SetupOrchestrator | null = null;
let branchStatus: BranchStatusMonitor | null = null;
let mutatingHandlers: ReturnType<typeof buildMutatingHandlers> | null = null;
let activeConfig: Config | null = null;

let discoveredScripts: string[] | null = null;

// Intercept the `scripts` event so SSE replay can serve the latest list on
// connect. The orchestrator broadcasts this once setup completes.
const origEvent = broadcaster.broadcastEvent.bind(broadcaster);
broadcaster.broadcastEvent = (event: string, data: unknown) => {
  if (event === "scripts") {
    discoveredScripts = (data as { scripts?: string[] }).scripts ?? [];
  }
  origEvent(event, data);
};

const excludeFromDiscovery = new Set<number>([PROXY_PORT]);
const getDiscoveredPorts = (): number[] => {
  const rootPids = processManager.allPids();
  if (rootPids.length === 0) return [];
  return discoverDescendantListeningPorts({
    rootPids,
    excludePorts: excludeFromDiscovery,
  });
};

const lastStatus = startUpstreamProbe({
  upstreamHost: "localhost",
  getDiscoveredPorts,
  // Untrusted: only used until /proc shows a listener. Honored by frameworks
  // that respect PORT, and used in e2e tests where there's no managed dev
  // process and the upstream is started externally.
  getFallbackPort: () => activeConfig?.devPort ?? 3000,
  onChange: (s) =>
    broadcaster.broadcastEvent("status", { type: "status", ...s }),
});

const getDevPort = (): number =>
  lastStatus.port ?? activeConfig?.devPort ?? 3000;

function buildMutatingHandlers(config: Config) {
  const orch = new SetupOrchestrator({
    config,
    broadcaster,
    processManager,
    dropPrivileges,
    onTerminal: (outcome) => {
      // Phase transition under bootstrapMutex. Don't await — the orchestrator
      // is already outside the mutex and we don't want to block its caller.
      void bootstrapMutex.run(() => {
        const cur = getPhase();
        if (cur === "failed") return; // terminal
        if (outcome === "ready" && cur === "bootstrapping") {
          setPhase("ready");
          clearBootstrapTimeout();
        } else if (outcome === "failed") {
          // Failure flips both bootstrapping → failed and (env-driven)
          // ready → failed, per spec "Wiring `failed`".
          setPhase("failed");
          clearBootstrapTimeout();
        }
      });
    },
  });
  orchestrator = orch;
  branchStatus = new BranchStatusMonitor(config, broadcaster);
  return {
    readH: makeReadHandler({ appRoot: config.appRoot, dropPrivileges }),
    writeH: makeWriteHandler({ appRoot: config.appRoot, dropPrivileges }),
    editH: makeEditHandler({ appRoot: config.appRoot, dropPrivileges }),
    grepH: makeGrepHandler({ appRoot: config.appRoot, dropPrivileges }),
    globH: makeGlobHandler({ appRoot: config.appRoot, dropPrivileges }),
    bashH: makeBashHandler({ appRoot: config.appRoot, dropPrivileges }),
    execH: makeExecHandler({
      config,
      processManager,
      orchestrator: orch,
      setupState: orch.state,
    }),
    killH: makeKillHandler(processManager),
    daemonToken: config.daemonToken,
  };
}

function activateConfig(config: Config): void {
  activeConfig = config;
  mutatingHandlers = buildMutatingHandlers(config);
}

const scriptsHandler = makeScriptsHandler(() => discoveredScripts ?? []);

// Intercept the `scripts` event so SSE replay can serve the latest list on
// connect. The orchestrator broadcasts this once setup completes.
broadcaster.broadcastEvent = (event: string, data: unknown) => {
  if (event === "scripts") {
    discoveredScripts = (data as { scripts?: string[] }).scripts ?? [];
  }
  origEvent(event, data);
};

const healthH = makeHealthHandler({
  config: { daemonBootId: DAEMON_BOOT_ID },
  getReady: () => lastStatus.ready,
  getSetup: () =>
    orchestrator ? { ...orchestrator.state } : { running: false, done: false },
  getPhase: () => getPhase(),
});
const eventsH = makeEventsHandler({
  broadcaster,
  getLastStatus: () => lastStatus,
  getDiscoveredScripts: () => discoveredScripts,
  getActiveProcesses: () => processManager.activeNames(),
  getLastBranchStatus: () => (branchStatus ? branchStatus.getLast() : null),
});
const idleH = makeIdleHandler();
const proxyH = makeProxyHandler({ broadcaster, getDevPort });
const wsProxy = makeWsUpgrader(getDevPort, { onClientMessage: bumpActivity });

// ---- Bootstrap timeout ----------------------------------------------------
let bootstrapTimeout: ReturnType<typeof setTimeout> | null = null;
function armBootstrapTimeout() {
  if (bootstrapTimeout) clearTimeout(bootstrapTimeout);
  bootstrapTimeout = setTimeout(() => {
    void bootstrapMutex.run(() => {
      const cur = getPhase();
      if (cur === "pending-bootstrap") {
        setPhase("failed");
        broadcaster.broadcastChunk(
          "setup",
          `\r\n[daemon] bootstrap timeout (${BOOTSTRAP_TIMEOUT_MS}ms) — phase=failed\r\n`,
        );
      }
    });
  }, BOOTSTRAP_TIMEOUT_MS);
  // Don't keep the event loop alive solely on this timer.
  bootstrapTimeout.unref?.();
}
function clearBootstrapTimeout() {
  if (bootstrapTimeout) {
    clearTimeout(bootstrapTimeout);
    bootstrapTimeout = null;
  }
}

const bootstrapH = makeBootstrapHandler({
  daemonBootId: DAEMON_BOOT_ID,
  storageDir: BOOTSTRAP_DIR,
  onAccepted: () => {
    // setConfig already happened inside the mutex; activate handlers
    // synchronously (cheap) and kick off orchestrator on the next tick so
    // long-running I/O doesn't hold the mutex.
    const cfg = peekConfig();
    if (!cfg) return; // shouldn't happen — setConfig was just called
    activateConfig(cfg);
    clearBootstrapTimeout();
    if (process.env.DAEMON_NO_AUTOSTART !== "1") {
      queueMicrotask(() => {
        void runBootSetup();
      });
    }
  },
});

// ---- Pre-bind hydration ---------------------------------------------------
function hydrate(): void {
  // Three outcomes drive the initial phase.
  // 1) Env-driven path: DAEMON_TOKEN is set in env (back-compat).
  if (process.env.DAEMON_TOKEN) {
    let cfg: Config;
    try {
      cfg = loadConfig(process.env);
    } catch (e) {
      console.error(`[daemon] env config invalid: ${(e as Error).message}`);
      setPhase("failed");
      return;
    }
    setConfig(cfg);
    setPhase("ready");
    activateConfig(cfg);
    return;
  }

  // 2) bootstrap.json present.
  const outcome = readBootstrap(BOOTSTRAP_DIR);
  if (outcome.kind === "valid") {
    const payload = outcome.file.payload as BootstrapPayload;
    setBootstrapHash(outcome.file.hash);
    const cfg = configFromBootstrap(payload, DAEMON_BOOT_ID);
    setConfig(cfg);
    setPhase("bootstrapping");
    activateConfig(cfg);
    return;
  }
  if (outcome.kind === "invalid") {
    console.error(`[daemon] bootstrap.json invalid: ${outcome.reason}`);
    setPhase("failed");
    return;
  }
  // 3) Absent — pending-bootstrap.
  setPhase("pending-bootstrap");
  armBootstrapTimeout();
}

hydrate();

// ---- HTTP server ----------------------------------------------------------
Bun.serve<WsProxyData, never>({
  port: PROXY_PORT,
  hostname: "0.0.0.0",
  idleTimeout: 0,
  async fetch(req, server) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p !== "/health" && p !== "/_decopilot_vm/idle") {
      bumpActivity();
    }

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

    if (req.method === "GET" && p === "/_decopilot_vm/idle") return idleH();
    if (req.method === "GET" && p === "/_decopilot_vm/events") return eventsH();
    if (req.method === "GET" && p === "/_decopilot_vm/scripts")
      return scriptsHandler();

    if (req.method === "POST" && p === "/_decopilot_vm/bootstrap") {
      // Re-arm the bootstrap timeout if a fresh re-bootstrap arrives in
      // pending-bootstrap (spec: "Timer resets if a re-bootstrap arrives").
      if (getPhase() === "pending-bootstrap") armBootstrapTimeout();
      return bootstrapH(req);
    }

    // Mutating /_decopilot_vm/* routes require Authorization: Bearer
    // <DAEMON_TOKEN>. The unauth'd GETs above (idle/events/scripts) and
    // /health intentionally skip this — mesh attaches the bearer to every
    // request, including unauth'd paths, and those handlers must tolerate
    // it silently.
    if (req.method === "POST" && p.startsWith("/_decopilot_vm/")) {
      const handlers = mutatingHandlers;
      if (!handlers || getPhase() !== "ready") {
        return jsonResponse(
          {
            error: "daemon not ready",
            phase: getPhase(),
          },
          503,
        );
      }
      const denied = requireToken(req, handlers.daemonToken);
      if (denied) return denied;
      if (p === "/_decopilot_vm/read") return handlers.readH(req);
      if (p === "/_decopilot_vm/write") return handlers.writeH(req);
      if (p === "/_decopilot_vm/edit") return handlers.editH(req);
      if (p === "/_decopilot_vm/grep") return handlers.grepH(req);
      if (p === "/_decopilot_vm/glob") return handlers.globH(req);
      if (p === "/_decopilot_vm/bash") return handlers.bashH(req);
      if (p.startsWith("/_decopilot_vm/exec/")) return handlers.execH(req);
      if (p.startsWith("/_decopilot_vm/kill/")) return handlers.killH(req);
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
  if (!orchestrator || !branchStatus) return;
  await orchestrator.run();
  branchStatus.emit();
  branchStatus.watch();
}

// Kick boot setup unless opted out (used only by tests).
if (process.env.DAEMON_NO_AUTOSTART !== "1") {
  // Env-driven path: phase already "ready"; orchestrator.run() still
  // performs setup synchronously (clone/install). For bootstrap-driven
  // path, runBootSetup is invoked from the bootstrap handler's onAccepted.
  if (getPhase() === "ready" || getPhase() === "bootstrapping") {
    void runBootSetup();
  }
}
