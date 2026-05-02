import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { loadBootConfigFromEnv, tryLoadTenantConfigFromEnv } from "./config";
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
import { BOOTSTRAP_FILENAME, readBootstrap } from "./persistence";
import {
  bootstrapMutex,
  clearTenantConfig,
  getBootConfig,
  setBootConfig,
  setTenantConfig,
} from "./state";
import {
  makeConfigReadHandler,
  makeConfigUpdateHandler,
} from "./routes/config";
import type { Config, TenantConfig } from "./types";

if (!process.env.DAEMON_BOOT_ID) {
  process.env.DAEMON_BOOT_ID = randomUUID();
}

// Corepack walks UP from cwd to find the closest `packageManager` field and
// rejects mismatched invocations. On host runners the daemon's workdir lives
// under the user's home, so an unrelated ancestor (e.g. `~/package.json`) can
// hijack `yarn`/`npm` calls in the cloned repo. Setting STRICT=0 lets corepack
// run whichever PM the daemon picked, regardless of what an ancestor declared.
process.env.COREPACK_ENABLE_STRICT = "0";

const BOOTSTRAP_DIR =
  process.env.DAEMON_BOOTSTRAP_DIR ?? "/home/sandbox/.daemon";

// Boot config is required: token + bootId + appRoot. Without DAEMON_TOKEN
// we have no auth boundary, so the daemon refuses to start. This is the
// only fatal config check; everything else (tenant repo, runtime) is
// optional and can arrive later via bootstrap.
const bootConfig = (() => {
  try {
    return loadBootConfigFromEnv(process.env);
  } catch (e) {
    console.error(`[daemon] boot config invalid: ${(e as Error).message}`);
    process.exit(1);
  }
})();
setBootConfig(bootConfig);

const DAEMON_BOOT_ID = bootConfig.daemonBootId;
const PROXY_PORT = bootConfig.proxyPort;
const dropPrivileges = bootConfig.dropPrivileges;

const broadcaster = new Broadcaster(REPLAY_BYTES);
const processManager = new ProcessManager({
  broadcaster,
  dropPrivileges,
  env: process.env,
});

let orchestrator: SetupOrchestrator | null = null;
let branchStatus: BranchStatusMonitor | null = null;
let activeConfig: Config | null = null;
let tenantHandlers: {
  execH: ReturnType<typeof makeExecHandler>;
} | null = null;

let discoveredScripts: string[] | null = null;

const origEvent = broadcaster.broadcastEvent.bind(broadcaster);
broadcaster.broadcastEvent = (event: string, data: unknown) => {
  if (event === "scripts") {
    discoveredScripts = (data as { scripts?: string[] }).scripts ?? [];
  }
  origEvent(event, data);
};

const excludeFromDiscovery = new Set<number>([PROXY_PORT]);
const getDiscoveredPorts = () => {
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
  getPinnedPort: () =>
    activeConfig?.application?.developmentServer?.port ?? null,
  getCommandName: (pid) => processManager.nameByPid(pid),
  onChange: (s) =>
    broadcaster.broadcastEvent("status", { type: "status", ...s }),
});

const getDevPort = (): number | null => lastStatus.port;

const readH = makeReadHandler({
  appRoot: bootConfig.appRoot,
  dropPrivileges,
});
const writeH = makeWriteHandler({
  appRoot: bootConfig.appRoot,
  dropPrivileges,
});
const editH = makeEditHandler({
  appRoot: bootConfig.appRoot,
  dropPrivileges,
});
const grepH = makeGrepHandler({
  appRoot: bootConfig.appRoot,
  dropPrivileges,
});
const globH = makeGlobHandler({
  appRoot: bootConfig.appRoot,
  dropPrivileges,
});
const writeFromUrlH = makeWriteFromUrlHandler({
  appRoot: bootConfig.appRoot,
  dropPrivileges,
});
const uploadToUrlH = makeUploadToUrlHandler({
  appRoot: bootConfig.appRoot,
  dropPrivileges,
});
const bashH = makeBashHandler({
  appRoot: bootConfig.appRoot,
  dropPrivileges,
});
const killH = makeKillHandler(processManager);

