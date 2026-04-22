import { createHash, randomBytes } from "node:crypto";
import * as net from "node:net";
import { DAEMON_PORT, DEFAULT_IMAGE, sleep } from "../../shared";
import {
  bootstrapRepo,
  daemonBash,
  probeDaemonHealth,
  proxyDaemonRequest as proxyDaemonRequestClient,
  waitForDaemonReady,
} from "./daemon-client";
import { dockerExec, type DockerResult } from "../docker-cli";
import { DEFAULT_WORKDIR, startContainer } from "../docker-helpers";
import type { RunnerStateStore } from "./state-store";
import type {
  EnsureOptions,
  ExecInput,
  ExecOutput,
  Mount,
  Sandbox,
  SandboxId,
  SandboxRunner,
} from "./types";
import { sandboxIdKey } from "./types";

const RUNNER_KIND = "docker";
const LABEL_ROOT = "mesh-sandbox";
const LABEL_ID = "mesh-sandbox.id";
const PORT_READBACK_ATTEMPTS = 15;
const PORT_READBACK_INTERVAL_MS = 200;

/**
 * Dev convenience: bind-mount the host's daemon source over the image's
 * baked copy and run it under `node --watch`, so edits to `image/daemon.mjs`
 * or `image/daemon/*.mjs` hot-restart the daemon inside the container. Set
 * to the absolute path of `packages/mesh-plugin-user-sandbox/image`.
 * Unset in prod → `docker run` args are unchanged.
 */
const DEV_DAEMON_DIR = process.env.MESH_SANDBOX_DEV_DAEMON_DIR;

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
}

/**
 * How the container reaches services on the host.
 *  - `"add-host"`: preferred; adds `host.docker.internal` to the container.
 *  - `"network-host"`: opt-in fallback (`--network=host`), enabled only when
 *    MESH_SANDBOX_ALLOW_HOST_NETWORK=1. See getHostAccessMode() for why
 *    that requires explicit opt-in.
 */
type HostAccessMode = "add-host" | "network-host";

const ALLOW_HOST_NETWORK = process.env.MESH_SANDBOX_ALLOW_HOST_NETWORK === "1";

// DNS label cap is 63 chars (RFC 1035), so the full 64-hex Docker container id
// can't be used as a subdomain. Slice to 32 hex (128 bits) at every Docker→runner
// boundary — still cryptographically secret as a capability, and Docker accepts
// any prefix ≥12 chars for inspect/stop/port, so no downstream lookups break.
const HANDLE_LEN = 32;
const toHandle = (rawId: string): string => rawId.slice(0, HANDLE_LEN);

const DEV_PORT = 3000;

/** Private per-handle record. Never escapes the runner. */
interface DockerRecord {
  handle: string;
  daemonUrl: string;
  token: string;
  workdir: string;
  id: SandboxId;
  /** Host-side port mapped to container :3000 (user's dev server). */
  devPort: number;
  /** Host-side port mapped to container :9000 (daemon). */
  daemonPort: number;
  /**
   * True once we've attempted a repo bootstrap in this container. Covers both
   * successful clones and skipped-because-workdir-was-not-empty outcomes —
   * either way, we don't want to retry on the next ensure() call.
   */
  repoAttached: boolean;
  /**
   * Named volumes created for this sandbox (from `opts.mounts` where
   * `kind === "volume"`). Removed by `delete` and `sweepOrphans` so volume
   * lifetime tracks the sandbox.
   */
  ownedVolumes: string[];
  /**
   * True when the container runs with `--network=host` (see HostAccessMode).
   * In that mode `daemonUrl` holds the authoritative host port — readPort()
   * must not be called because there's no `-p` mapping to inspect.
   */
  networkHost: boolean;
}

interface PersistedDockerState {
  token: string;
  workdir: string;
  daemonUrl: string;
  devPort?: number;
  daemonPort?: number;
  repoAttached?: boolean;
  ownedVolumes?: string[];
  networkHost?: boolean;
  [k: string]: unknown;
}

export class DockerSandboxRunner implements SandboxRunner {
  private readonly image: string;
  private readonly exec_: DockerExec;
  private readonly labelPrefix: string;
  private readonly stateStore: RunnerStateStore | null;
  private readonly byHandle = new Map<string, DockerRecord>();
  private readonly inflight = new Map<string, Promise<Sandbox>>();
  /**
   * Cached result of the host-gateway capability probe. Resolved once per
   * process (per runner instance) — the underlying docker runtime doesn't
   * change under us, so repeat probes would just burn latency.
   */
  private hostAccessModePromise: Promise<HostAccessMode> | null = null;

