import { createHash, randomBytes } from "node:crypto";
import { DAEMON_PORT, DEFAULT_IMAGE, sleep } from "../../shared";
import {
  bootstrapRepo,
  daemonBash,
  probeDaemonHealth,
  proxyDaemonRequest as proxyDaemonRequestClient,
  waitForDaemonReady,
} from "../daemon-client";
import {
  DEFAULT_WORKDIR,
  dockerExec,
  startContainer,
  type DockerResult,
} from "../docker-cli";
import type { RunnerStateStore } from "./state-store";
import type {
  EnsureOptions,
  ExecInput,
  ExecOutput,
  ProxyRequestInit,
  Sandbox,
  SandboxId,
  SandboxRunner,
  Workload,
} from "./types";
import { sandboxIdKey } from "./types";

const RUNNER_KIND = "docker" as const;
const LABEL_ROOT = "mesh-sandbox";
const LABEL_ID = "mesh-sandbox.id";
const PORT_READBACK_ATTEMPTS = 15;
const PORT_READBACK_INTERVAL_MS = 200;

export type ExecResult = DockerResult;

export interface DockerExec {
  (args: string[]): Promise<ExecResult>;
}

export interface DockerRunnerOptions {
  image?: string;
  exec?: DockerExec;
  /**
   * Label used to claim ownership of containers spawned by this runner.
   * Override per mesh instance if multiple need to coexist on one host.
   */
  labelPrefix?: string;
  /**
   * Optional persistent store. When supplied, the runner consults it before
   * docker-level discovery so cross-process races settle on the first row to
   * win the (user_id, project_ref, runner_kind) PK.
   */
  stateStore?: RunnerStateStore;
  /**
   * Template for the public preview URL. `{handle}` is replaced with the
   * sandbox handle. When omitted, falls back to
   * `SANDBOX_ROOT_URL` (interpreted with `{handle}` substitution OR as a
   * URL whose hostname gets prefixed) then to the local-ingress default
   * `http://{handle}.sandboxes.localhost:<SANDBOX_INGRESS_PORT|7070>/`.
   */
  previewUrlPattern?: string;
}

// DNS label cap is 63 chars (RFC 1035), so the full 64-hex Docker container id
// can't be used as a subdomain. Slice to 32 hex (128 bits) at every Docker→runner
// boundary — still cryptographically secret as a capability, and Docker accepts
// any prefix ≥12 chars for inspect/stop/port, so no downstream lookups break.
const HANDLE_LEN = 32;
const toHandle = (rawId: string): string => rawId.slice(0, HANDLE_LEN);

/** Container-internal port the dev server is expected to bind. */
const DEFAULT_DEV_PORT = 3000;

/** Private per-handle record. Never escapes the runner. */
interface DockerRecord {
  handle: string;
  daemonUrl: string;
  token: string;
  workdir: string;
  id: SandboxId;
  /** Host-side port mapped to container :<workload.devPort> (user's dev server). */
  devPort: number;
  /** Container-internal dev port — 3000 unless overridden by workload. */
  devContainerPort: number;
  /** Host-side port mapped to container :9000 (daemon). */
  daemonPort: number;
  /**
   * True once we've attempted a repo bootstrap in this container. Covers both
   * successful clones and skipped-because-workdir-was-not-empty outcomes —
   * either way, we don't want to retry on the next ensure() call.
   */
  repoAttached: boolean;
  /**
   * Workload last started in this container (runtime/packageManager/devPort).
   * Persisted so a mesh restart can resume the dev server with the same
   * config. `null` for blank sandboxes.
   */
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

export class DockerSandboxRunner implements SandboxRunner {
  readonly kind = RUNNER_KIND;
  private readonly defaultImage: string;
  private readonly exec_: DockerExec;
  private readonly labelPrefix: string;
  private readonly stateStore: RunnerStateStore | null;
  private readonly previewUrlPattern: string | null;
  private readonly byHandle = new Map<string, DockerRecord>();
  private readonly inflight = new Map<string, Promise<Sandbox>>();

