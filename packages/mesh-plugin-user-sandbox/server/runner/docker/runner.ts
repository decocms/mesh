/**
 * Docker sandbox runner — local dev.
 *
 * One hardened container per (user, projectRef). Daemon + dev ports are
 * published to ephemeral host ports; browser traffic routes through
 * `startLocalSandboxIngress` (`*.sandboxes.localhost`). Mesh owns teardown
 * and sweeps orphans on boot/shutdown.
 */

import { randomBytes } from "node:crypto";
import { DAEMON_PORT, DEFAULT_IMAGE, sleep } from "../../../shared";
import {
  bootstrapRepo,
  daemonBash,
  probeDaemonHealth,
  proxyDaemonRequest,
  waitForDaemonReady,
} from "../../daemon-client";
import {
  DEFAULT_WORKDIR,
  dockerExec,
  startContainer,
  type DockerExecFn,
  type DockerResult,
} from "../../docker-cli";
import { ensureSandboxImage } from "../../image-build";
import {
  Inflight,
  applyPreviewPattern,
  hashSandboxId,
  startDevServer,
  stopDevServer,
  withSandboxLock,
} from "../shared";
import type { RunnerStateStore, RunnerStateStoreOps } from "../state-store";
import type {
  EnsureOptions,
  ExecInput,
  ExecOutput,
  ProxyRequestInit,
  Sandbox,
  SandboxId,
  SandboxRunner,
  Workload,
} from "../types";

const RUNNER_KIND = "docker" as const;
const LABEL_ROOT = "mesh-sandbox";
const LABEL_ID = "mesh-sandbox.id";
const DEFAULT_DEV_PORT = 3000;
const HANDLE_LEN = 32; // 128-bit prefix, within RFC 1035's 63-char DNS cap.
const PORT_READBACK_ATTEMPTS = 15;
const PORT_READBACK_INTERVAL_MS = 200;
const LOG_LABEL = "DockerSandboxRunner";

export type ExecResult = DockerResult;
export type DockerExec = DockerExecFn;

export interface DockerRunnerOptions {
  image?: string;
  exec?: DockerExecFn;
  stateStore?: RunnerStateStore;
  previewUrlPattern?: string;
  /** Ownership label; override per mesh instance when multiple share one host. */
  labelPrefix?: string;
}

interface DockerRecord {
  id: SandboxId;
  handle: string;
  token: string;
  workdir: string;
  daemonUrl: string;
  daemonPort: number;
  devPort: number;
  devContainerPort: number;
  repoAttached: boolean;
  /**
   * In-flight repo bootstrap, or null when idle. See the K8s runner — we run
   * clone/checkout in the background so the Terminal tab catches setup logs
   * via SSE instead of seeing the full backlog dumped at once via `replayTo`.
   */
  bootstrapPromise: Promise<void> | null;
  workload: Workload | null;
}

interface PersistedDockerState {
  token: string;
  workdir: string;
  daemonUrl: string;
  devPort?: number;
  devContainerPort?: number;
  daemonPort?: number;
  repoAttached?: boolean;
  workload?: Workload | null;
  [k: string]: unknown;
}

const toHandle = (rawId: string): string => rawId.slice(0, HANDLE_LEN);

export class DockerSandboxRunner implements SandboxRunner {
  readonly kind = RUNNER_KIND;

  private readonly records = new Map<string, DockerRecord>();
  private readonly inflight = new Inflight<string, Sandbox>();
  private readonly defaultImage: string;
  private readonly exec_: DockerExecFn;
  private readonly labelPrefix: string;
  private readonly stateStore: RunnerStateStore | null;
  private readonly previewUrlPattern: string | null;

  constructor(opts: DockerRunnerOptions = {}) {
    this.defaultImage =
      opts.image ?? process.env.MESH_SANDBOX_IMAGE ?? DEFAULT_IMAGE;
    this.exec_ = opts.exec ?? dockerExec;
    this.labelPrefix = opts.labelPrefix ?? LABEL_ROOT;
    this.stateStore = opts.stateStore ?? null;
    this.previewUrlPattern = opts.previewUrlPattern ?? null;
  }

  // ---- SandboxRunner surface ------------------------------------------------

