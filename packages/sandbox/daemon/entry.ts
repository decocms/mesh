import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ApplicationService } from "./app/application-service";
import { bumpActivity, markClaimed } from "./activity";
import { requireToken } from "./auth";
import { TenantConfigStore } from "./config-store";
import { REPLAY_BYTES } from "./constants";
import { Broadcaster } from "./events/broadcast";
import { BranchStatusMonitor } from "./git/branch-status";
import { InstallState } from "./install/install-state";
import { CONFIG_FILENAME, readConfig } from "./persistence";
import { discoverDescendantListeningPorts } from "./process/port-discovery";
import { TaskManager } from "./process/task-manager";
import { PhaseManager } from "./process/phase-manager";
import { startUpstreamProbe } from "./probe";
import { makeProxyHandler } from "./proxy";
import { jsonResponse } from "./routes/body-parser";
import { makeBashHandler } from "./routes/bash";
import {
  makeConfigReadHandler,
  makeConfigUpdateHandler,
} from "./routes/config";
import { makeEventsHandler } from "./routes/events-stream";
import { makeExecHandler } from "./routes/exec";
import {
  makeReadHandler,
  makeWriteHandler,
  makeEditHandler,
  makeGrepHandler,
  makeGlobHandler,
  makeWriteFromUrlHandler,
  makeUploadToUrlHandler,
} from "./routes/fs";
import { makeHealthHandler } from "./routes/health";
import { makeIdleHandler } from "./routes/idle";
import {
  makeTasksDeleteHandler,
  makeTasksGetHandler,
  makeTasksKillAllHandler,
  makeTasksKillHandler,
  makeTasksListHandler,
  makeTasksStreamHandler,
} from "./routes/tasks";
import { makeScriptsHandler } from "./routes/scripts";
import { discoverScripts } from "./process/script-discovery";
import { SetupOrchestrator } from "./setup/orchestrator";
import { isResume } from "./setup/resume";
import type { TenantConfig } from "./types";
import { makeWsUpgrader, type WsProxyData } from "./ws-proxy";

if (!process.env.DAEMON_BOOT_ID) {
  process.env.DAEMON_BOOT_ID = randomUUID();
}

// Corepack walks UP from cwd to find the closest `packageManager` field and
// rejects mismatched invocations. On host runners the daemon's workdir lives
// under the user's home, so an unrelated ancestor (e.g. `~/package.json`) can
// hijack `yarn`/`npm` calls in the cloned repo. Setting STRICT=0 lets corepack
// run whichever PM the daemon picked, regardless of what an ancestor declared.
process.env.COREPACK_ENABLE_STRICT = "0";

const APP_ROOT = process.env.WORKDIR ?? process.env.APP_ROOT ?? "/";
const bootConfig = {
  daemonToken: process.env.DAEMON_TOKEN ?? "",
  daemonBootId: process.env.DAEMON_BOOT_ID ?? "",
  appRoot: APP_ROOT,
  repoDir: join(APP_ROOT, "repo"),
  proxyPort: parseInt(
    process.env.DAEMON_PORT ?? process.env.PROXY_PORT ?? "9000",
    10,
  ),
};
// Ensure repoDir exists so bash commands with the default cwd don't fail with
// ENOENT when no repo has been cloned yet (tool-only sandboxes, no-repo agents).
mkdirSync(bootConfig.repoDir, { recursive: true });
// Workspace layout: <appRoot>/config.json (tenant config), <appRoot>/repo
// (cloned source), <appRoot>/tmp/{app,taskN} (log tees). Everything inside
// appRoot is reachable by fs/bash routes (clamped to appRoot via safePath).
const CONFIG_DIR = process.env.DAEMON_CONFIG_DIR ?? APP_ROOT;
const TMP_DIR = join(APP_ROOT, "tmp");

