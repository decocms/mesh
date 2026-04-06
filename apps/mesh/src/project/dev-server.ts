/**
 * Project Dev Server Management
 *
 * Manages the user's project dev server as a subprocess.
 * Provides start/stop/restart controls and status reporting.
 */

import type { Subprocess } from "bun";
import type { ProjectScanResult } from "./scanner";
import { findAvailablePort } from "@/cli/find-available-port";
import { getDb } from "@/database";

export interface DevServerState {
  status: "stopped" | "starting" | "running" | "error";
  port: number | null;
  url: string | null;
  pid: number | null;
  error: string | null;
  logs: string[];
}

const MAX_LOG_LINES = 200;

let _state: DevServerState = {
  status: "stopped",
  port: null,
  url: null,
  pid: null,
  error: null,
  logs: [],
};

let _process: Subprocess | null = null;
let _scan: ProjectScanResult | null = null;

function addLog(line: string) {
  _state.logs.push(line);
  if (_state.logs.length > MAX_LOG_LINES) {
    _state.logs = _state.logs.slice(-MAX_LOG_LINES);
  }
}

// Strip ANSI escape codes
function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI codes requires matching control chars
  // oxlint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function pipeOutput(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const stripped = stripAnsi(raw).trim();
        if (stripped) addLog(stripped);
      }
    }
    if (buffer.trim()) {
      addLog(stripAnsi(buffer).trim());
    }
  })();
}

export function getDevServerState(): DevServerState {
  return { ..._state };
}

/**
 * Write the dev server's preview URL into each project agent's
 * `metadata.activeVms[userId]` entry. This lets the upstream `PreviewContent`
 * component (which reads activeVms) render our local dev server iframe —
 * sharing the same preview UI used by cloud VMs (Freestyle) without
 * reimplementing it locally.
 *
 * @param organizationId - Org the project agents belong to
 * @param userId - User whose activeVms entry to set (local mode has one user)
 * @param previewUrl - URL of the running local dev server, or null to clear
 */
async function syncActiveVmForProjectAgents(
  organizationId: string,
  userId: string,
  previewUrl: string | null,
): Promise<void> {
  try {
    const db = getDb().db;
    const agents = await db
      .selectFrom("connections")
      .select(["id", "metadata"])
      .where("organization_id", "=", organizationId)
      .where("connection_type", "=", "VIRTUAL")
      .execute();

    for (const agent of agents) {
      if (!agent.metadata) continue;
      let meta: Record<string, unknown>;
      try {
        meta =
          typeof agent.metadata === "string"
            ? JSON.parse(agent.metadata)
            : (agent.metadata as Record<string, unknown>);
      } catch {
        continue;
      }
      if (!meta.projectAgentType) continue;

      const activeVms =
        (meta.activeVms as Record<string, unknown> | undefined) ?? {};
      if (previewUrl) {
        activeVms[userId] = { previewUrl, vmId: null, terminalUrl: null };
      } else {
        delete activeVms[userId];
      }
      meta.activeVms = activeVms;

      await db
        .updateTable("connections")
        .set({ metadata: JSON.stringify(meta) })
        .where("id", "=", agent.id)
        .execute();
    }
  } catch (error) {
    console.error("[project] Failed to sync activeVms metadata:", error);
  }
}

let _syncCtx: { organizationId: string; userId: string } | null = null;

/**
 * Remember the org/user for the current session so we can update agents
 * when the dev server state changes.
 */
export function setProjectSyncContext(
  organizationId: string,
  userId: string,
): void {
  _syncCtx = { organizationId, userId };
}

export async function startProjectDevServer(
  scan: ProjectScanResult,
): Promise<void> {
  if (_state.status === "running" || _state.status === "starting") {
    return;
  }

  _scan = scan;
  _state = {
    status: "starting",
    port: null,
    url: null,
    pid: null,
    error: null,
    logs: [],
  };

  try {
    const port = await findAvailablePort(scan.devPort);
    _state.port = port;

    // Parse the dev command into parts
    const parts = scan.devCommand.split(/\s+/);
    const cmd = parts[0]!;
    const args = parts.slice(1);

    console.log(
      `[project] Starting dev server: ${scan.devCommand} (port ${port})`,
    );

    const child = Bun.spawn([cmd, ...args], {
      cwd: scan.projectDir,
      env: {
        ...process.env,
        PORT: String(port),
        // Some frameworks use different env vars for port
        DEV_PORT: String(port),
      },
      stdio: ["inherit", "pipe", "pipe"],
    });

    _process = child;
    _state.pid = child.pid;
    _state.url = `http://localhost:${port}`;

    // Pipe output
    if (child.stdout) pipeOutput(child.stdout as ReadableStream<Uint8Array>);
    if (child.stderr) pipeOutput(child.stderr as ReadableStream<Uint8Array>);

    // Monitor process exit
    child.exited.then((code) => {
      if (_state.status === "running" || _state.status === "starting") {
        if (code === 0 || code === null) {
          _state.status = "stopped";
        } else {
          _state.status = "error";
          _state.error = `Dev server exited with code ${code}`;
        }
      }
      _process = null;
      _state.pid = null;
    });

    // Wait a moment for the server to start, then mark as running
    // (We can't know exactly when it's ready without health checking,
    // so we use a reasonable delay)
    setTimeout(() => {
      if (_state.status === "starting") {
        _state.status = "running";
        console.log(`[project] Dev server running at ${_state.url}`);
        // Publish previewUrl to project agents so the main panel preview renders.
        if (_syncCtx && _state.url) {
          void syncActiveVmForProjectAgents(
            _syncCtx.organizationId,
            _syncCtx.userId,
            _state.url,
          );
        }
      }
    }, 3000);
  } catch (error) {
    _state.status = "error";
    _state.error =
      error instanceof Error ? error.message : "Failed to start dev server";
    console.error("[project] Failed to start dev server:", error);
  }
}

export async function stopProjectDevServer(): Promise<void> {
  if (_process) {
    _process.kill("SIGTERM");
    // Give it a moment to clean up
    await Promise.race([
      _process.exited,
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    if (_process) {
      _process.kill("SIGKILL");
    }
  }
  _state.status = "stopped";
  _state.pid = null;
  _process = null;
}

export async function restartProjectDevServer(): Promise<void> {
  await stopProjectDevServer();
  if (_scan) {
    await startProjectDevServer(_scan);
  }
}

// Register cleanup handlers
function cleanup() {
  if (_process) {
    _process.kill("SIGTERM");
    _process = null;
  }
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
