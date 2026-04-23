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
import { ensureSandboxImage } from "../image-build";
import type { RunnerStateStore, RunnerStateStoreOps } from "./state-store";
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
  /** Ownership label; override per mesh instance when multiple share one host. */
  labelPrefix?: string;
  /** Persistent store consulted before docker discovery; its PK resolves cross-pod races. */
  stateStore?: RunnerStateStore;
  /**
   * Preview URL template. Resolution order: this → `SANDBOX_ROOT_URL`
   * (substitutes `{handle}` or hostname-prefixes) → `http://{handle}.sandboxes.localhost:<SANDBOX_INGRESS_PORT|7070>/`.
   */
  previewUrlPattern?: string;
}

// 32 hex (128 bits) keeps it within DNS's 63-char label cap (RFC 1035) while
// still cryptographically secret; Docker accepts any prefix ≥12 chars.
const HANDLE_LEN = 32;
const toHandle = (rawId: string): string => rawId.slice(0, HANDLE_LEN);

const DEFAULT_DEV_PORT = 3000;

/** Private per-handle record. Never escapes the runner. */
interface DockerRecord {
  handle: string;
  daemonUrl: string;
  token: string;
  workdir: string;
  id: SandboxId;
  /** Host-side port → container dev port. */
  devPort: number;
  /** Container-internal dev port (default 3000). */
  devContainerPort: number;
  /** Host-side port → container daemon port. */
  daemonPort: number;
  /** True once bootstrap has been attempted (success or skipped); prevents retry. */
  repoAttached: boolean;
  /** Last-started workload; persisted so mesh restart resumes the same config. */
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
    // In-process dedupe + state-store `withLock` (cross-pod). Without withLock
    // we're single-pod-safe only — prod MUST ship a store that implements it.
    // The scoped store passed to the callback reuses the lock's connection;
    // without that, nested stateStore calls race the main pool and can
    // deadlock at `databasePoolMax` concurrent provisionings.
    const p =
      this.stateStore && this.stateStore.withLock
        ? this.stateStore.withLock(id, RUNNER_KIND, (scoped) =>
            this.ensureInner(id, labelId, opts, scoped),
          )
        : this.ensureInner(id, labelId, opts, this.stateStore);
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
    // Best-effort graceful dev-stop before the forcible container teardown;
    // log (don't swallow) so daemon outages surface in ops.
    if (rec) {
      await proxyDaemonRequestClient(
        rec.daemonUrl,
        rec.token,
        "/_daemon/dev/stop",
        { method: "POST", headers: new Headers(), body: null },
      ).catch((err) =>
        console.warn(
          `[DockerSandboxRunner] graceful dev-stop failed for ${handle}:`,
          err instanceof Error ? err.message : String(err),
        ),
      );
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
    await Promise.all(
      ids.map(async (id) => {
        await this.stopContainer(id).catch((err) =>
          console.warn(
            `[DockerSandboxRunner] sweep: stopContainer(${id}) failed:`,
            err instanceof Error ? err.message : String(err),
          ),
        );
        if (this.stateStore) {
          await this.stateStore
            .deleteByHandle(RUNNER_KIND, id)
            .catch((err) =>
              console.warn(
                `[DockerSandboxRunner] sweep: state-store deleteByHandle(${id}) failed:`,
                err instanceof Error ? err.message : String(err),
              ),
            );
        }
      }),
    );
    return ids.length;
  }

  async getPreviewUrl(handle: string): Promise<string | null> {
    const rec = await this.lookupRecord(handle);
    if (!rec) return null;
    return this.composePreviewUrl(handle);
  }

  /** Passthrough to `/_daemon/*`; bearer token stays inside the class, body streams. */
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

  /** Docker-only: host port → dev server. Used by local ingress; not on `SandboxRunner`. */
  async resolveDevPort(handle: string): Promise<number | null> {
    const rec = await this.lookupRecord(handle);
    return rec?.devPort ?? null;
  }

  /** Docker-only: host port → daemon. Used by local ingress; not on `SandboxRunner`. */
  async resolveDaemonPort(handle: string): Promise<number | null> {
    const rec = await this.lookupRecord(handle);
    return rec?.daemonPort ?? null;
  }

  private async ensureInner(
    id: SandboxId,
    labelId: string,
    opts: EnsureOptions,
    store: RunnerStateStoreOps | null,
  ): Promise<Sandbox> {
    // 1. State store → survives mesh restart + cross-process race.
    if (store) {
      const persisted = await store.get(id, RUNNER_KIND);
      if (persisted) {
        const probed = await this.probePersisted(id, persisted);
        if (probed) {
          this.byHandle.set(probed.handle, probed);
          await this.attachRepoIfNeeded(id, probed, opts, store);
          await this.startDevServer(probed, opts);
          return this.toSandbox(probed);
        }
        // Stale row — purge, fall through to discovery.
        await store.delete(id, RUNNER_KIND);
      }
    }

    // 2. Docker discovery → recovers when state store is empty but container lives.
    const existingHandle = await this.findExisting(labelId);
    if (existingHandle) {
      const tracked = this.byHandle.get(existingHandle);
      if (tracked) {
        await this.attachRepoIfNeeded(id, tracked, opts, store);
        await this.startDevServer(tracked, opts);
        return this.toSandbox(tracked);
      }
      const recovered = await this.recoverSandbox(id, existingHandle, opts);
      if (recovered) {
        this.byHandle.set(existingHandle, recovered);
        await this.persist(id, recovered, store);
        await this.attachRepoIfNeeded(id, recovered, opts, store);
        await this.startDevServer(recovered, opts);
        return this.toSandbox(recovered);
      }
      await this.stopContainer(existingHandle);
    }

    // 3. Fresh provision; persist AFTER clone so pollers only see a populated workdir.
    const rec = await this.provision(id, labelId, opts);
    this.byHandle.set(rec.handle, rec);
    try {
      await this.attachRepoIfNeeded(id, rec, opts, store);
    } catch (err) {
      this.byHandle.delete(rec.handle);
      await this.stopContainer(rec.handle).catch((stopErr) => {
        const attachMsg = err instanceof Error ? err.message : String(err);
        const stopMsg =
          stopErr instanceof Error ? stopErr.message : String(stopErr);
        console.warn(
          `[DockerSandboxRunner] orphaned container after attach failure handle=${rec.handle} attachErr="${attachMsg}" stopErr="${stopMsg}"`,
        );
      });
      throw err;
    }
    await this.persist(id, rec, store);
    await this.startDevServer(rec, opts);
    return this.toSandbox(rec);
  }