const broadcaster = new Broadcaster(REPLAY_BYTES);
const store = new TenantConfigStore({ storageDir: CONFIG_DIR });
const installState = new InstallState();
const phaseManager = new PhaseManager({
  onChange: (phases) =>
    broadcaster.broadcastEvent("phases", { type: "phases", phases }),
});
const taskManager = new TaskManager({
  logsDir: TMP_DIR,
  phaseManager,
  onChange: () => {
    broadcaster.broadcastEvent("tasks", {
      type: "tasks",
      active: getActiveTasks(),
    });
  },
});

function getActiveTasks() {
  return taskManager
    .list({ status: ["running"] })
    .map((t) => ({ id: t.id, command: t.command }));
}
const appService = new ApplicationService({
  broadcaster,
  logsDir: TMP_DIR,
  onFailure: (reason, exitCode) => {
    // Sticky failure — flip intent to paused so we don't auto-retry.
    void store.apply({
      application: { intent: "paused" },
    } as Partial<TenantConfig>);
    broadcaster.broadcastChunk(
      "daemon",
      `\r\n[daemon] dev script failed (exit ${exitCode}): ${reason}; intent → paused\r\n`,
    );
  },
});

const orchestrator = new SetupOrchestrator({
  bootConfig: { appRoot: bootConfig.appRoot, repoDir: bootConfig.repoDir },
  store,
  appService,
  broadcaster,
  installState,
  logsDir: TMP_DIR,
  phaseManager,
});

let branchStatus: BranchStatusMonitor | null = null;
let discoveredScripts: string[] | null = null;
let lastWrittenProxyPort: number | undefined;

const origEvent = broadcaster.broadcastEvent.bind(broadcaster);
broadcaster.broadcastEvent = (event: string, data: unknown) => {
  if (event === "scripts") {
    discoveredScripts = (data as { scripts?: string[] }).scripts ?? [];
  }
  origEvent(event, data);
};

store.subscribe((event) => {
  orchestrator.handle(event.transition);
  if (event.transition.kind === "first-bootstrap") {
    refreshBranchStatusMonitor();
  }
});

function refreshBranchStatusMonitor(): void {
  const enriched = store.read();
  if (!enriched) {
    branchStatus = null;
    return;
  }
  // BranchStatusMonitor expects the legacy Config shape; pass a thin proxy.
  const config = {
    ...enriched,
    daemonToken: bootConfig.daemonToken,
    daemonBootId: bootConfig.daemonBootId,
    proxyPort: bootConfig.proxyPort,
    appRoot: bootConfig.appRoot,
    repoDir: bootConfig.repoDir,
    dropPrivileges: false,
  };
  branchStatus = new BranchStatusMonitor(config, broadcaster);
}

const excludeFromDiscovery = new Set<number>([bootConfig.proxyPort]);
const getDiscoveredPorts = () => {
  const pids: number[] = [];
  const appPid = appService.pid();
  if (appPid !== undefined) pids.push(appPid);
  if (pids.length === 0) return [];
  return discoverDescendantListeningPorts({
    rootPids: pids,
    excludePorts: excludeFromDiscovery,
  });
};

const lastStatus = startUpstreamProbe({
  upstreamHost: "localhost",
  getDiscoveredPorts,
  getPinnedPort: () => store.read()?.application?.proxy?.targetPort ?? null,
  getCommandName: (pid) => {
    if (pid === appService.pid()) return "dev";
    return null;
  },
  onLog: (msg) => broadcaster.broadcastChunk("setup", msg),
  onChange: (s) => {
    broadcaster.broadcastEvent("status", { type: "status", ...s });
    if (s.ready && s.port !== null) {
      appService.markUp();
    }
    // Probe writeback: when discovery resolves a port owned by the app
    // service, persist it as proxy.targetPort so tenants see what we're
    // forwarding to. Dedupe to avoid spamming `apply()` every tick.
    if (
      s.port !== null &&
      s.port !== lastWrittenProxyPort &&
      appService.pid() !== undefined
    ) {
      lastWrittenProxyPort = s.port;
      void store.apply({
        application: { proxy: { targetPort: s.port } },
      } as Partial<TenantConfig>);
    }
  },
});