  constructor(opts: DockerRunnerOptions = {}) {
    this.image = opts.image ?? process.env.MESH_SANDBOX_IMAGE ?? DEFAULT_IMAGE;
    this.exec_ = opts.exec ?? dockerExec;
    this.labelPrefix = opts.labelPrefix ?? LABEL_ROOT;
    this.stateStore = opts.stateStore ?? null;
  }

  /**
   * Expose the cached host-access probe so callers can match their own
   * URL-rewrite / port-binding assumptions to the same answer the runner
   * used when provisioning. Triggers the probe if it hasn't run yet.
   */
  async resolveHostAccessMode(): Promise<"add-host" | "network-host"> {
    return this.getHostAccessMode();
  }

  /**
   * Probe whether `--add-host=host.docker.internal:host-gateway` resolves
   * inside a fresh container. Works on Docker Desktop (mac/Windows) and modern
   * Linux Docker; fails on podman and older Linux Docker where host-gateway
   * isn't a recognized keyword.
   *
   * When the probe fails, the only alternative is `--network=host`, which is
   * unsafe in multi-tenant setups (see HostAccessMode). We therefore require
   * `MESH_SANDBOX_ALLOW_HOST_NETWORK=1` before returning `"network-host"`,
   * and throw otherwise so the operator has to make an explicit decision.
   *
   * Result cached for the life of this runner.
   */
  private getHostAccessMode(): Promise<HostAccessMode> {
    if (this.hostAccessModePromise) return this.hostAccessModePromise;
    this.hostAccessModePromise = (async () => {
      const probe = await this.exec_([
        "run",
        "--rm",
        "--add-host=host.docker.internal:host-gateway",
        this.image,
        "getent",
        "hosts",
        "host.docker.internal",
      ]);
      const ok = probe.code === 0 && /\S/.test(probe.stdout);
      if (ok) {
        console.log("[mesh-sandbox] host access mode: add-host");
        return "add-host";
      }
      if (!ALLOW_HOST_NETWORK) {
        throw new Error(
          "[mesh-sandbox] `--add-host=host.docker.internal:host-gateway` is " +
            "not supported by this docker runtime, and the only fallback " +
            "(`--network=host`) is unsafe in multi-tenant setups because " +
            "user code inside the container can reach host loopback services " +
            "(mesh postgres, mesh API, cloud metadata at 169.254.169.254). " +
            "Upgrade docker, or — if you're running single-tenant and " +
            "accept the trade-off — set MESH_SANDBOX_ALLOW_HOST_NETWORK=1.",
        );
      }
      console.warn(
        "[mesh-sandbox] host access mode: network-host " +
          "(MESH_SANDBOX_ALLOW_HOST_NETWORK=1; container shares host network — " +
          "do NOT enable in multi-tenant production)",
      );
      return "network-host";
    })();
    return this.hostAccessModePromise;
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
    const rec = this.byHandle.get(handle);
    if (!rec) {
      throw new Error(`unknown sandbox handle ${handle}`);
    }
    return daemonBash(rec.daemonUrl, rec.token, input);
  }