function activateTenant(tenant: TenantConfig): void {
  const config: Config = { ...getBootConfig(), ...tenant };
  activeConfig = config;
  const orch = new SetupOrchestrator({
    config,
    broadcaster,
    processManager,
    dropPrivileges,
    onTerminal: (outcome, reason) => {
      void bootstrapMutex.run(() => {
        if (outcome === "failed") {
          handleOrchestratorFailure(reason ?? "orchestrator failed");
        }
        if (outcome === "ready") {
          broadcaster.broadcastEvent("status", {
            type: "status",
            status: "ready",
          });
        }
      });
    },
  });
  orchestrator = orch;
  branchStatus = new BranchStatusMonitor(config, broadcaster);
  tenantHandlers = {
    execH: makeExecHandler({
      getConfig: () => activeConfig as Config,
      processManager,
      orchestrator: orch,
      setupState: orch.state,
    }),
  };
}

function deactivateTenant(): void {
  orchestrator = null;
  branchStatus = null;
  activeConfig = null;
  tenantHandlers = null;
  clearTenantConfig();
  try {
    unlinkSync(join(BOOTSTRAP_DIR, BOOTSTRAP_FILENAME));
  } catch {}
}

// Caller MUST hold bootstrapMutex. Drops orchestrator state, deletes
// bootstrap.json, broadcasts the failure reason, and sets phase back to
// pending-bootstrap so mesh can re-POST a corrected payload without a
// pod-recreate roundtrip. lastError is surfaced on /health for diagnostics.
function handleOrchestratorFailure(reason: string): void {
  deactivateTenant();
  broadcaster.broadcastChunk(
    "setup",
    `\r\n[daemon] orchestrator failed (${reason}); awaiting new bootstrap\r\n`,
  );
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

const configReadH = makeConfigReadHandler({ daemonBootId: DAEMON_BOOT_ID });

const configH = makeConfigUpdateHandler({
  daemonBootId: DAEMON_BOOT_ID,
  storageDir: BOOTSTRAP_DIR,
  onApplied: (kind, tenant) => {
    if (kind === "devport-only") {
      activeConfig = { ...getBootConfig(), ...tenant };
      return;
    }
    for (const name of processManager.activeNames()) {
      processManager.kill(name);
    }
    activateTenant(tenant);
  },
});

function hydrate(): void {
  let envTenant: TenantConfig | null = null;
  try {
    envTenant = tryLoadTenantConfigFromEnv(process.env);
  } catch (e) {
    // env tenant data is malformed (e.g., bad RUNTIME). Don't crash —
    // mesh can still POST a valid bootstrap. Surface via lastError.
    console.error(
      `[daemon] env tenant config invalid: ${(e as Error).message}`,
    );
  }
  if (envTenant) {
    setTenantConfig(envTenant);
    activateTenant(envTenant);
    return;
  }

  const outcome = readBootstrap(BOOTSTRAP_DIR);
  if (outcome.kind === "valid") {
    const config = outcome.config;
    setTenantConfig(config);
    activateTenant(config);
    return;
  }
}

hydrate();

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
      if (req.method === "PUT") return configH(req);
    }

    if (req.method === "POST" && p.startsWith("/_decopilot_vm/")) {
      const denied = requireToken(req, bootConfig.daemonToken);
      if (denied) return denied;

      // Boot-time handlers: usable from `pending-bootstrap` onward. Bash,
      // file ops, kill, and grep don't need orchestrator state.
      if (p === "/_decopilot_vm/read") return readH(req);
      if (p === "/_decopilot_vm/write") return writeH(req);
      if (p === "/_decopilot_vm/edit") return editH(req);
      if (p === "/_decopilot_vm/grep") return grepH(req);
      if (p === "/_decopilot_vm/glob") return globH(req);
      if (p === "/_decopilot_vm/write_from_url") return writeFromUrlH(req);
      if (p === "/_decopilot_vm/upload_to_url") return uploadToUrlH(req);
      if (p === "/_decopilot_vm/bash") return bashH(req);
      if (p.startsWith("/_decopilot_vm/kill/")) return killH(req);

      // Tenant-dependent handlers: need a configured orchestrator. Until
      // bootstrap (or env-driven hydrate) sets a tenant, exec is gated.
      if (p.startsWith("/_decopilot_vm/exec/")) {
        if (!tenantHandlers) {
          return jsonResponse({ error: "tenant not configured" }, 503);
        }
        return tenantHandlers.execH(req);
      }
    }

    if (req.method === "OPTIONS" && p.startsWith("/_decopilot_vm/")) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT",
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
