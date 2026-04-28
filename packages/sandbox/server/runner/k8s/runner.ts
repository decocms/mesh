/**
 * Kubernetes sandbox runner.
 *
 * Provisions one SandboxClaim per (user, projectRef) against the
 * kubernetes-sigs/agent-sandbox operator. Mesh runs outside the cluster
 * (Stage 1 / local-dev via kind), so traffic reaches the pod via a single
 * lazily-opened 127.0.0.1 TCP listener that tunnels each inbound connection
 * to the daemon container port through the apiserver as a fresh WebSocket.
 *
 * The daemon owns the public surface: it serves `/_decopilot_vm/*` + `/health`
 * in-process and reverse-proxies everything else to in-pod localhost:DEV_PORT
 * (CSP/X-Frame stripping + HMR bootstrap injection live in that proxy). One
 * port-forward per pod is therefore enough; opening a second forwarder for
 * the dev port would bypass the daemon and break SSE + iframe embedding.
 *
 * Stage 3 replaces the port-forward path with real ingress: when
 * `previewUrlPattern` is set, no forwarder is opened for preview traffic and
 * the preview URL is synthesized from the handle.
 *
 * Token model: each claim carries a freshly-generated DAEMON_TOKEN injected
 * via `SandboxClaim.spec.env`. One leak compromises one sandbox.
 * `valueFrom.secretKeyRef` isn't supported on SandboxClaim env; RBAC on
 * the namespace is the secrecy boundary.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import * as net from "node:net";
import { PassThrough } from "node:stream";
import {
  type KubeConfig,
  KubeConfig as KubeConfigClass,
  PortForward,
} from "@kubernetes/client-node";
import {
  daemonBash,
  probeDaemonHealth,
  proxyDaemonRequest,
  waitForDaemonReady,
} from "../../daemon-client";
import {
  Inflight,
  applyPreviewPattern,
  hashSandboxId,
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
import {
  createSandboxClaim,
  deleteSandboxClaim,
  getSandboxClaim,
  patchSandboxClaimShutdown,
  waitForSandboxReady,
  type SandboxClaim,
  type SandboxResource,
} from "./client";
import { K8S_CONSTANTS } from "./constants";

const RUNNER_KIND = "kubernetes" as const;
const LOG_LABEL = "KubernetesSandboxRunner";

// Shared-namespace topology for MVP; tenancy enforced by unguessable claim
// names (sha256(userId:projectRef)). Per-org namespaces are deferred.
const DEFAULT_NAMESPACE = "agent-sandbox-system";
const DEFAULT_TEMPLATE_NAME = "mesh-sandbox";

const DAEMON_CONTAINER_PORT = 9000;
// In-pod port the daemon's reverse proxy targets. Mesh never connects here
// directly — everything funnels through the daemon container port — but the
// value is propagated to the daemon via DEV_PORT so it knows where the dev
// server will bind.
const DEFAULT_DEV_PORT = 3000;
const DEFAULT_WORKDIR = "/app";

// 32 bytes matches Docker's generation so audit logs don't vary by runner.
const DAEMON_TOKEN_BYTES = 32;

// Default idle-reap TTL: 15 min from each ensure() hit. Every code-initiated
// request flows through ensure() (or touches a record via getRecord, which
// bumps the TTL on the K8s side), so an active sandbox pushes this forward;
// abandoned sandboxes roll off at T+15m via the operator.
const DEFAULT_IDLE_TTL_MS = 15 * 60 * 1000;

/** Handle prefix + 16-hex hash = 24 chars, well under K8s's 63-char label cap. */
const HANDLE_PREFIX = "mesh-sb-";
const HANDLE_HASH_LEN = 16;

// Deterministic local-port range for port-forward listeners. Same
// (handle, containerPort) pair → same host port across mesh restarts, so
// `previewUrl` cached in the thread's vmMap stays valid when the mesh
// process recycles. Birthday-collision probability stays <1% up to ~140
// concurrent forwarders. EADDRINUSE walks the range forward until bind.
const PORT_RANGE_START = 40000;
const PORT_RANGE_SIZE = 10000;
const PORT_WALK_LIMIT = 256;