  constructor(opts: DockerRunnerOptions = {}) {
    this.defaultImage =
      opts.image ?? process.env.MESH_SANDBOX_IMAGE ?? DEFAULT_IMAGE;
    this.exec_ = opts.exec ?? dockerExec;
    this.labelPrefix = opts.labelPrefix ?? LABEL_ROOT;
    this.stateStore = opts.stateStore ?? null;
    this.previewUrlPattern = opts.previewUrlPattern ?? null;
  }

  async ensure(id: SandboxId, opts: EnsureOptions = {}): Promise<Sandbox> {
    const labelId = hashId(id);
    const pending = this.inflight.get(labelId);
    if (pending) return pending;
    const p = this.ensureInner(id, labelId, opts);
    this.inflight.set(labelId, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(labelId);
    }
  }

  async exec(handle: string, input: ExecInput): Promise<ExecOutput> {
    const rec = await this.requireRecord(handle);
    return daemonBash(rec.daemonUrl, rec.token, input);
  }

  async delete(handle: string): Promise<void> {
    const rec = await this.lookupRecord(handle);
    this.byHandle.delete(handle);
    // Best-effort graceful dev-server shutdown before the container teardown
    // forcibly kills everything. Failures swallowed — the container stop
    // below is the source of truth.
    if (rec) {
      await proxyDaemonRequestClient(
        rec.daemonUrl,
        rec.token,
        "/_daemon/dev/stop",
        { method: "POST", headers: new Headers(), body: null },
      ).catch(() => {});
    }
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

  async sweepOrphans(): Promise<number> {
    const r = await this.exec_([
      "ps",
      "-aq",
      "--filter",
      `label=${this.labelPrefix}=1`,
    ]);
    if (r.code !== 0) return 0;
    const ids = r.stdout.trim().split("\n").filter(Boolean);
    for (const id of ids) {
      await this.stopContainer(id);
      if (this.stateStore) {
        await this.stateStore.deleteByHandle(RUNNER_KIND, id).catch(() => {});
      }
    }
    return ids.length;
  }

  async getPreviewUrl(handle: string): Promise<string | null> {
    const rec = await this.lookupRecord(handle);
    if (!rec || !rec.workload) return null;
    return this.composePreviewUrl(handle);
  }

  /**
   * HTTP passthrough to the sandbox daemon's `/_daemon/*` control plane.
   * The bearer token never leaves this class — the caller gets back a native
   * `Response` with the body streamed from the daemon.
   */
  async proxyDaemonRequest(
    handle: string,
    path: string,
    init: ProxyRequestInit,
  ): Promise<Response> {
    const rec = await this.lookupRecord(handle);
    if (!rec) {
      return new Response(JSON.stringify({ error: "sandbox not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return proxyDaemonRequestClient(rec.daemonUrl, rec.token, path, init);
  }

  /**
   * Host-side port mapped to the sandbox's dev server. Used by the local
   * ingress proxy in dev. NOT on `SandboxRunner` — only Docker has
   * host-side port mappings.
   */
  async resolveDevPort(handle: string): Promise<number | null> {
    const rec = await this.lookupRecord(handle);
    return rec?.devPort ?? null;
  }

  /**
   * Host-side port mapped to the sandbox daemon. Used by the local
   * ingress proxy in dev. NOT on `SandboxRunner` — only Docker has
   * host-side port mappings.
   */
  async resolveDaemonPort(handle: string): Promise<number | null> {
    const rec = await this.lookupRecord(handle);
    return rec?.daemonPort ?? null;
  }

  // ---------------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------------

  private async ensureInner(
    id: SandboxId,
    labelId: string,
    opts: EnsureOptions,
  ): Promise<Sandbox> {
    // 1. State-store lookup first (survives mesh restart + cross-process race).
    if (this.stateStore) {
      const persisted = await this.stateStore.get(id, RUNNER_KIND);
      if (persisted) {
        const probed = await this.probePersisted(id, persisted);
        if (probed) {
          this.byHandle.set(probed.handle, probed);
          await this.attachRepoIfNeeded(id, probed, opts);
          await this.startDevServerIfNeeded(probed, opts);
          return this.toSandbox(probed);
        }
        // Stale row — purge and fall through to docker discovery / create.
        await this.stateStore.delete(id, RUNNER_KIND);
      }
    }

    // 2. Docker-level discovery (survives when state store is absent or empty,
    //    e.g. state store wiped but docker still has the container).
    const existingHandle = await this.findExisting(labelId);
    if (existingHandle) {
      const tracked = this.byHandle.get(existingHandle);
      if (tracked) {
        await this.attachRepoIfNeeded(id, tracked, opts);
        await this.startDevServerIfNeeded(tracked, opts);
        return this.toSandbox(tracked);
      }
      const recovered = await this.recoverSandbox(id, existingHandle, opts);
      if (recovered) {
        this.byHandle.set(existingHandle, recovered);
        await this.persist(id, recovered);
        await this.attachRepoIfNeeded(id, recovered, opts);
        await this.startDevServerIfNeeded(recovered, opts);
        return this.toSandbox(recovered);
      }
      await this.stopContainer(existingHandle);
    }

    // 3. Fresh provision. Persist happens AFTER the clone so the mesh-side
    //    state store (queried by the decopilot/preview pollers) only surfaces
    //    this sandbox once the workdir is populated.
    const rec = await this.provision(id, labelId, opts);
    this.byHandle.set(rec.handle, rec);
    try {
      await this.attachRepoIfNeeded(id, rec, opts);
    } catch (err) {
      this.byHandle.delete(rec.handle);
      await this.stopContainer(rec.handle).catch(() => {});
      throw err;
    }
    await this.persist(id, rec);
    await this.startDevServerIfNeeded(rec, opts);
    return this.toSandbox(rec);
  }

  /** Convert internal record → public Sandbox shape. */
  private toSandbox(rec: DockerRecord): Sandbox {
    return {
      handle: rec.handle,
      workdir: rec.workdir,
      previewUrl: rec.workload ? this.composePreviewUrl(rec.handle) : null,
    };
  }

  /**
   * Run repo bootstrap (git identity + idempotent clone) in the existing
   * container. No-ops when no repo is requested or we've already attempted
   * attach in this sandbox. Mutates `rec.repoAttached` and persists on success.
   */
  private async attachRepoIfNeeded(
    id: SandboxId,
    rec: DockerRecord,
    opts: EnsureOptions,
  ): Promise<void> {
    if (!opts.repo || rec.repoAttached) return;
    await bootstrapRepo(rec.daemonUrl, rec.token, rec.workdir, opts.repo);
    rec.repoAttached = true;
    await this.persist(id, rec);
  }

  /**
   * Kick off the dev server for the container's workload. Fire-and-forget —
   * VM_START returns fast and the dev server boots in the background. The
   * daemon's `/dev/start` is idempotent; if a previous call already started
   * the server, this is a no-op on its side.
   */
  private async startDevServerIfNeeded(
    rec: DockerRecord,
    opts: EnsureOptions,
  ): Promise<void> {
    const workload = opts.workload ?? rec.workload;
    if (!workload) return;
    const body = JSON.stringify({ runtime: workload.runtime });
    proxyDaemonRequestClient(rec.daemonUrl, rec.token, "/_daemon/dev/start", {
      method: "POST",
      headers: new Headers({ "content-type": "application/json" }),
      body,
    }).catch((err) => {
      console.error(
        `[DockerSandboxRunner] /dev/start failed for ${rec.handle}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
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

    const portPublishArgs = [
      "-p",
      `127.0.0.1:0:${DAEMON_PORT}`,
      "-p",
      `127.0.0.1:0:${devContainerPort}`,
    ];

    const env: Record<string, string> = {
      DAEMON_TOKEN: token,
      DAEMON_PORT: String(DAEMON_PORT),
      WORKDIR: workdir,
      ...(opts.env ?? {}),
    };

    const { id: rawId } = await startContainer(image, {
      label: "sandbox",
      exec: this.exec_,
      args: [
        "--rm",
        "--init",
        "--label",
        `${this.labelPrefix}=1`,
        "--label",
        `${LABEL_ID}=${labelId}`,
        ...portPublishArgs,
        ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
      ],
    });
    const handle = toHandle(rawId);

    const daemonPort = await this.readPort(handle, DAEMON_PORT);
    const daemonUrl = `http://127.0.0.1:${daemonPort}`;
    const devPort = await this.readPort(handle, devContainerPort);
    await this.waitForReady(daemonUrl, handle);
    return {
      handle,
      daemonUrl,
      token,
      workdir,
      id,
      devPort,
      devContainerPort,
      daemonPort,
      repoAttached: false,
      workload: opts.workload ?? null,
    };
  }

  /**
   * Compose the public preview URL for a handle. Pattern resolution order:
   *   1. Explicit `previewUrlPattern` constructor option (`{handle}` → handle).
   *   2. `SANDBOX_ROOT_URL` env. If it contains `{handle}`, substitute;
   *      otherwise prefix the URL hostname with `<handle>.`.
   *   3. Local-ingress default: `http://<handle>.sandboxes.localhost:<port>/`.
   * Reads env at call time so deploys can rewrite without a rebuild.
   */
  private composePreviewUrl(handle: string): string {
    const explicit = this.previewUrlPattern;
    if (explicit) return this.applyPattern(explicit, handle);
    const envRoot = process.env.SANDBOX_ROOT_URL;
    if (envRoot) return this.applyPattern(envRoot, handle);
    const ingressPort = Number(process.env.SANDBOX_INGRESS_PORT ?? 7070);
    return `http://${handle}.sandboxes.localhost:${ingressPort}/`;
  }

  private applyPattern(pattern: string, handle: string): string {
    const base = pattern.replace(/\/+$/, "");
    if (base.includes("{handle}"))
      return `${base.replace("{handle}", handle)}/`;
    try {
      const u = new URL(base);
      u.hostname = `${handle}.${u.hostname}`;
      return `${u.toString()}/`;
    } catch {
      // Pattern wasn't a valid URL; fall back to local-ingress default shape.
      const ingressPort = Number(process.env.SANDBOX_INGRESS_PORT ?? 7070);
      return `http://${handle}.sandboxes.localhost:${ingressPort}/`;
    }
  }

  /**
   * Find a DockerRecord for the given handle. Checks the in-memory cache
   * first, then falls back to the state store — needed when the mesh process
   * restarted (so `byHandle` is empty) but the container is still running.
   */
  private async lookupRecord(handle: string): Promise<DockerRecord | null> {
    const cached = this.byHandle.get(handle);
    if (cached) return cached;
    if (!this.stateStore) return null;
    const persisted = await this.stateStore.getByHandle(RUNNER_KIND, handle);
    if (!persisted) return null;
    const rec = await this.hydratePersisted(persisted.id, persisted);
    if (rec) this.byHandle.set(handle, rec);
    return rec;
  }

  private async requireRecord(handle: string): Promise<DockerRecord> {
    const rec = await this.lookupRecord(handle);
    if (!rec) throw new Error(`unknown sandbox handle ${handle}`);
    return rec;
  }

  private async probePersisted(
    id: SandboxId,
    record: { handle: string; state: Record<string, unknown> },
  ): Promise<DockerRecord | null> {
    const rec = await this.hydratePersisted(id, record);
    if (!rec) return null;
    return (await probeDaemonHealth(rec.daemonUrl)) ? rec : null;
  }

  /**
   * Rehydrate a DockerRecord from a persisted state-store row. Returns null
   * on malformed rows (missing token/daemonUrl) or when re-reading the
   * docker port mapping throws. We re-read the ephemeral port docker picked
   * since mesh may have restarted with stale memory.
   */
  private async hydratePersisted(
    id: SandboxId,
    record: { handle: string; state: Record<string, unknown> },
  ): Promise<DockerRecord | null> {
    const state = record.state as Partial<PersistedDockerState>;
    if (!state.token || !state.daemonUrl) return null;
    const handle = toHandle(record.handle);
    const devContainerPort = state.devContainerPort ?? DEFAULT_DEV_PORT;
    try {
      const daemonPort = await this.readPort(handle, DAEMON_PORT);
      const daemonUrl = `http://127.0.0.1:${daemonPort}`;
      const devPort = await this.readPort(handle, devContainerPort);
      return {
        handle,
        daemonUrl,
        token: state.token,
        workdir: state.workdir ?? DEFAULT_WORKDIR,
        id,
        devPort,
        devContainerPort,
        daemonPort,
        repoAttached: state.repoAttached ?? false,
        workload: state.workload ?? null,
      };
    } catch {
      return null;
    }
  }

  private async waitForReady(daemonUrl: string, handle: string): Promise<void> {
    try {
      await waitForDaemonReady(daemonUrl);
    } catch (err) {
      await this.stopContainer(handle).catch(() => {});
      throw err;
    }
  }

  private async recoverSandbox(
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
      if (line.startsWith("DAEMON_TOKEN=")) {
        token = line.slice("DAEMON_TOKEN=".length);
      } else if (line.startsWith("WORKDIR=")) {
        workdir = line.slice("WORKDIR=".length);
      }
    }
    if (!token) return null;
    const daemonPort = await this.readPort(handle, DAEMON_PORT);
    const daemonUrl = `http://127.0.0.1:${daemonPort}`;
    if (!(await probeDaemonHealth(daemonUrl))) return null;
    const devContainerPort = opts.workload?.devPort ?? DEFAULT_DEV_PORT;
    const devPort = await this.readPort(handle, devContainerPort);
    // Recovered via docker inspect — state store is empty so we don't know
    // whether a repo was previously attached. Leave it false; the next
    // ensure() will re-stamp it idempotently.
    return {
      handle,
      daemonUrl,
      token,
      workdir,
      id,
      devPort,
      devContainerPort,
      daemonPort,
      repoAttached: false,
      workload: opts.workload ?? null,
    };
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

  private async stopContainer(handle: string): Promise<void> {
    await this.exec_(["stop", "--time", "2", handle]);
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
        // Container exited (and `--rm` cleaned it up) before the daemon bound
        // the port. Retrying for 3s is pointless — fail fast with the exit
        // status and logs so the caller sees what crashed.
        const diag = await this.containerExitDiagnostics(handle);
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

  private async containerExitDiagnostics(handle: string): Promise<string> {
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

  private async persist(id: SandboxId, rec: DockerRecord): Promise<void> {
    if (!this.stateStore) return;
    const state: PersistedDockerState = {
      token: rec.token,
      workdir: rec.workdir,
      daemonUrl: rec.daemonUrl,
      devPort: rec.devPort,
      devContainerPort: rec.devContainerPort,
      daemonPort: rec.daemonPort,
      repoAttached: rec.repoAttached,
      workload: rec.workload,
    };
    await this.stateStore.put(id, RUNNER_KIND, { handle: rec.handle, state });
  }
}

function hashId(id: SandboxId): string {
  return createHash("sha256")
    .update(sandboxIdKey(id))
    .digest("hex")
    .slice(0, 16);
}
