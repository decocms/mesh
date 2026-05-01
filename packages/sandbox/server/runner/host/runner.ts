/**
 * Host sandbox runner — local dev / single-tenant self-host.
 *
 * Spawns the same Bun-based daemon as Docker but as a host child process,
 * with a per-branch full git clone in `${homeDir}/sandboxes/<handle>/`. The
 * local ingress (`startLocalSandboxIngress`) routes
 * `<handle>.localhost:7070` to the daemon's host-side TCP port.
 *
 * Hardening (read-only rootfs, dropped caps, memory limits) is intentionally
 * absent — the daemon runs in the user's trust boundary.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  daemonBash,
  daemonBootstrap,
  probeDaemonHealth,
  proxyDaemonRequest,
} from "../../daemon-client";
import type { DaemonHealth } from "../../daemon-client";
import {
  applyPreviewPattern,
  bootstrapAndWaitReady,
  buildBootstrapPayload,
  computeHandle,
} from "../shared";
import type { RunnerStateStore } from "../state-store";
import type {
  EnsureOptions,
  ExecInput,
  ExecOutput,
  ProxyRequestInit,
  Sandbox,
  SandboxId,
  SandboxRunner,
} from "../types";

const RUNNER_KIND = "host" as const;
// Resolve daemon entry path relative to this file so it works regardless of
// the process cwd (e.g. when mesh is started from apps/mesh/ via
// `bun run --cwd=apps/mesh dev:server`).
const DAEMON_ENTRY = resolve(
  fileURLToPath(new URL("../../../daemon/entry.ts", import.meta.url)),
);
const STOP_GRACE_MS = 2_000;

type DaemonProcess = {
  pid: number;
  kill: (signal?: NodeJS.Signals | number) => boolean;
};
type SpawnFn = (args: {
  workdir: string;
  env: Record<string, string>;
  daemonPort: number;
}) => Promise<DaemonProcess>;
type HealthProbeFn = (daemonUrl: string) => Promise<DaemonHealth | null>;
type KillFn = (pid: number, signal: NodeJS.Signals) => void;
type IsAliveFn = (pid: number) => boolean;
type BootstrapFn = typeof daemonBootstrap;

export interface HostRunnerOptions {
  /** Root data directory; usually `settings.home` (i.e. DATA_DIR). */
  homeDir: string;
  stateStore?: RunnerStateStore;
  /** Override preview URL pattern (matches DockerRunnerOptions semantics). */
  previewUrlPattern?: string;
  /** @internal test seam */
  _spawn?: SpawnFn;
  /** @internal test seam */
  _probe?: HealthProbeFn;
  /** @internal test seam */
  _kill?: KillFn;
  /** @internal test seam */
  _isAlive?: IsAliveFn;
  /** @internal test seam */
  _bootstrap?: BootstrapFn;
}

interface HostRecord {
  id: SandboxId;
  handle: string;
  pid: number;
  daemonPort: number;
  daemonUrl: string;
  workdir: string;
  token: string;
  bootId: string;
}

interface PersistedHostState {
  pid: number;
  daemonPort: number;
  daemonUrl: string;
  workdir: string;
  token: string;
  bootId: string;
}

export class HostSandboxRunner implements SandboxRunner {
  readonly kind = RUNNER_KIND;

  private readonly records = new Map<string, HostRecord>();
  private readonly homeDir: string;
  private readonly stateStore: RunnerStateStore | null;
  private readonly previewUrlPattern: string | null;
  private readonly spawnFn: SpawnFn;
  private readonly probeFn: HealthProbeFn;
  private readonly killFn: KillFn;
  private readonly isAliveFn: IsAliveFn;
  private readonly bootstrapFn: BootstrapFn;

  constructor(opts: HostRunnerOptions) {
    if (!opts.homeDir) {
      throw new Error("HostSandboxRunner requires a homeDir (DATA_DIR)");
    }
    this.homeDir = opts.homeDir;
    this.stateStore = opts.stateStore ?? null;
    this.previewUrlPattern = opts.previewUrlPattern ?? null;
    this.spawnFn = opts._spawn ?? defaultSpawn;
    this.probeFn = opts._probe ?? probeDaemonHealth;
    this.killFn = opts._kill ?? ((pid, sig) => process.kill(pid, sig));
    this.isAliveFn = opts._isAlive ?? isPidAlive;
    this.bootstrapFn = opts._bootstrap ?? daemonBootstrap;
  }

  // ---- SandboxRunner surface ------------------------------------------------