// Structural type for the WebSocket returned by PortForward.portForward — we
// only need close/on to manage lifecycle; a direct `isomorphic-ws` dep for
// one type isn't worth it.
interface ForwardWebSocket {
  close: () => void;
  on: (event: "close" | "error", handler: () => void) => void;
}

interface PortForwarder {
  server: net.Server;
  localPort: number;
}

interface K8sRecord {
  id: SandboxId;
  handle: string;
  podName: string;
  token: string;
  workdir: string;
  daemonUrl: string;
  daemonForward: PortForwarder;
  workload: Workload | null;
  /**
   * Per-boot UUID the daemon reports on /health. Generated mesh-side and
   * injected via env; re-read from /health on rehydrate so we pick up
   * pod restarts (the daemon's orchestrator handles resume-on-restart
   * itself, this is purely informational on the mesh side).
   */
  daemonBootId: string;
}

interface PersistedK8sState {
  podName: string;
  token: string;
  workdir: string;
  workload?: Workload | null;
  daemonBootId?: string;
  [k: string]: unknown;
}

export interface KubernetesRunnerOptions {
  stateStore?: RunnerStateStore;
  previewUrlPattern?: string;
  /** Defaults to `new KubeConfig().loadFromDefault()`. Tests pass a stub. */
  kubeConfig?: KubeConfig;
  /** Shared namespace for both SandboxTemplate and SandboxClaims. */
  namespace?: string;
  /** SandboxTemplate all claims reference. */
  sandboxTemplateName?: string;
  /**
   * Deterministic DAEMON_TOKEN override — tests inject a fixed value so
   * recorded fetch payloads are stable. Prod leaves this undefined.
   */
  tokenGenerator?: () => string;
  /**
   * Idle-reap window (ms). Every `ensure()` hit pushes the claim's
   * `spec.lifecycle.shutdownTime` to `now + idleTtlMs`; the operator
   * deletes claim + pod when the wall clock passes that.
   */
  idleTtlMs?: number;
}

export class KubernetesSandboxRunner implements SandboxRunner {
  readonly kind = RUNNER_KIND;

  private readonly records = new Map<string, K8sRecord>();
  private readonly inflight = new Inflight<string, Sandbox>();
  private readonly stateStore: RunnerStateStore | null;
  private readonly previewUrlPattern: string | null;
  private readonly kubeConfig: KubeConfig;
  private readonly portForward: PortForward;
  private readonly namespace: string;
  private readonly sandboxTemplateName: string;
  private readonly tokenGenerator: () => string;
  private readonly idleTtlMs: number;

  constructor(opts: KubernetesRunnerOptions = {}) {
    this.stateStore = opts.stateStore ?? null;
    this.previewUrlPattern = opts.previewUrlPattern ?? null;
    this.kubeConfig = opts.kubeConfig ?? loadDefaultKubeConfig();
    this.portForward = new PortForward(this.kubeConfig);
    this.namespace = opts.namespace ?? DEFAULT_NAMESPACE;
    this.sandboxTemplateName =
      opts.sandboxTemplateName ?? DEFAULT_TEMPLATE_NAME;
    this.tokenGenerator =
      opts.tokenGenerator ??
      (() => randomBytes(DAEMON_TOKEN_BYTES).toString("hex"));
    this.idleTtlMs = opts.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
  }

  // ---- SandboxRunner surface ------------------------------------------------