const getDevPort = (): number | null => lastStatus.port;
const { appRoot, repoDir } = bootConfig;
const fsDeps = { appRoot, repoDir };
const readH = makeReadHandler(fsDeps);
const writeH = makeWriteHandler(fsDeps);
const editH = makeEditHandler(fsDeps);
const grepH = makeGrepHandler(fsDeps);
const globH = makeGlobHandler(fsDeps);
const writeFromUrlH = makeWriteFromUrlHandler(fsDeps);
const uploadToUrlH = makeUploadToUrlHandler(fsDeps);

const bashH = makeBashHandler({
  repoDir,
  taskManager,
});
const execH = makeExecHandler({
  repoDir,
  store,
  taskManager,
  broadcaster,
});

const tasksListH = makeTasksListHandler({ taskManager });
const tasksGetH = makeTasksGetHandler({ taskManager });
const tasksKillH = makeTasksKillHandler({ taskManager });
const tasksKillAllH = makeTasksKillAllHandler({ taskManager });
const tasksDeleteH = makeTasksDeleteHandler({ taskManager });
const tasksStreamH = makeTasksStreamHandler({ taskManager });

const scriptsHandler = makeScriptsHandler(() => {
  if (discoveredScripts) return discoveredScripts;
  const enriched = store.read();
  const pm = enriched?.application?.packageManager?.name ?? null;
  const cwd = enriched?.application?.packageManager?.path ?? repoDir;
  if (!pm) return [];
  return discoverScripts(cwd, pm);
});

const healthH = makeHealthHandler({
  config: { daemonBootId: process.env.DAEMON_BOOT_ID ?? "" },
  getReady: () => lastStatus.ready,
  getApp: () => appService.snapshot(),
  getOrchestrator: () => ({
    running: orchestrator.isRunning(),
    pending: orchestrator.pendingCount(),
  }),
  getConfigured: () => store.read() !== null,
});

const eventsH = makeEventsHandler({
  broadcaster,
  getLastStatus: () => lastStatus,
  getDiscoveredScripts: () => discoveredScripts,
  getActiveTasks,
  getAppStatus: () => appService.snapshot(),
  getLastBranchStatus: () => (branchStatus ? branchStatus.getLast() : null),
});

const idleH = makeIdleHandler();
const proxyH = makeProxyHandler({ broadcaster, getDevPort });
const wsProxy = makeWsUpgrader(getDevPort, { onClientMessage: bumpActivity });

const configReadH = makeConfigReadHandler({
  daemonBootId: process.env.DAEMON_BOOT_ID ?? "",
  store,
  getState: () => ({
    app: appService.snapshot(),
    orchestrator: {
      running: orchestrator.isRunning(),
      pending: orchestrator.pendingCount(),
    },
    ready: lastStatus.ready,
  }),
  getTasks: () => phaseManager.recent(20),
});
// Closure mutates `bootConfig.daemonToken` in place so the
// `requireToken(req, bootConfig.daemonToken)` calls below — which read the
// property on each request — pick up the rotated value without any
// reload. The auth handler validates the rotation request against the
// *current* token; rotation happens only after that check passes, so a
// successful rotation is always an authenticated handoff.
const configUpdateH = makeConfigUpdateHandler({
  daemonBootId: process.env.DAEMON_BOOT_ID ?? "",
  store,
  setDaemonToken: (next) => {
    bootConfig.daemonToken = next;
  },
});