  async ensure(id: SandboxId, opts: EnsureOptions = {}): Promise<Sandbox> {
    const handle = computeHandle(id, opts.repo?.branch);

    // 1. In-memory cache hit?
    const cached = this.records.get(handle);
    if (cached && this.isAliveFn(cached.pid)) return this.toSandbox(cached);

    // 2. State-store resume.
    if (this.stateStore) {
      const persisted = await this.stateStore.getByHandle(RUNNER_KIND, handle);
      if (persisted) {
        const rec = await this.rehydrate(persisted.id, persisted);
        if (rec) {
          this.records.set(handle, rec);
          return this.toSandbox(rec);
        }
        await this.stateStore
          .deleteByHandle(RUNNER_KIND, handle)
          .catch(() => undefined);
      }
    }

    // 3. Fresh provision.
    const workdir = this.workdirFor(handle);
    await mkdir(dirname(workdir), { recursive: true });

    const token = randomBytes(24).toString("hex");
    const bootId = randomUUID();
    const daemonPort = await preallocatePort();
    const daemonUrl = `http://127.0.0.1:${daemonPort}`;
    const devPort = await preallocatePort();

    // Boot env carries only the BootConfig the daemon reads at startup
    // (`config.ts:loadBootConfigFromEnv`). Tenant config — runtime, repo,
    // dev port, caller env — flows through `daemonBootstrap` below.
    const env = buildDaemonBootEnv({ token, bootId, workdir, daemonPort });

    const proc = await this.spawnFn({ workdir, env, daemonPort });
    try {
      const payload = buildBootstrapPayload(opts, {
        daemonToken: token,
        workdir,
        devPort,
      });
      await bootstrapAndWaitReady(daemonUrl, payload, {
        bootstrapFn: this.bootstrapFn,
        probe: this.probeFn,
      });
    } catch (err) {
      // Bootstrap or readiness wait failed — kill the daemon so we don't
      // leak the child process or pin daemonPort/devPort. The deterministic
      // workdir is left in place; a retry will reuse it.
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      throw err;
    }

    const rec: HostRecord = {
      id,
      handle,
      pid: proc.pid,
      daemonPort,
      daemonUrl,
      workdir,
      token,
      bootId,
    };
    this.records.set(handle, rec);

    if (this.stateStore) {
      const state = {
        pid: rec.pid,
        daemonPort: rec.daemonPort,
        daemonUrl: rec.daemonUrl,
        workdir: rec.workdir,
        token: rec.token,
        bootId: rec.bootId,
      } as PersistedHostState as unknown as Record<string, unknown>;
      await this.stateStore.put(id, RUNNER_KIND, { handle, state });
    }
    return this.toSandbox(rec);
  }

  async exec(handle: string, input: ExecInput): Promise<ExecOutput> {
    const rec = await this.requireRecord(handle);
    return daemonBash(rec.daemonUrl, rec.token, input);
  }