  async ensure(id: SandboxId, opts: EnsureOptions = {}): Promise<Sandbox> {
    const labelId = hashSandboxId(id, 16);
    return this.inflight.run(labelId, () =>
      withSandboxLock(this.stateStore, id, RUNNER_KIND, (ops) =>
        this.ensureLocked(id, labelId, opts, ops),
      ),
    );
  }

  async exec(handle: string, input: ExecInput): Promise<ExecOutput> {
    const rec = await this.requireRecord(handle);
    return daemonBash(rec.daemonUrl, rec.token, input);
  }

  async delete(handle: string): Promise<void> {
    const rec = await this.getRecord(handle);
    this.records.delete(handle);
    if (rec) await stopDevServer(rec.daemonUrl, rec.token, LOG_LABEL);
    await this.stopContainer(handle);
    if (this.stateStore) {
      if (rec) await this.stateStore.delete(rec.id, RUNNER_KIND);
      else await this.stateStore.deleteByHandle(RUNNER_KIND, handle);
    }
  }

  async alive(handle: string): Promise<boolean> {
    const r = await this.exec_([
      "inspect",
      "--format",
      "{{.State.Running}}",
      handle,
    ]);
    return r.code === 0 && r.stdout.trim() === "true";
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

  // ---- Docker-only surface --------------------------------------------------

  async sweepOrphans(): Promise<number> {
    const r = await this.exec_([
      "ps",
      "-aq",
      "--filter",
      `label=${this.labelPrefix}=1`,
    ]);
    if (r.code !== 0) return 0;
    const ids = r.stdout.trim().split("\n").filter(Boolean);
    await Promise.all(
      ids.map(async (id) => {
        await this.stopContainer(id).catch((err) =>
          console.warn(
            `[${LOG_LABEL}] sweep: stopContainer(${id}) failed:`,
            err instanceof Error ? err.message : String(err),
          ),
        );
        if (this.stateStore) {
          await this.stateStore
            .deleteByHandle(RUNNER_KIND, id)
            .catch((err) =>
              console.warn(
                `[${LOG_LABEL}] sweep: state-store deleteByHandle(${id}) failed:`,
                err instanceof Error ? err.message : String(err),
              ),
            );
        }
      }),
    );
    return ids.length;
  }

  /** Docker-only: host port → dev server. Used by local ingress. */
  async resolveDevPort(handle: string): Promise<number | null> {
    const rec = await this.getRecord(handle);
    return rec?.devPort ?? null;
  }

  /** Docker-only: host port → daemon. Used by local ingress. */
  async resolveDaemonPort(handle: string): Promise<number | null> {
    const rec = await this.getRecord(handle);
    return rec?.daemonPort ?? null;
  }

  // ---- Ensure flow ----------------------------------------------------------

  private async ensureLocked(
    id: SandboxId,
    labelId: string,
    opts: EnsureOptions,
    ops: RunnerStateStoreOps | null,
  ): Promise<Sandbox> {
    // 1. State-store resume.
    if (ops) {
      const persisted = await ops.get(id, RUNNER_KIND);
      if (persisted) {
        const rec = await this.rehydrate(id, persisted);
        if (rec) return this.finish(rec, opts, ops, /* persistNow */ false);
        await ops.delete(id, RUNNER_KIND);
      }
    }
    // 2. Side-channel adopt: container with our label still running.
    const adopted = await this.adoptByLabel(id, labelId, opts);
    if (adopted) return this.finish(adopted, opts, ops, /* persistNow */ true);
    // 3. Fresh provision.
    const fresh = await this.provision(id, labelId, opts);
    return this.finish(fresh, opts, ops, /* persistNow */ true);
  }

  private async finish(
    rec: DockerRecord,
    opts: EnsureOptions,
    ops: RunnerStateStoreOps | null,
    persistNow: boolean,
  ): Promise<Sandbox> {
    this.records.set(rec.handle, rec);
    // Persist BEFORE starting background bootstrap so the handle is resolvable
    // via /api/sandbox/:handle/_daemon/... as soon as VM_START returns (see
    // K8s runner `finish` for the full rationale).
    if (persistNow) await this.persist(ops, rec);
    // Bootstrap in the background — see K8s runner `finish` for the rationale
    // (Terminal tab subscribes only after VM_START returns; if we `await` the
    // clone here, the setup logs arrive as a post-hoc burst via `replayTo`).
    if (opts.repo && !rec.repoAttached && !rec.bootstrapPromise) {
      rec.bootstrapPromise = this.bootstrapAndStart(rec, opts);
    } else if (!opts.repo || rec.repoAttached) {
      startDevServer(
        rec.daemonUrl,
        rec.token,
        opts.workload ?? rec.workload,
        LOG_LABEL,
      );
    }
    return this.toSandbox(rec);
  }

  /**
   * Uses `this.stateStore` (unscoped) for the post-bootstrap persist — the
   * `ops` view from the caller's `withLock` scope is bound to a transaction
   * that closed when VM_START returned.
   */
  private async bootstrapAndStart(
    rec: DockerRecord,
    opts: EnsureOptions,
  ): Promise<void> {
    try {
      await bootstrapRepo(rec.daemonUrl, rec.token, rec.workdir, opts.repo!);
      rec.repoAttached = true;
      await this.persist(this.stateStore, rec).catch((err) =>
        console.warn(
          `[${LOG_LABEL}] persist after bootstrap failed for ${rec.handle}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      startDevServer(
        rec.daemonUrl,
        rec.token,
        opts.workload ?? rec.workload,
        LOG_LABEL,
      );
    } catch (err) {
      // Bootstrap failure used to tear the container down synchronously so a
      // failed VM_START wouldn't leak a half-broken sandbox. With the async
      // flow VM_START has already returned 200, so the user can't see the
      // error on the call — tear down anyway to match the old contract and
      // avoid stranding a container that can't serve the project.
      console.warn(
        `[${LOG_LABEL}] background bootstrap failed for ${rec.handle}: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.records.delete(rec.handle);
      // We persisted synchronously before kicking off bootstrap (so the proxy
      // at /api/sandbox/:handle could resolve immediately). Clean it up now
      // so the next VM_START doesn't rehydrate an orphan row.
      if (this.stateStore) {
        await this.stateStore
          .deleteByHandle(RUNNER_KIND, rec.handle)
          .catch((err) =>
            console.warn(
              `[${LOG_LABEL}] state cleanup after attach failure handle=${rec.handle} err="${err instanceof Error ? err.message : String(err)}"`,
            ),
          );
      }
      await this.stopContainer(rec.handle).catch((teardownErr) =>
        console.warn(
          `[${LOG_LABEL}] orphan teardown after attach failure handle=${rec.handle} teardownErr="${
            teardownErr instanceof Error
              ? teardownErr.message
              : String(teardownErr)
          }"`,
        ),
      );
    } finally {
      rec.bootstrapPromise = null;
    }
  }

  private async provision(
    id: SandboxId,
    labelId: string,
    opts: EnsureOptions,
  ): Promise<DockerRecord> {
    const token = randomBytes(24).toString("hex");
    const workdir = DEFAULT_WORKDIR;
    const image = opts.image ?? this.defaultImage;
    const devContainerPort = opts.workload?.devPort ?? DEFAULT_DEV_PORT;

    const env: Record<string, string> = {
      DAEMON_TOKEN: token,
      DAEMON_PORT: String(DAEMON_PORT),
      WORKDIR: workdir,
      ...(opts.env ?? {}),
    };

    // Shared singleton; awaits any background build kicked off by the CLI.
    await ensureSandboxImage({ image, exec: this.exec_ });

    // Hardening: drop caps + block privilege escalation; cap processes/memory/
    // cpu against runaway user scripts. Read-only root removes most write-based
    // pivots; /tmp is a bounded tmpfs; /app and /home/sandbox are anonymous
    // volumes (disk-backed) so package-manager caches don't blow the mem cap.
    const { id: rawId } = await startContainer(image, {
      label: "sandbox",
      exec: this.exec_,
      args: [
        "--rm",
        "--init",
        "--read-only",
        "--tmpfs=/tmp:rw,nosuid,nodev,size=256m",
        "-v",
        "/app",
        "-v",
        "/home/sandbox",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--pids-limit=512",
        "--memory=2g",
        "--memory-swap=2g",
        "--cpus=1",
        "--label",
        `${this.labelPrefix}=1`,
        "--label",
        `${LABEL_ID}=${labelId}`,
        "-p",
        `127.0.0.1:0:${DAEMON_PORT}`,
        "-p",
        `127.0.0.1:0:${devContainerPort}`,
        ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
      ],
    });
    const handle = toHandle(rawId);

    const daemonPort = await this.readPort(handle, DAEMON_PORT);
    const daemonUrl = `http://127.0.0.1:${daemonPort}`;
    const devPort = await this.readPort(handle, devContainerPort);
    try {
      await waitForDaemonReady(daemonUrl);
    } catch (err) {
      await this.stopContainer(handle).catch((stopErr) =>
        console.warn(
          `[${LOG_LABEL}] cleanup stop after waitForDaemonReady failure (${handle}) itself failed:`,
          stopErr instanceof Error ? stopErr.message : String(stopErr),
        ),
      );
      throw err;
    }
    return {
      id,
      handle,
      token,
      workdir,
      daemonUrl,
      daemonPort,
      devPort,
      devContainerPort,
      repoAttached: false,
      bootstrapPromise: null,
      workload: opts.workload ?? null,
    };
  }

  /**
   * Reconstruct a record from persisted state, probing that the container is
   * still healthy. Returns null on any mismatch — caller purges and falls
   * through to `adoptByLabel`/`provision`.
   */
  private async rehydrate(
    id: SandboxId,
    persisted: { handle: string; state: Record<string, unknown> },
  ): Promise<DockerRecord | null> {
    const state = persisted.state as Partial<PersistedDockerState>;
    if (!state.token || !state.daemonUrl) return null;
    const handle = toHandle(persisted.handle);
    const devContainerPort = state.devContainerPort ?? DEFAULT_DEV_PORT;
    let daemonPort: number;
    let devPort: number;
    try {
      daemonPort = await this.readPort(handle, DAEMON_PORT);
      devPort = await this.readPort(handle, devContainerPort);
    } catch {
      return null;
    }
    const daemonUrl = `http://127.0.0.1:${daemonPort}`;
    if (!(await probeDaemonHealth(daemonUrl))) return null;
    return {
      id,
      handle,
      token: state.token,
      workdir: state.workdir ?? DEFAULT_WORKDIR,
      daemonUrl,
      daemonPort,
      devPort,
      devContainerPort,
      repoAttached: state.repoAttached ?? false,
      bootstrapPromise: null,
      workload: state.workload ?? null,
    };
  }

  /**
   * State store empty but a container with our label still runs. Reconstruct
   * from `docker inspect` env vars; tear down anything we can't reuse so
   * `provision` below doesn't collide on the next ensure.
   */
  private async adoptByLabel(
    id: SandboxId,
    labelId: string,
    opts: EnsureOptions,
  ): Promise<DockerRecord | null> {
    const existing = await this.findExisting(labelId);
    if (!existing) return null;

    const cached = this.records.get(existing);
    if (cached) return cached;

    const recovered = await this.reconstructFromContainer(id, existing, opts);
    if (recovered) return recovered;

    await this.stopContainer(existing);
    return null;
  }

  private async reconstructFromContainer(
    id: SandboxId,
    handle: string,
    opts: EnsureOptions,
  ): Promise<DockerRecord | null> {
    const r = await this.exec_([
      "inspect",
      "--format",
      "{{range .Config.Env}}{{println .}}{{end}}",
      handle,
    ]);
    if (r.code !== 0) return null;
    let token: string | null = null;
    let workdir = DEFAULT_WORKDIR;
    for (const line of r.stdout.split("\n")) {
      if (line.startsWith("DAEMON_TOKEN=")) token = line.slice(13);
      else if (line.startsWith("WORKDIR=")) workdir = line.slice(8);
    }
    if (!token) return null;
    const daemonPort = await this.readPort(handle, DAEMON_PORT);
    const daemonUrl = `http://127.0.0.1:${daemonPort}`;
    if (!(await probeDaemonHealth(daemonUrl))) return null;
    const devContainerPort = opts.workload?.devPort ?? DEFAULT_DEV_PORT;
    const devPort = await this.readPort(handle, devContainerPort);
    return {
      id,
      handle,
      token,
      workdir,
      daemonUrl,
      daemonPort,
      devPort,
      devContainerPort,
      repoAttached: false,
      bootstrapPromise: null,
      workload: opts.workload ?? null,
    };
  }

  // ---- Handle resolution (post-restart) -------------------------------------

  /**
   * Look up a record by handle, rehydrating from persisted state on cache
   * miss. The returned record is fully usable for any of the six methods —
   * after a mesh restart this is the entry point that reconstructs state.
   */
  private async getRecord(handle: string): Promise<DockerRecord | null> {
    const cached = this.records.get(handle);
    if (cached) return cached;
    if (!this.stateStore) return null;
    const persisted = await this.stateStore.getByHandle(RUNNER_KIND, handle);
    if (!persisted) return null;
    const rec = await this.rehydrate(persisted.id, persisted);
    if (rec) this.records.set(handle, rec);
    return rec;
  }

  private async requireRecord(handle: string): Promise<DockerRecord> {
    const rec = await this.getRecord(handle);
    if (!rec) throw new Error(`unknown sandbox handle ${handle}`);
    return rec;
  }

  // ---- Preview URL ----------------------------------------------------------

  /**
   * Local-ingress preview URL. Docker's URL is derived purely from the handle,
   * not gated on workload — the dev server may boot from a caller workload
   * hint OR the daemon auto-sniffing package.json / deno.json.
   */
  private composePreviewUrl(rec: DockerRecord): string {
    if (this.previewUrlPattern) {
      return applyPreviewPattern(this.previewUrlPattern, rec.handle);
    }
    const envRoot = process.env.SANDBOX_ROOT_URL;
    if (envRoot) return applyPreviewPattern(envRoot, rec.handle);
    const ingressPort = Number(process.env.SANDBOX_INGRESS_PORT ?? 7070);
    return `http://${rec.handle}.sandboxes.localhost:${ingressPort}/`;
  }

  private toSandbox(rec: DockerRecord): Sandbox {
    return {
      handle: rec.handle,
      workdir: rec.workdir,
      previewUrl: this.composePreviewUrl(rec),
    };
  }

  // ---- Persistence ----------------------------------------------------------

  private async persist(
    ops: RunnerStateStoreOps | null,
    rec: DockerRecord,
  ): Promise<void> {
    if (!ops) return;
    const state: PersistedDockerState = {
      token: rec.token,
      workdir: rec.workdir,
      daemonUrl: rec.daemonUrl,
      daemonPort: rec.daemonPort,
      devPort: rec.devPort,
      devContainerPort: rec.devContainerPort,
      repoAttached: rec.repoAttached,
      workload: rec.workload,
    };
    await ops.put(rec.id, RUNNER_KIND, { handle: rec.handle, state });
  }

  // ---- Docker CLI helpers ---------------------------------------------------

  private async stopContainer(handle: string): Promise<void> {
    await this.exec_(["stop", "--time", "2", handle]);
  }

  private async findExisting(labelId: string): Promise<string | null> {
    const r = await this.exec_([
      "ps",
      "--no-trunc",
      "-q",
      "--filter",
      `label=${LABEL_ID}=${labelId}`,
    ]);
    if (r.code !== 0) return null;
    const rawId = r.stdout.trim().split("\n").filter(Boolean)[0];
    return rawId ? toHandle(rawId) : null;
  }

  private async readPort(
    handle: string,
    containerPort: number,
  ): Promise<number> {
    for (let i = 0; i < PORT_READBACK_ATTEMPTS; i++) {
      const r = await this.exec_(["port", handle, `${containerPort}/tcp`]);
      if (r.code === 0) {
        for (const line of r.stdout.split("\n")) {
          const match = line.trim().match(/:(\d+)$/);
          if (match) return Number(match[1]);
        }
      } else if (/no such container/i.test(r.stderr)) {
        const diag = await this.exitDiagnostics(handle);
        throw new Error(
          `sandbox container ${handle} exited before daemon started${diag}`,
        );
      }
      await sleep(PORT_READBACK_INTERVAL_MS);
    }
    throw new Error(
      `timed out waiting for docker port mapping on container ${handle}`,
    );
  }

  private async exitDiagnostics(handle: string): Promise<string> {
    const parts: string[] = [];
    const inspect = await this.exec_([
      "inspect",
      "--format",
      "{{.State.ExitCode}}",
      handle,
    ]);
    if (inspect.code === 0 && inspect.stdout.trim()) {
      parts.push(`exit=${inspect.stdout.trim()}`);
    }
    const logs = await this.exec_(["logs", "--tail", "20", handle]);
    const tail = [logs.stdout, logs.stderr]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n")
      .trim();
    if (tail) parts.push(`logs:\n${tail}`);
    return parts.length ? ` (${parts.join(" ")})` : "";
  }
}
