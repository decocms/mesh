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

import { join } from "node:path";
import { createServer } from "node:net";
import {
  probeDaemonHealth,
  proxyDaemonRequest,
  daemonBash,
} from "../../daemon-client";
import { applyPreviewPattern } from "../shared";
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

type DaemonProcess = {
  pid: number;
  kill: (signal?: NodeJS.Signals | number) => boolean;
};
type SpawnFn = (args: {
  workdir: string;
  env: Record<string, string>;
  daemonPort: number;
}) => Promise<DaemonProcess>;
type HealthProbeFn = (daemonUrl: string) => Promise<{ bootId: string } | null>;
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

  protected readonly records = new Map<string, HostRecord>();
  protected readonly homeDir: string;
  protected readonly stateStore: RunnerStateStore | null;
  protected readonly previewUrlPattern: string | null;
  protected readonly spawnFn: SpawnFn;
  protected readonly probeFn: HealthProbeFn;
  protected readonly killFn: KillFn;
  protected readonly isAliveFn: IsAliveFn;

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

  async ensure(_id: SandboxId, _opts: EnsureOptions = {}): Promise<Sandbox> {
    throw new Error("not implemented (Task 7)");
  }

  async exec(handle: string, input: ExecInput): Promise<ExecOutput> {
    const rec = await this.requireRecord(handle);
    return daemonBash(rec.daemonUrl, rec.token, input);
  }

  async delete(_handle: string): Promise<void> {
    throw new Error("not implemented (Task 9)");
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

  protected workdirFor(handle: string): string {
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

  protected toSandbox(rec: HostRecord): Sandbox {
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

  /** Filled in by Task 8. */
  protected async rehydrate(
    _id: SandboxId,
    _persisted: { handle: string; state: Record<string, unknown> },
  ): Promise<HostRecord | null> {
    return null;
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

async function defaultSpawn(args: {
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
export type {
  DaemonProcess,
  SpawnFn,
  HealthProbeFn,
  KillFn,
  IsAliveFn,
  HostRecord,
  PersistedHostState,
};