  async delete(handle: string): Promise<void> {
    const rec = await this.getRecord(handle);
    this.records.delete(handle);

    if (rec) {
      if (this.isAliveFn(rec.pid)) {
        try {
          this.killFn(rec.pid, "SIGTERM");
        } catch {
          /* already gone */
        }
        const deadline = Date.now() + STOP_GRACE_MS;
        while (Date.now() < deadline) {
          if (!this.isAliveFn(rec.pid)) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        if (this.isAliveFn(rec.pid)) {
          try {
            this.killFn(rec.pid, "SIGKILL");
          } catch {
            /* ignore */
          }
        }
      }
      await rm(rec.workdir, { recursive: true, force: true }).catch((err) =>
        console.warn(
          `[HostSandboxRunner] rm workdir(${handle}) failed:`,
          err instanceof Error ? err.message : String(err),
        ),
      );
    }

    if (this.stateStore) {
      if (rec) await this.stateStore.delete(rec.id, RUNNER_KIND);
      else await this.stateStore.deleteByHandle(RUNNER_KIND, handle);
    }
  }

  async alive(handle: string): Promise<boolean> {
    const rec = this.records.get(handle);
    if (!rec) return false;
    return this.isAliveFn(rec.pid);
  }

  async getPreviewUrl(handle: string): Promise<string | null> {
    const rec = await this.getRecord(handle);
    return rec ? this.composePreviewUrl(rec) : null;
  }

  async proxyDaemonRequest(
    handle: string,
    path: string,
    init: ProxyRequestInit,
  ): Promise<Response> {
    const rec = await this.getRecord(handle);
    if (!rec) {
      return new Response(JSON.stringify({ error: "sandbox not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return proxyDaemonRequest(rec.daemonUrl, rec.token, path, init);
  }

  // ---- Public host-only surface ---------------------------------------------

  /** Used by the local ingress to map handle → daemon TCP port. */
  async resolveDaemonPort(handle: string): Promise<number | null> {
    const rec = await this.getRecord(handle);
    return rec?.daemonPort ?? null;
  }

  /**
   * Host-side absolute path of the per-branch clone. Used by stream-core to
   * set `cwd` on the Claude Code adapter so it edits the right files. Null
   * for unknown handles — caller falls back to `process.cwd()`.
   */
  async localWorkdir(handle: string): Promise<string | null> {
    const rec = await this.getRecord(handle);
    return rec?.workdir ?? null;
  }

  // ---- Internal helpers ------------------------------------------------------

  private workdirFor(handle: string): string {
    return join(this.homeDir, "sandboxes", handle);
  }

  private composePreviewUrl(rec: HostRecord): string {
    if (this.previewUrlPattern) {
      return applyPreviewPattern(this.previewUrlPattern, rec.handle);
    }
    const envRoot = process.env.SANDBOX_ROOT_URL;
    if (envRoot) return applyPreviewPattern(envRoot, rec.handle);
    const ingressPort = Number(process.env.SANDBOX_INGRESS_PORT ?? 7070);
    return `http://${rec.handle}.localhost:${ingressPort}/`;
  }

  private toSandbox(rec: HostRecord): Sandbox {
    return {
      handle: rec.handle,
      workdir: rec.workdir,
      previewUrl: this.composePreviewUrl(rec),
    };
  }

  private async getRecord(handle: string): Promise<HostRecord | null> {
    const cached = this.records.get(handle);
    if (cached) return cached;
    if (!this.stateStore) return null;
    const persisted = await this.stateStore.getByHandle(RUNNER_KIND, handle);
    if (!persisted) return null;
    const rec = await this.rehydrate(persisted.id, persisted);
    if (rec) this.records.set(handle, rec);
    return rec;
  }

  private async requireRecord(handle: string): Promise<HostRecord> {
    const rec = await this.getRecord(handle);
    if (!rec) throw new Error(`unknown sandbox handle ${handle}`);
    return rec;
  }

  private async rehydrate(
    id: SandboxId,
    persisted: { handle: string; state: Record<string, unknown> },
  ): Promise<HostRecord | null> {
    const state = persisted.state as Partial<PersistedHostState>;
    if (
      typeof state.pid !== "number" ||
      typeof state.daemonPort !== "number" ||
      typeof state.daemonUrl !== "string" ||
      typeof state.workdir !== "string" ||
      typeof state.token !== "string" ||
      typeof state.bootId !== "string"
    ) {
      return null;
    }
    if (!this.isAliveFn(state.pid)) return null;
    const health = await this.probeFn(state.daemonUrl);
    if (!health) return null;
    return {
      id,
      handle: persisted.handle,
      pid: state.pid,
      daemonPort: state.daemonPort,
      daemonUrl: state.daemonUrl,
      workdir: state.workdir,
      token: state.token,
      bootId: health.bootId,
    };
  }
}

// ---- Module-private helpers (used from later tasks) --------------------------

function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pre-allocate a host-side TCP port. The daemon binds to it on startup.
 * Race window is non-zero — the kernel may hand the port to another process
 * between close() and the daemon's bind() — in which case the daemon fails
 * to come up, `bootstrapAndWaitReady` times out on `waitForDaemonHttp`, and
 * `ensure()` rejects. There is no automatic retry; the caller (e.g.
 * VM_START) surfaces the error. In practice this never fires on a
 * developer machine.
 */
function preallocatePort(): Promise<number> {
  return new Promise((resolve_, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const { port } = addr;
        srv.close(() => resolve_(port));
      } else {
        srv.close(() => reject(new Error("could not allocate port")));
      }
    });
  });
}

/**
 * Boot env contract: only what `loadBootConfigFromEnv` reads. Tenant
 * config (runtime, repo, packageManager, devPort, caller env) flows
 * through `daemonBootstrap` instead.
 */
function buildDaemonBootEnv(args: {
  token: string;
  bootId: string;
  workdir: string;
  daemonPort: number;
}): Record<string, string> {
  return {
    DAEMON_TOKEN: args.token,
    DAEMON_BOOT_ID: args.bootId,
    APP_ROOT: args.workdir,
    PROXY_PORT: String(args.daemonPort),
  };
}

async function defaultSpawn(args: {
  workdir: string;
  env: Record<string, string>;
  daemonPort: number;
}): Promise<DaemonProcess> {
  const proc = Bun.spawn({
    cmd: ["bun", "run", DAEMON_ENTRY],
    // cwd is intentionally inherited from the parent — daemon resolves
    // its own paths relative to the entry file.
    env: { ...process.env, ...args.env },
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
  });
  return {
    pid: proc.pid,
    kill: (sig) => {
      proc.kill(sig as NodeJS.Signals | number | undefined);
      return true;
    },
  };
}