  async delete(handle: string): Promise<void> {
    const rec = await this.lookupRecord(handle);
    this.byHandle.delete(handle);
    await this.stopContainer(handle);
    if (rec?.ownedVolumes?.length) {
      await this.removeVolumes(rec.ownedVolumes);
    }
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
      // Look up any named volumes this sandbox owned BEFORE stopping, so
      // that even orphans missing from the in-memory map get their volumes
      // reaped from persisted state. stopContainer removes the container
      // (via --rm); volume removal has to be an explicit follow-up.
      const rec = await this.lookupRecord(id);
      await this.stopContainer(id);
      if (rec?.ownedVolumes?.length) {
        await this.removeVolumes(rec.ownedVolumes);
      }
      if (this.stateStore) {
        await this.stateStore.deleteByHandle(RUNNER_KIND, id).catch(() => {});
      }
    }
    return ids.length;
  }

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
          return { handle: probed.handle, workdir: probed.workdir };
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
        return { handle: tracked.handle, workdir: tracked.workdir };
      }
      const recovered = await this.recoverSandbox(id, existingHandle);
      if (recovered) {
        this.byHandle.set(existingHandle, recovered);
        await this.persist(id, recovered);
        await this.attachRepoIfNeeded(id, recovered, opts);
        return { handle: recovered.handle, workdir: recovered.workdir };
      }
      await this.stopContainer(existingHandle);
    }

    // 3. Fresh provision. attachRepoIfNeeded handles clone inline; if it fails
    //    we roll back the fresh container since it's not yet useful to anyone.
    //    Persist happens AFTER the clone so the mesh-side state store (queried
    //    by the decopilot/preview pollers) only surfaces this sandbox once the
    //    workdir is populated. Otherwise pollers hammer `/dev/start` on an
    //    empty workdir and the daemon loop-logs "cannot auto-start" until the
    //    clone finally finishes.
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
    return { handle: rec.handle, workdir: rec.workdir };
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

  private async provision(
    id: SandboxId,
    labelId: string,
    opts: EnsureOptions,
  ): Promise<DockerRecord> {
    const token = randomBytes(24).toString("hex");
    const workdir = opts.workdir ?? DEFAULT_WORKDIR;
    const image = opts.image ?? this.image;

    // Host-access resolution. Runs only when the caller asks for it — probe
    // is ~1s cold, no reason to pay the tax on plain sandboxes.
    //
    // Publish both ports on every provision:
    //   - :DAEMON_PORT (9000) → daemon control plane
    //   - :DEV_PORT    (3000) → user's dev server, reached directly
    // In `--network=host` mode both ports live on the host namespace so the
    // container-side bind already is the host-side port; there's nothing to
    // publish.
    let hostArgs: string[] = [];
    let networkArgs: string[] = [];
    let portPublishArgs: string[] = [];
    let daemonUrl: string | null = null;
    let networkHost = false;
    let daemonPort = DAEMON_PORT;
    let devPort: number | null = null;

    if (opts.addHostGateway) {
      const mode = await this.getHostAccessMode();
      if (mode === "add-host") {
        hostArgs = ["--add-host=host.docker.internal:host-gateway"];
        portPublishArgs = [
          "-p",
          `127.0.0.1:0:${DAEMON_PORT}`,
          "-p",
          `127.0.0.1:0:${DEV_PORT}`,
        ];
      } else {
        // In --network=host the `-p` flag is ignored, so we pick a free host
        // port mesh-side and have the daemon bind directly to it. The dev
        // server still binds :3000 inside the container which == host :3000
        // in this mode — single-tenant only, see HostAccessMode.
        networkArgs = ["--network=host"];
        networkHost = true;
        daemonPort = await pickFreePort();
        daemonUrl = `http://127.0.0.1:${daemonPort}`;
        devPort = DEV_PORT;
      }
    } else {
      portPublishArgs = [
        "-p",
        `127.0.0.1:0:${DAEMON_PORT}`,
        "-p",
        `127.0.0.1:0:${DEV_PORT}`,
      ];
    }

    const env: Record<string, string> = {
      DAEMON_TOKEN: token,
      DAEMON_PORT: String(daemonPort),
      WORKDIR: workdir,
      ...(opts.env ?? {}),
    };

    const mountArgs = (opts.mounts ?? []).flatMap(mountToArgs);
    const ownedVolumes = (opts.mounts ?? [])
      .filter((m) => m.kind === "volume")
      .map((m) => m.source);

    // Only the daemon port is published. Dev-server traffic goes through the
    // daemon's /proxy/:port/* endpoint, which reaches container loopback — so
    // the dev server can bind to 127.0.0.1 without a --host flag and it still
    // works.
    //
    // Dev hot-reload: when MESH_SANDBOX_DEV_DAEMON_DIR is set, the host's
    // daemon source is bind-mounted over `/opt/sandbox-daemon` and the
    // entrypoint is overridden to `node --watch`. Saving a `.mjs` on the
    // host restarts the daemon inside the container — no rebuild, no manual
    // restart, works for every image variant (base, claude, prep) because
    // the mount wins over whatever was baked.
    const devEntrypointArgs = DEV_DAEMON_DIR ? ["--entrypoint", "node"] : [];
    const devMountArgs = DEV_DAEMON_DIR
      ? ["-v", `${DEV_DAEMON_DIR}:/opt/sandbox-daemon:ro`]
      : [];
    const devCmdArgs = DEV_DAEMON_DIR
      ? ["--watch", "/opt/sandbox-daemon/daemon.mjs"]
      : [];

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
        ...devEntrypointArgs,
        ...hostArgs,
        ...networkArgs,
        ...mountArgs,
        ...devMountArgs,
        ...portPublishArgs,
        ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
      ],
      command: devCmdArgs,
    });
    const handle = toHandle(rawId);

    if (!daemonUrl) {
      const hostPort = await this.readPort(handle, DAEMON_PORT);
      daemonUrl = `http://127.0.0.1:${hostPort}`;
      daemonPort = hostPort;
    }
    if (devPort === null) {
      devPort = await this.readPort(handle, DEV_PORT);
    }
    await this.waitForReady(daemonUrl, handle);
    return {
      handle,
      daemonUrl,
      token,
      workdir,
      id,
      devPort,
      daemonPort,
      repoAttached: false,
      ownedVolumes,
      networkHost,
    };
  }

  /**
   * Remove named volumes. Best-effort: a volume still in use by another
   * container (shouldn't happen — they're per-sandbox by name — but docker
   * cares about the invariant) will error here. We swallow the error rather
   * than failing the enclosing delete/sweep, since leaving a volume behind is
   * recoverable but a throw here would abort the loop.
   */
  private async removeVolumes(names: string[]): Promise<void> {
    if (names.length === 0) return;
    await this.exec_(["volume", "rm", "-f", ...names]).catch(() => {
      /* best effort */
    });
  }

  async resolveDaemonUrl(handle: string): Promise<string | null> {
    const rec = await this.lookupRecord(handle);
    return rec?.daemonUrl ?? null;
  }

  async resolveDaemonToken(handle: string): Promise<string | null> {
    const rec = await this.lookupRecord(handle);
    return rec?.token ?? null;
  }

  /**
   * `docker cp` wrapper. Creates parent directories inside the container
   * first (docker cp itself doesn't mkdir) so callers can target deep paths.
   * Used for post-provision file injection like claude-code creds into an
   * existing preview sandbox.
   */
  async copyFileToContainer(
    handle: string,
    hostPath: string,
    containerPath: string,
  ): Promise<void> {
    const parent = containerPath.substring(0, containerPath.lastIndexOf("/"));
    if (parent && parent !== "") {
      const mkdir = await this.exec_(["exec", handle, "mkdir", "-p", parent]);
      if (mkdir.code !== 0) {
        throw new Error(
          `docker exec mkdir -p ${parent} failed (exit ${mkdir.code}): ${mkdir.stderr.trim()}`,
        );
      }
    }
    const cp = await this.exec_(["cp", hostPath, `${handle}:${containerPath}`]);
    if (cp.code !== 0) {
      throw new Error(
        `docker cp ${hostPath} → ${handle}:${containerPath} failed (exit ${cp.code}): ${cp.stderr.trim()}`,
      );
    }
  }

  /**
   * HTTP passthrough to the sandbox daemon's `/_daemon/*` control plane.
   * Caller passes the full daemon path (e.g. `/_daemon/dev/status`). The
   * bearer token never leaves this class — the caller gets back a native
   * `Response` with the body streamed from the daemon.
   */
  async proxyDaemonRequest(
    handle: string,
    path: string,
    init: {
      method: string;
      headers: Headers;
      body: BodyInit | null;
      signal?: AbortSignal;
    },
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

  /** Host-side port mapped to the sandbox's dev server (container :3000). */
  async resolveDevPort(handle: string): Promise<number | null> {
    const rec = await this.lookupRecord(handle);
    return rec?.devPort ?? null;
  }

  /** Host-side port mapped to the sandbox daemon (container :9000). */
  async resolveDaemonPort(handle: string): Promise<number | null> {
    const rec = await this.lookupRecord(handle);
    return rec?.daemonPort ?? null;
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
   * docker port mapping throws.
   *
   * In --network=host mode the persisted URL is authoritative — no `-p`
   * mapping to inspect. In add-host mode we re-read the ephemeral port
   * docker picked, since mesh may have restarted with stale memory.
   */
  private async hydratePersisted(
    id: SandboxId,
    record: { handle: string; state: Record<string, unknown> },
  ): Promise<DockerRecord | null> {
    const state = record.state as Partial<PersistedDockerState>;
    if (!state.token || !state.daemonUrl) return null;
    const networkHost = state.networkHost ?? false;
    const handle = toHandle(record.handle);
    try {
      const daemonPort = networkHost
        ? (state.daemonPort ?? parseDaemonPortFromUrl(state.daemonUrl))
        : await this.readPort(handle, DAEMON_PORT);
      const daemonUrl = networkHost
        ? state.daemonUrl
        : `http://127.0.0.1:${daemonPort}`;
      const devPort = networkHost
        ? DEV_PORT
        : await this.readPort(handle, DEV_PORT);
      return {
        handle,
        daemonUrl,
        token: state.token,
        workdir: state.workdir ?? DEFAULT_WORKDIR,
        id,
        devPort,
        daemonPort,
        repoAttached: state.repoAttached ?? false,
        ownedVolumes: state.ownedVolumes ?? [],
        networkHost,
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
  ): Promise<DockerRecord | null> {
    // One `docker inspect` covering env + NetworkMode. First output line is
    // the container's NetworkMode (`host` | `bridge` | `default` | named
    // net), remaining lines are `KEY=value` env entries.
    const r = await this.exec_([
      "inspect",
      "--format",
      "{{.HostConfig.NetworkMode}}\n{{range .Config.Env}}{{println .}}{{end}}",
      handle,
    ]);
    if (r.code !== 0) return null;
    const [networkModeLine = "", ...envLines] = r.stdout.split("\n");
    const networkHost = networkModeLine.trim() === "host";
    let token: string | null = null;
    let workdir = DEFAULT_WORKDIR;
    let daemonPort = DAEMON_PORT;
    for (const line of envLines) {
      if (line.startsWith("DAEMON_TOKEN=")) {
        token = line.slice("DAEMON_TOKEN=".length);
      } else if (line.startsWith("WORKDIR=")) {
        workdir = line.slice("WORKDIR=".length);
      } else if (line.startsWith("DAEMON_PORT=")) {
        const n = Number(line.slice("DAEMON_PORT=".length));
        if (Number.isFinite(n)) daemonPort = n;
      }
    }
    if (!token) return null;
    // In host-network mode the DAEMON_PORT env is the authoritative host
    // port — no `-p` mapping to re-read. Otherwise ask docker for the
    // ephemeral port it picked.
    const resolvedDaemonPort = networkHost
      ? daemonPort
      : await this.readPort(handle, DAEMON_PORT);
    const daemonUrl = `http://127.0.0.1:${resolvedDaemonPort}`;
    if (!(await probeDaemonHealth(daemonUrl))) return null;
    const devPort = networkHost
      ? DEV_PORT
      : await this.readPort(handle, DEV_PORT);
    // Recovered via docker inspect — state store is empty so we don't know
    // whether a repo was previously attached, nor which volumes the runner
    // owned. Leave both empty; the next ensure() will re-stamp them, and
    // volumes without a tracking record just outlive one sweep cycle.
    return {
      handle,
      daemonUrl,
      token,
      workdir,
      id,
      devPort,
      daemonPort: resolvedDaemonPort,
      repoAttached: false,
      ownedVolumes: [],
      networkHost,
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
      daemonPort: rec.daemonPort,
      repoAttached: rec.repoAttached,
      ownedVolumes: rec.ownedVolumes,
      networkHost: rec.networkHost,
    };
    await this.stateStore.put(id, RUNNER_KIND, { handle: rec.handle, state });
  }
}

function parseDaemonPortFromUrl(url: string): number {
  try {
    return Number(new URL(url).port) || DAEMON_PORT;
  } catch {
    return DAEMON_PORT;
  }
}

function mountToArgs(m: Mount): string[] {
  const suffix = m.readOnly ? ":ro" : "";
  return ["-v", `${m.source}:${m.target}${suffix}`];
}

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (typeof addr === "object" && addr && Number.isFinite(addr.port)) {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error("failed to pick a free host port"));
      }
    });
  });
}

function hashId(id: SandboxId): string {
  return createHash("sha256")
    .update(sandboxIdKey(id))
    .digest("hex")
    .slice(0, 16);
}