  private toSandbox(rec: DockerRecord): Sandbox {
    return {
      handle: rec.handle,
      workdir: rec.workdir,
      // Docker's preview URL is derived purely from the handle via local
      // ingress — the dev server may boot from workload hint OR from the
      // daemon auto-sniffing package.json/deno.json, so gating on
      // `rec.workload` (which is only set when the caller passed metadata
      // hints) would nullify the URL for repos where detection happens on
      // the daemon side. Matches Freestyle's unconditional URL.
      previewUrl: this.composePreviewUrl(rec.handle),
    };
  }

  /** No-op if no repo or already attached. Mutates `rec.repoAttached` and persists. */
  private async attachRepoIfNeeded(
    id: SandboxId,
    rec: DockerRecord,
    opts: EnsureOptions,
    store: RunnerStateStoreOps | null,
  ): Promise<void> {
    if (!opts.repo || rec.repoAttached) return;
    await bootstrapRepo(rec.daemonUrl, rec.token, rec.workdir, opts.repo);
    rec.repoAttached = true;
    await this.persist(id, rec, store);
  }

  /**
   * Fire-and-forget `/dev/start` (idempotent on daemon); VM_START returns fast.
   * Fires unconditionally — when no workload hint is available the daemon
   * sniffs runtime/script from the workdir (package.json / deno.json) and
   * picks `dev` or `start`. "No script found" surfaces as phase=crashed on
   * the daemon rather than a silent no-op here.
   */
  private async startDevServer(
    rec: DockerRecord,
    opts: EnsureOptions,
  ): Promise<void> {
    const workload = opts.workload ?? rec.workload;
    const body = workload
      ? JSON.stringify({ runtime: workload.runtime })
      : "{}";
    proxyDaemonRequestClient(rec.daemonUrl, rec.token, "/_daemon/dev/start", {
      method: "POST",
      headers: new Headers({ "content-type": "application/json" }),
      body,
      signal: AbortSignal.timeout(30_000),
    }).catch((err) => {
      const isAbort = err instanceof Error && err.name === "AbortError";
      const detail = isAbort
        ? "timed out after 30s"
        : err instanceof Error
          ? err.message
          : String(err);
      console.error(
        `[DockerSandboxRunner] /dev/start failed for ${rec.handle}: ${detail}`,
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

    // Shared singleton: if the CLI already kicked off a background build,
    // this awaits that same promise instead of starting a second one.
    await ensureSandboxImage({ image, exec: this.exec_ });

    // Hardening: drop all caps (daemon + dev server don't need any), block
    // privilege escalation, cap processes/memory/cpu so a runaway user
    // script can't DoS the host. Read-only root FS removes most write-based
    // pivots; /tmp is a bounded tmpfs; /app and /home/sandbox are anonymous
    // volumes (disk-backed, not RAM) so package-manager caches and install
    // artefacts don't blow the 2g memory cap. --rm cleans up the anonymous
    // volumes when the container exits.
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
   * Resolution: (1) `previewUrlPattern` option; (2) `SANDBOX_ROOT_URL` env
   * (substitute `{handle}` or hostname-prefix); (3) local-ingress default.
   * Env read at call time — deploys rewrite without a rebuild.
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
      // Invalid URL — fall back to local-ingress shape.
      const ingressPort = Number(process.env.SANDBOX_INGRESS_PORT ?? 7070);
      return `http://${handle}.sandboxes.localhost:${ingressPort}/`;
    }
  }

  /** Memory cache → state store. Fallback matters after mesh restart (empty byHandle). */
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

  /** Rehydrate from state-store; re-reads ephemeral ports since mesh memory may be stale. */
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
      await this.stopContainer(handle).catch((stopErr) =>
        console.warn(
          `[DockerSandboxRunner] cleanup stop after waitForDaemonReady failure (${handle}) itself failed:`,
          stopErr instanceof Error ? stopErr.message : String(stopErr),
        ),
      );
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
    // Recovered via inspect; repoAttached unknown → leave false (next ensure re-stamps).
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
        // Container exited before daemon bound the port — fail fast with diagnostics.
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

  private async persist(
    id: SandboxId,
    rec: DockerRecord,
    store: RunnerStateStoreOps | null,
  ): Promise<void> {
    if (!store) return;
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
    await store.put(id, RUNNER_KIND, { handle: rec.handle, state });
  }
}

function hashId(id: SandboxId): string {
  return createHash("sha256")
    .update(sandboxIdKey(id))
    .digest("hex")
    .slice(0, 16);
}
