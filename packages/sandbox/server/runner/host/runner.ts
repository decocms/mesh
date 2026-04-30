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
import { dirname, join } from "node:path";
import {
  probeDaemonHealth,
  proxyDaemonRequest,
  daemonBash,
} from "../../daemon-client";
import type { DaemonHealth } from "../../daemon-client";
import { applyPreviewPattern, computeHandle } from "../shared";
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
const HEALTH_PROBE_TIMEOUT_MS = 30_000;
const HEALTH_PROBE_INTERVAL_MS = 250;
const STOP_GRACE_MS = 2_000;
const DEFAULT_DEV_PORT = 3000;

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

    const env = buildDaemonEnv({
      token,
      bootId,
      workdir,
      daemonPort,
      devPort: opts.workload?.devPort ?? DEFAULT_DEV_PORT,
      runtime: opts.workload?.runtime ?? "node",
      packageManager: opts.workload?.packageManager ?? null,
      repo: opts.repo ?? null,
      extraEnv: opts.env,
    });

    const proc = await this.spawnFn({ workdir, env, daemonPort });
    await this.waitForHealthy(daemonUrl);

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

  private async waitForHealthy(daemonUrl: string): Promise<void> {
    const deadline = Date.now() + HEALTH_PROBE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const health = await this.probeFn(daemonUrl);
      if (health) return;
      await new Promise((r) => setTimeout(r, HEALTH_PROBE_INTERVAL_MS));
    }
    throw new Error(`daemon at ${daemonUrl} never reported healthy`);
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

export function isPidAlive(pid: number): boolean {
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
 * Race window is non-zero (kernel may hand the port to another process
 * between close and the daemon's bind), so the caller retries `ensure` on
 * health-probe timeout. In practice this never fires on a developer machine.
 */
export function preallocatePort(): Promise<number> {
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

function buildDaemonEnv(args: {
  token: string;
  bootId: string;
  workdir: string;
  daemonPort: number;
  devPort: number;
  runtime: string;
  packageManager: string | null;
  repo: NonNullable<EnsureOptions["repo"]> | null;
  extraEnv: Record<string, string> | undefined;
}): Record<string, string> {
  const repoLabel = args.repo
    ? (args.repo.displayName ?? deriveRepoLabel(args.repo.cloneUrl))
    : null;
  return {
    DAEMON_TOKEN: args.token,
    DAEMON_BOOT_ID: args.bootId,
    APP_ROOT: args.workdir,
    PROXY_PORT: String(args.daemonPort),
    DEV_PORT: String(args.devPort),
    RUNTIME: args.runtime,
    CLONE_DEPTH: "full",
    ...(args.repo
      ? {
          CLONE_URL: args.repo.cloneUrl,
          REPO_NAME: repoLabel ?? "",
          BRANCH: args.repo.branch ?? "",
          GIT_USER_NAME: args.repo.userName,
          GIT_USER_EMAIL: args.repo.userEmail,
        }
      : {}),
    ...(args.packageManager ? { PACKAGE_MANAGER: args.packageManager } : {}),
    ...(args.extraEnv ?? {}),
  };
}

function deriveRepoLabel(cloneUrl: string): string {
  try {
    const u = new URL(cloneUrl);
    const trimmed = u.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    return trimmed || u.hostname;
  } catch {
    return cloneUrl;
  }
}

export async function defaultSpawn(args: {
  workdir: string;
  env: Record<string, string>;
  daemonPort: number;
}): Promise<DaemonProcess> {
  const proc = Bun.spawn({
    cmd: ["bun", "run", "packages/sandbox/daemon/entry.ts"],
    cwd: process.cwd(),
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

export const __test__ = {
  HEALTH_PROBE_TIMEOUT_MS,
  HEALTH_PROBE_INTERVAL_MS,
  STOP_GRACE_MS,
};

// Internal types/exports to be referenced from Tasks 7-9 (kept private to
// the module but exported under __internal so the test file can validate
// shape if needed). Currently only the test seam types are surfaced via
// HostRunnerOptions.
export type { DaemonProcess, SpawnFn, HealthProbeFn, KillFn, IsAliveFn };