  async ensure(id: SandboxId, opts: EnsureOptions = {}): Promise<Sandbox> {
    const handle = this.computeHandle(id);
    return this.inflight.run(handle, () =>
      withSandboxLock(this.stateStore, id, RUNNER_KIND, (ops) =>
        this.ensureLocked(id, handle, opts, ops),
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
    if (rec) this.closeForwarder(rec.daemonForward);
    await deleteSandboxClaim(this.kubeConfig, this.namespace, handle);
    if (this.stateStore) {
      if (rec) await this.stateStore.delete(rec.id, RUNNER_KIND);
      else await this.stateStore.deleteByHandle(RUNNER_KIND, handle);
    }
  }

  async alive(handle: string): Promise<boolean> {
    const claim = await getSandboxClaim(
      this.kubeConfig,
      this.namespace,
      handle,
    ).catch(() => undefined);
    return claim ? isSandboxReady(claim) : false;
  }

  async getPreviewUrl(handle: string): Promise<string | null> {
    const rec = await this.getRecord(handle);
    if (!rec) return null;
    return this.composePreviewUrl(rec);
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

  // ---- Ensure flow ----------------------------------------------------------

  private async ensureLocked(
    id: SandboxId,
    handle: string,
    opts: EnsureOptions,
    ops: RunnerStateStoreOps | null,
  ): Promise<Sandbox> {
    if (opts.image) {
      console.warn(
        `[${LOG_LABEL}] opts.image ignored (template ${this.sandboxTemplateName} pins image): got ${opts.image}`,
      );
    }
    if (opts.env && Object.keys(opts.env).length > 0) {
      console.warn(
        `[${LOG_LABEL}] opts.env ignored (template holds non-token env; DAEMON_TOKEN is injected per-claim): keys=${Object.keys(opts.env).join(",")}`,
      );
    }

    // 1. State-store resume.
    if (ops) {
      const persisted = await ops.get(id, RUNNER_KIND);
      if (persisted) {
        const rec = await this.rehydrate(id, handle, persisted);
        if (rec)
          return this.finish(
            rec,
            ops,
            /* persistNow */ false,
            /* patchTtl */ true,
          );
        await ops.delete(id, RUNNER_KIND);
      }
    }
    // 2. Cluster-side adopt: state store empty but a claim with our
    //    deterministic name already exists.
    const existing = await getSandboxClaim(
      this.kubeConfig,
      this.namespace,
      handle,
    ).catch(() => undefined);
    if (existing) {
      const adopted = await this.adopt(id, handle, existing).catch((err) => {
        console.warn(
          `[${LOG_LABEL}] adopt ${handle} failed, recreating: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });
      if (adopted)
        return this.finish(
          adopted,
          ops,
          /* persistNow */ true,
          /* patchTtl */ true,
        );
      await deleteSandboxClaim(this.kubeConfig, this.namespace, handle).catch(
        () => {},
      );
    }
    // 3. Fresh provision.
    const fresh = await this.provision(id, handle, opts);
    return this.finish(fresh, ops, /* persistNow */ true, /* patchTtl */ false);
  }

  private async finish(
    rec: K8sRecord,
    ops: RunnerStateStoreOps | null,
    persistNow: boolean,
    patchTtl: boolean,
  ): Promise<Sandbox> {
    this.records.set(rec.handle, rec);
    if (persistNow) await this.persist(ops, rec);
    // Fresh provision set a shutdownTime in the claim spec already; resumes
    // and adopts rely on this patch to stay alive.
    if (patchTtl) {
      await patchSandboxClaimShutdown(
        this.kubeConfig,
        this.namespace,
        rec.handle,
        this.computeShutdownTime(),
      ).catch((err) =>
        console.warn(
          `[${LOG_LABEL}] TTL refresh failed for ${rec.handle}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
    return this.toSandbox(rec);
  }

  private async provision(
    id: SandboxId,
    handle: string,
    opts: EnsureOptions,
  ): Promise<K8sRecord> {
    const token = this.tokenGenerator();
    const daemonBootId = randomUUID();
    const workdir = DEFAULT_WORKDIR;
    const devContainerPort = opts.workload?.devPort ?? DEFAULT_DEV_PORT;
    const runtime = opts.workload?.runtime ?? "node";
    const packageManager = opts.workload?.packageManager ?? null;
    const repo = opts.repo ?? null;
    const repoLabel = repo
      ? (repo.displayName ?? deriveRepoLabel(repo.cloneUrl))
      : null;

    // Full env contract — daemon's orchestrator owns clone + install +
    // dev-server start; no external bootstrap call needed. Mirrors the
    // docker runner's env contract; reader is `packages/sandbox/daemon/config.ts`.
    const envMap: Record<string, string> = {
      DAEMON_TOKEN: token,
      DAEMON_BOOT_ID: daemonBootId,
      APP_ROOT: workdir,
      PROXY_PORT: String(DAEMON_CONTAINER_PORT),
      DEV_PORT: String(devContainerPort),
      RUNTIME: runtime,
      ...(repo
        ? {
            CLONE_URL: repo.cloneUrl,
            REPO_NAME: repoLabel ?? "",
            BRANCH: repo.branch ?? "",
            GIT_USER_NAME: repo.userName,
            GIT_USER_EMAIL: repo.userEmail,
          }
        : {}),
      ...(packageManager ? { PACKAGE_MANAGER: packageManager } : {}),
    };

    const claim: SandboxClaim = {
      apiVersion: `${K8S_CONSTANTS.CLAIM_API_GROUP}/${K8S_CONSTANTS.CLAIM_API_VERSION}`,
      kind: "SandboxClaim",
      metadata: {
        name: handle,
        namespace: this.namespace,
        labels: {
          "app.kubernetes.io/name": "mesh-sandbox",
          "app.kubernetes.io/managed-by": "mesh",
        },
      },
      spec: {
        sandboxTemplateRef: { name: this.sandboxTemplateName },
        // `valueFrom.secretKeyRef` isn't supported on SandboxClaim env; RBAC
        // on the namespace is the secrecy boundary. Warm-pool off because the
        // operator rejects custom env on warm-pooled claims.
        env: Object.entries(envMap).map(([name, value]) => ({ name, value })),
        warmpool: "none",
        lifecycle: {
          shutdownPolicy: "Delete",
          shutdownTime: this.computeShutdownTime(),
        },
      },
    };

    await createSandboxClaim(this.kubeConfig, this.namespace, claim);
    const { podName } = await waitForSandboxReady(
      this.kubeConfig,
      this.namespace,
      handle,
    );

    const daemonForward = await this.openForwarder(
      podName,
      DAEMON_CONTAINER_PORT,
      handle,
    );
    const daemonUrl = `http://127.0.0.1:${daemonForward.localPort}`;
    try {
      await waitForDaemonReady(daemonUrl);
    } catch (err) {
      this.closeForwarder(daemonForward);
      await deleteSandboxClaim(this.kubeConfig, this.namespace, handle).catch(
        () => {},
      );
      throw err;
    }

    return {
      id,
      handle,
      podName,
      token,
      workdir,
      daemonUrl,
      daemonForward,
      workload: opts.workload ?? null,
      daemonBootId,
    };
  }

  /**
   * Reconstruct a record from persisted state. After this returns, the record
   * is ready for any of the six methods — the daemon port-forward is open and
   * its `/health` has been re-probed. Returns null on any mismatch; caller
   * purges and falls through to adopt/provision.
   */
  private async rehydrate(
    id: SandboxId,
    handle: string,
    persisted: { handle: string; state: Record<string, unknown> },
  ): Promise<K8sRecord | null> {
    const state = persisted.state as Partial<PersistedK8sState>;
    if (!state.podName || !state.token) return null;

    const claim = await getSandboxClaim(
      this.kubeConfig,
      this.namespace,
      handle,
    ).catch(() => undefined);
    if (!claim || !isSandboxReady(claim)) return null;

    // Pod name may have changed (operator recreated the pod). Trust the claim
    // annotation over the persisted value.
    const currentPodName = readPodName(claim) ?? state.podName;

    const daemonForward = await this.openForwarder(
      currentPodName,
      DAEMON_CONTAINER_PORT,
      handle,
    ).catch(() => null);
    if (!daemonForward) return null;
    const daemonUrl = `http://127.0.0.1:${daemonForward.localPort}`;

    // probeDaemonHealth returns null when /health is unreachable OR lacks a
    // bootId (older daemon shape). Either way, purge + re-provision.
    const health = await probeDaemonHealth(daemonUrl);
    if (!health) {
      this.closeForwarder(daemonForward);
      return null;
    }

    // Pod bounced but the daemon's orchestrator handles re-bootstrap itself
    // on boot (resume-on-restart). Just refresh our copy of bootId.
    if (state.daemonBootId && state.daemonBootId !== health.bootId) {
      console.warn(
        `[${LOG_LABEL}] daemon restart detected (handle=${handle}): stored bootId=${state.daemonBootId} live bootId=${health.bootId}`,
      );
    }

    return {
      id,
      handle,
      podName: currentPodName,
      token: state.token,
      workdir: state.workdir ?? DEFAULT_WORKDIR,
      daemonUrl,
      daemonForward,
      workload: state.workload ?? null,
      daemonBootId: health.bootId,
    };
  }

  private async adopt(
    id: SandboxId,
    handle: string,
    claim: SandboxResource,
  ): Promise<K8sRecord | null> {
    if (!isSandboxReady(claim)) return null;
    const podName = readPodName(claim);
    if (!podName) return null;
    const token = readClaimDaemonToken(claim);
    if (!token) return null;

    const daemonForward = await this.openForwarder(
      podName,
      DAEMON_CONTAINER_PORT,
      handle,
    );
    const daemonUrl = `http://127.0.0.1:${daemonForward.localPort}`;
    const health = await probeDaemonHealth(daemonUrl);
    if (!health) {
      this.closeForwarder(daemonForward);
      return null;
    }

    return {
      id,
      handle,
      podName,
      token,
      workdir: DEFAULT_WORKDIR,
      daemonUrl,
      daemonForward,
      workload: null,
      daemonBootId: health.bootId,
    };
  }

  // ---- Handle resolution (post-restart) -------------------------------------

  private async getRecord(handle: string): Promise<K8sRecord | null> {
    const cached = this.records.get(handle);
    if (cached) return cached;
    if (!this.stateStore) return null;
    const persisted = await this.stateStore.getByHandle(RUNNER_KIND, handle);
    if (!persisted) return null;
    const rec = await this.rehydrate(persisted.id, handle, persisted);
    if (rec) this.records.set(handle, rec);
    return rec;
  }

  private async requireRecord(handle: string): Promise<K8sRecord> {
    const rec = await this.getRecord(handle);
    if (!rec) throw new Error(`unknown sandbox handle ${handle}`);
    return rec;
  }

  // ---- Identity + preview URL ----------------------------------------------

  private computeHandle(id: SandboxId): string {
    return `${HANDLE_PREFIX}${hashSandboxId(id, HANDLE_HASH_LEN)}`;
  }

  // Local mode: route preview traffic through the daemon port-forward, not
  // a separate dev forwarder. The daemon serves /_decopilot_vm/* + /health
  // in-process and reverse-proxies everything else to in-pod localhost:DEV_PORT
  // (with CSP/X-Frame stripping + HMR bootstrap injection). Pointing the URL
  // straight at the dev port would bypass that proxy and break SSE + iframe
  // embedding. Production mode (previewUrlPattern set) goes through the
  // ingress-terminated URL the operator emits.
  private composePreviewUrl(rec: K8sRecord): string {
    if (this.previewUrlPattern) {
      return applyPreviewPattern(this.previewUrlPattern, rec.handle);
    }
    return `http://127.0.0.1:${rec.daemonForward.localPort}/`;
  }

  private toSandbox(rec: K8sRecord): Sandbox {
    return {
      handle: rec.handle,
      workdir: rec.workdir,
      previewUrl: this.composePreviewUrl(rec),
    };
  }

  // ---- Persistence ----------------------------------------------------------

  private async persist(
    ops: RunnerStateStoreOps | null,
    rec: K8sRecord,
  ): Promise<void> {
    if (!ops) return;
    const state: PersistedK8sState = {
      podName: rec.podName,
      token: rec.token,
      workdir: rec.workdir,
      workload: rec.workload,
      daemonBootId: rec.daemonBootId,
    };
    await ops.put(rec.id, RUNNER_KIND, { handle: rec.handle, state });
  }

  // ---- TTL helpers ----------------------------------------------------------

  private computeShutdownTime(): string {
    return new Date(Date.now() + this.idleTtlMs).toISOString();
  }

  // ---- Port-forwarding ------------------------------------------------------

  /**
   * Opens a 127.0.0.1 TCP listener whose connections tunnel to
   * `podName:containerPort` via the apiserver. Each TCP connection spawns a
   * fresh WebSocket — matches `kubectl port-forward`'s semantics. Lifecycle
   * is mutual: client socket close → close the k8s WS; WS close → destroy
   * the client socket.
   */
  private openForwarder(
    podName: string,
    containerPort: number,
    // `handle` is passed separately so the deterministic port survives pod
    // recreation (operator-driven): vmMap's cached previewUrl stays valid.
    handle: string = podName,
  ): Promise<PortForwarder> {
    const startPort = deterministicLocalPort(handle, containerPort);
    return new Promise((resolve, reject) => {
      const tryBind = (port: number, attempt: number) => {
        const server = net.createServer((socket) =>
          this.handleForwardedConnection(socket, podName, containerPort),
        );
        server.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE" && attempt < PORT_WALK_LIMIT) {
            const next =
              PORT_RANGE_START +
              ((port - PORT_RANGE_START + 1) % PORT_RANGE_SIZE);
            tryBind(next, attempt + 1);
            return;
          }
          reject(err);
        });
        server.listen(port, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address === "string") {
            server.close();
            reject(new Error("port-forward listener failed to bind"));
            return;
          }
          resolve({ server, localPort: address.port });
        });
      };
      tryBind(startPort, 0);
    });
  }

  private handleForwardedConnection(
    socket: net.Socket,
    podName: string,
    containerPort: number,
  ): void {
    // Inbound bytes pipe through a PassThrough rather than the socket
    // directly: `portForward` attaches its 'data' listener only after the
    // WebSocket opens (async); on Bun, bytes arriving in that window are
    // dropped. Piping synchronously into a PassThrough buffers those bytes
    // until the library drains it.
    const inbound = new PassThrough();
    let ws: ForwardWebSocket | null = null;
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      inbound.destroy();
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
      if (!socket.destroyed) socket.destroy();
    };

    socket.pipe(inbound);
    socket.on("error", cleanup);
    socket.on("close", cleanup);

    this.portForward
      .portForward(
        this.namespace,
        podName,
        [containerPort],
        socket,
        null,
        inbound,
      )
      .then((res) => {
        // retryCount=0 (default) → raw WebSocket; retryCount>0 → factory fn.
        const opened = typeof res === "function" ? res() : res;
        if (!opened) {
          cleanup();
          return;
        }
        ws = opened as ForwardWebSocket;
        ws.on("close", cleanup);
        ws.on("error", cleanup);
        if (closed) {
          try {
            ws.close();
          } catch {}
        }
      })
      .catch((err: unknown) => {
        console.warn(
          `[${LOG_LABEL}] port-forward to ${podName}:${containerPort} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        cleanup();
      });
  }

  private closeForwarder(forwarder: PortForwarder): void {
    forwarder.server.close((err) => {
      if (err) {
        console.warn(
          `[${LOG_LABEL}] port-forward close on :${forwarder.localPort} errored: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }
}

// ---- Helpers ----------------------------------------------------------------

function loadDefaultKubeConfig(): KubeConfig {
  const kc = new KubeConfigClass();
  kc.loadFromDefault();
  return kc;
}

function isSandboxReady(resource: SandboxResource): boolean {
  return Boolean(
    resource.status?.conditions?.some(
      (c) => c.type === "Ready" && c.status === "True",
    ),
  );
}

function readClaimDaemonToken(claim: SandboxResource): string | null {
  const env = claim.spec?.env;
  if (!env) return null;
  for (const entry of env) {
    if (entry.name === "DAEMON_TOKEN" && entry.value) return entry.value;
  }
  return null;
}

function readPodName(resource: SandboxResource): string | null {
  return (
    resource.metadata?.annotations?.[K8S_CONSTANTS.POD_NAME_ANNOTATION] ??
    resource.metadata?.name ??
    null
  );
}

function deterministicLocalPort(handle: string, containerPort: number): number {
  const hash = createHash("sha256")
    .update(`${handle}:${containerPort}`)
    .digest();
  return PORT_RANGE_START + (hash.readUInt32BE(0) % PORT_RANGE_SIZE);
}

/** Fallback for when callers don't provide `repo.displayName`. */
function deriveRepoLabel(cloneUrl: string): string {
  try {
    const u = new URL(cloneUrl);
    const trimmed = u.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    return trimmed || u.hostname;
  } catch {
    return cloneUrl;
  }
}