function hydrate(): void {
  let envTenant: TenantConfig | null = null;

  const diskOutcome = readConfig(CONFIG_DIR);
  let initial: TenantConfig | null = null;
  if (diskOutcome.kind === "valid") {
    initial = diskOutcome.config;
  } else if (envTenant) {
    initial = envTenant;
  }

  if (!initial) return;

  store.hydrate(initial);
  refreshBranchStatusMonitor();
  // Decide whether this is a fresh first-bootstrap or a resume of an
  // existing clone+install.
  const transitionKind: "resume" | "first-bootstrap" = isResume(
    bootConfig.repoDir,
  )
    ? "resume"
    : "first-bootstrap";
  orchestrator.handle({ kind: transitionKind, config: initial });

  // Persist disk if we hydrated from env so subsequent reads come from disk.
  if (diskOutcome.kind !== "valid") {
    void store.apply(initial);
  }
}

hydrate();

Bun.serve<WsProxyData, never>({
  port: bootConfig.proxyPort,
  hostname: "0.0.0.0",
  idleTimeout: 0,
  async fetch(req, server) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p !== "/health" && p !== "/_decopilot_vm/idle") {
      bumpActivity();
    }

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

    if (p === "/_decopilot_vm/config") {
      const denied = requireToken(req, bootConfig.daemonToken);
      if (denied) return denied;
      if (req.method === "GET") return configReadH();
      if (req.method === "PUT" || req.method === "POST") {
        const res = await configUpdateH(req);
        // Mark daemon as claimed on first successful config delivery so the
        // housekeeper can distinguish warm-pool pods awaiting adoption from
        // idle-but-active sandboxes.
        if (res.status === 200) markClaimed();
        return res;
      }
    }

    if (p.startsWith("/_decopilot_vm/tasks")) {
      const denied = requireToken(req, bootConfig.daemonToken);
      if (denied) return denied;
      if (req.method === "GET" && p === "/_decopilot_vm/tasks")
        return tasksListH(req);
      if (req.method === "POST" && p === "/_decopilot_vm/tasks/kill-all")
        return tasksKillAllH();
      if (
        req.method === "GET" &&
        /^\/_decopilot_vm\/tasks\/[^/]+\/stream$/.test(p)
      )
        return tasksStreamH(req);
      if (
        req.method === "POST" &&
        /^\/_decopilot_vm\/tasks\/[^/]+\/kill$/.test(p)
      )
        return tasksKillH(req);
      if (req.method === "DELETE" && /^\/_decopilot_vm\/tasks\/[^/]+$/.test(p))
        return tasksDeleteH(req);
      if (req.method === "GET" && /^\/_decopilot_vm\/tasks\/[^/]+$/.test(p))
        return tasksGetH(req);
    }

    if (req.method === "POST" && p.startsWith("/_decopilot_vm/")) {
      const denied = requireToken(req, bootConfig.daemonToken);
      if (denied) return denied;

      if (p === "/_decopilot_vm/read") return readH(req);
      if (p === "/_decopilot_vm/write") return writeH(req);
      if (p === "/_decopilot_vm/edit") return editH(req);
      if (p === "/_decopilot_vm/grep") return grepH(req);
      if (p === "/_decopilot_vm/glob") return globH(req);
      if (p === "/_decopilot_vm/write_from_url") return writeFromUrlH(req);
      if (p === "/_decopilot_vm/upload_to_url") return uploadToUrlH(req);
      if (p === "/_decopilot_vm/bash") return bashH(req);
      if (p.startsWith("/_decopilot_vm/exec/")) return execH(req);
    }

    if (req.method === "OPTIONS" && p.startsWith("/_decopilot_vm/")) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
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

// Stale tmp file housekeeping: persistence.readConfig handles this on the
// read path; on a clean shutdown there's nothing to do here.
process.on("SIGTERM", () => {
  taskManager.shutdown();
  appService.shutdown();
  try {
    if (existsSync(join(CONFIG_DIR, CONFIG_FILENAME))) {
      // Leave config.json in place — it's the persistent record. Just exit.
    }
    unlinkSync(join(CONFIG_DIR, "config.json.tmp"));
  } catch {
    /* ignore */
  }
  process.exit(0);
});
