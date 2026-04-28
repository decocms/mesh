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
import type {
  Counter,
  Histogram,
  Meter,
  UpDownCounter,
} from "@opentelemetry/api";
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

/**
 * Env keys mesh owns and a caller's `opts.env` MUST NOT shadow. DAEMON_TOKEN
 * is the secrecy boundary; the rest configure the daemon's bootstrap and
 * silently overriding any of them would break clone/install/dev-server start.
 */
const RESERVED_ENV_KEYS = new Set([
  "DAEMON_TOKEN",
  "DAEMON_BOOT_ID",
  "APP_ROOT",
  "PROXY_PORT",
  "DEV_PORT",
  "RUNTIME",
  "CLONE_URL",
  "REPO_NAME",
  "BRANCH",
  "GIT_USER_NAME",
  "GIT_USER_EMAIL",
  "PACKAGE_MANAGER",
]);

// Default idle-reap TTL: 15 min from each ensure() hit. Every code-initiated
// request flows through ensure() (or touches a record via getRecord, which
// bumps the TTL on the K8s side), so an active sandbox pushes this forward;
// abandoned sandboxes roll off at T+15m via the operator.
const DEFAULT_IDLE_TTL_MS = 15 * 60 * 1000;

/** Handle prefix + 16-hex hash = 24 chars, well under K8s's 63-char label cap. */
export const HANDLE_PREFIX = "mesh-sb-";
const HANDLE_HASH_LEN = 16;

/**
 * Headers stripped before re-issuing the preview proxy fetch. Hop-by-hop per
 * RFC 7230 + cookies (preview is per-handle, not per-user — no callee session
 * leak) + accept-encoding (Bun fetch auto-decompresses, so a downstream
 * content-encoding would mismatch the actual body).
 */
const PREVIEW_STRIP_REQUEST_HEADERS = [
  "cookie",
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "accept-encoding",
  "content-length",
  "upgrade",
];

/**
 * Stripped from the proxied response. content-encoding/length would mismatch
 * after Bun fetch auto-decompresses; CSP/X-Frame-Options the daemon already
 * rewrote — re-passing them defeats the iframe-embedding fix the daemon
 * installed.
 */
const PREVIEW_STRIP_RESPONSE_HEADERS = [
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
];

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

interface RunnerTenant {
  orgId: string;
  userId: string;
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
  /**
   * Tenant identity carried through for metric attribution on subsequent
   * operations (proxy, exec, delete) where the caller only has a handle.
   * Null when ensure() was called without tenant context (smoke tests,
   * adopt fallback when claim labels were absent).
   */
  tenant: RunnerTenant | null;
}

interface PersistedK8sState {
  podName: string;
  token: string;
  workdir: string;
  workload?: Workload | null;
  daemonBootId?: string;
  tenant?: RunnerTenant | null;
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
  /**
   * OpenTelemetry meter for runner-level metrics (active gauge, ensure
   * outcome counter, proxy duration histogram). Optional — when absent,
   * runner is fully functional but emits no metrics. Tests typically pass
   * undefined; mesh wires `metrics.getMeter("mesh", "1.0.0")`.
   */
  meter?: Meter;
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
  /**
   * Instruments are null when no meter was provided. All emit-paths must
   * null-check; the alternative — passing the OTel API's no-op meter — would
   * still allocate and dispatch on every call.
   */
  private readonly metrics: RunnerMetrics | null;

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
    this.metrics = opts.meter ? buildRunnerMetrics(opts.meter) : null;
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
    if (rec) {
      this.closeForwarder(rec.daemonForward);
      // Decrement only when we actually held the record — getRecord can be
      // null after restart-without-state-store, in which case the gauge
      // was never incremented for this handle in this process.
      this.metrics?.active.add(-1, tenantAttrs(rec.tenant));
    }
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
    const start = performance.now();
    let status = 0;
    try {
      const resp = await proxyDaemonRequest(
        rec.daemonUrl,
        rec.token,
        path,
        init,
      );
      status = resp.status;
      return resp;
    } finally {
      this.recordProxyDuration(
        "daemon",
        status,
        rec,
        performance.now() - start,
      );
    }
  }

  /**
   * Resolves the HTTP base URL for a sandbox's daemon. Used by the preview
   * reverse-proxy at the mesh edge.
   *
   * Two modes:
   * 1. `previewUrlPattern` set (Stage 3 / in-cluster mesh): synthesize the
   *    in-cluster Service URL straight from the handle. No record lookup, no
   *    port-forward, no health probe — the cluster DNS + downstream fetch
   *    are the source of truth. Crucially this means a cold mesh pod (or one
   *    that just restarted with an empty records map) still serves preview
   *    traffic without first having to rehydrate every claim. If the Service
   *    doesn't exist for that handle, the downstream fetch fails and the
   *    caller surfaces a 502.
   * 2. `previewUrlPattern` unset (dev / mesh-outside-cluster): fall back to
   *    the 127.0.0.1 port-forwarder opened by `getRecord`. Returns null when
   *    the record can't be found or rehydrated — the caller surfaces 404.
   *
   * Preview must always land on port 9000 (daemon) — never 3000 (dev server)
   * — because the daemon's reverse proxy strips CSP/X-Frame headers and
   * injects the HMR bootstrap script that vite needs to function inside the
   * studio iframe. Bypassing it breaks SSE + iframe embedding.
   */
  async resolvePreviewUpstreamUrl(handle: string): Promise<string | null> {
    if (this.previewUrlPattern) {
      return `http://${handle}.${this.namespace}.svc.cluster.local:${DAEMON_CONTAINER_PORT}`;
    }
    const rec = await this.getRecord(handle);
    if (!rec) return null;
    return rec.daemonUrl;
  }

  /**
   * Reverse-proxies an inbound preview HTTP request to the sandbox's daemon.
   * Unauthenticated by design — preview URLs are open the same way Vercel
   * preview URLs are; the *handle* is the secret.
   *
   * `/_decopilot_vm/*` access policy at the edge:
   *   - **GET** is allowed through. The daemon's `/events` SSE and `/scripts`
   *     are intentionally unauthenticated and CORS-enabled (`Allow-Origin: *`)
   *     because the studio UI consumes them cross-origin from the preview
   *     URL — that's the only path it has to live setup state. Stripping
   *     them here would break the studio UI's setup tab and SSE event feed.
   *   - **Non-GET** (POST/PUT/DELETE/etc) is rejected as defense-in-depth.
   *     The daemon enforces bearer auth on the mutating endpoints
   *     (read/write/edit/grep/glob/bash/exec/kill), but the only legitimate
   *     caller for those is mesh itself via the internal port-forward; the
   *     preview surface should never see them.
   */
  async proxyPreviewRequest(
    handle: string,
    request: Request,
  ): Promise<Response> {
    const start = performance.now();
    // In-memory cache only — preview is the hot path; a state-store hit per
    // request would dominate latency. Tenant attribution is best-effort: when
    // the records map is cold (mesh just restarted) the metric still records
    // duration with empty tenant attrs. cAdvisor on the pod side covers
    // bandwidth attribution authoritatively via pod labels.
    const cachedRec = this.records.get(handle) ?? null;
    let status = 0;
    try {
      const upstreamBase = await this.resolvePreviewUpstreamUrl(handle);
      if (!upstreamBase) {
        status = 404;
        return jsonResponse(404, { error: "sandbox not found" });
      }

      const reqUrl = new URL(request.url);
      const isAdminPath =
        reqUrl.pathname === "/_decopilot_vm" ||
        reqUrl.pathname.startsWith("/_decopilot_vm/");
      if (isAdminPath && request.method !== "GET") {
        status = 404;
        return jsonResponse(404, { error: "not found" });
      }

      const target = `${upstreamBase}${reqUrl.pathname}${reqUrl.search}`;
      const headers = new Headers(request.headers);
      for (const h of PREVIEW_STRIP_REQUEST_HEADERS) headers.delete(h);

      const hasBody = request.method !== "GET" && request.method !== "HEAD";
      const init: RequestInit & { duplex?: string } = {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: "manual",
        signal: request.signal,
        duplex: hasBody ? "half" : undefined,
      };

      let upstream: Response;
      try {
        upstream = await fetch(target, init as RequestInit);
      } catch (err) {
        // Truncate to host+pathname — query strings can carry secrets
        // (magic-link tokens, signed URLs) and would otherwise end up in
        // mesh stdout → kubectl logs → log aggregator.
        const safeTarget = `${upstreamBase}${reqUrl.pathname}`;
        console.warn(
          `[${LOG_LABEL}] preview fetch to ${safeTarget} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        status = 502;
        return jsonResponse(502, { error: "sandbox daemon unreachable" });
      }

      const responseHeaders = new Headers();
      for (const [k, v] of upstream.headers.entries()) {
        if (!PREVIEW_STRIP_RESPONSE_HEADERS.includes(k.toLowerCase())) {
          responseHeaders.set(k, v);
        }
      }
      status = upstream.status;
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } finally {
      this.recordProxyDuration(
        "preview",
        status,
        cachedRec,
        performance.now() - start,
        handle,
      );
    }
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
            "resume",
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
          "adopt",
        );
      await deleteSandboxClaim(this.kubeConfig, this.namespace, handle).catch(
        () => {},
      );
    }
    // 3. Fresh provision.
    const fresh = await this.provision(id, handle, opts);
    return this.finish(
      fresh,
      ops,
      /* persistNow */ true,
      /* patchTtl */ false,
      "fresh",
    );
  }

  private async finish(
    rec: K8sRecord,
    ops: RunnerStateStoreOps | null,
    persistNow: boolean,
    patchTtl: boolean,
    outcome: "fresh" | "resume" | "adopt",
  ): Promise<Sandbox> {
    const wasCached = this.records.has(rec.handle);
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
    if (this.metrics) {
      const attrs = tenantAttrs(rec.tenant);
      this.metrics.ensureOutcome.add(1, { ...attrs, outcome });
      // Only increment the active gauge on first observation to avoid
      // double-counting when the same handle is rehydrated multiple times
      // (mesh-process internal cache hit; ensureLocked is invoked again).
      if (!wasCached) this.metrics.active.add(1, attrs);
    }
    return this.toSandbox(rec);
  }

  /**
   * Compose the env block the daemon's orchestrator reads to clone, install,
   * and start the dev server. Mirrors the docker runner's contract; reader is
   * `packages/sandbox/daemon/config.ts`.
   *
   * Caller-supplied `opts.env` is layered first so the bootstrap keys defined
   * here (and listed in RESERVED_ENV_KEYS) always win — an intercepted
   * DAEMON_TOKEN would compromise the sandbox; an intercepted DEV_PORT would
   * just break the boot. We warn — not throw — to match the docker runner's
   * permissive shape.
   */
  private buildEnvMap(
    opts: EnsureOptions,
    boot: { token: string; daemonBootId: string; workdir: string },
  ): Record<string, string> {
    const callerEnv: Record<string, string> = {};
    const dropped: string[] = [];
    for (const [k, v] of Object.entries(opts.env ?? {})) {
      if (RESERVED_ENV_KEYS.has(k)) dropped.push(k);
      else callerEnv[k] = v;
    }
    if (dropped.length > 0) {
      console.warn(
        `[${LOG_LABEL}] opts.env keys overlap reserved bootstrap names and were dropped: ${dropped.join(",")}`,
      );
    }

    const repo = opts.repo;
    const repoLabel = repo
      ? (repo.displayName ?? deriveRepoLabel(repo.cloneUrl))
      : null;

    return {
      ...callerEnv,
      DAEMON_TOKEN: boot.token,
      DAEMON_BOOT_ID: boot.daemonBootId,
      APP_ROOT: boot.workdir,
      PROXY_PORT: String(DAEMON_CONTAINER_PORT),
      DEV_PORT: String(opts.workload?.devPort ?? DEFAULT_DEV_PORT),
      RUNTIME: opts.workload?.runtime ?? "node",
      ...(repo
        ? {
            CLONE_URL: repo.cloneUrl,
            REPO_NAME: repoLabel ?? "",
            BRANCH: repo.branch ?? "",
            GIT_USER_NAME: repo.userName,
            GIT_USER_EMAIL: repo.userEmail,
          }
        : {}),
      ...(opts.workload?.packageManager
        ? { PACKAGE_MANAGER: opts.workload.packageManager }
        : {}),
    };
  }

  private buildClaim(
    handle: string,
    opts: EnsureOptions,
    boot: { token: string; daemonBootId: string; workdir: string },
  ): SandboxClaim {
    const envMap = this.buildEnvMap(opts, boot);
    return {
      apiVersion: `${K8S_CONSTANTS.CLAIM_API_GROUP}/${K8S_CONSTANTS.CLAIM_API_VERSION}`,
      kind: "SandboxClaim",
      metadata: {
        name: handle,
        namespace: this.namespace,
        // Tenant duplicated on the claim itself (not just the pod) so the
        // adopt path can recover orgId/userId after a state-store wipe;
        // adopt() reads claim.metadata.labels, not pod labels.
        labels: {
          "app.kubernetes.io/name": "mesh-sandbox",
          "app.kubernetes.io/managed-by": "mesh",
          ...buildTenantLabels(opts.tenant),
        },
      },
      spec: {
        sandboxTemplateRef: { name: this.sandboxTemplateName },
        // additionalPodMetadata.labels is the operator's pod-label propagation
        // hook (CRD field, not a generic patch). Tenant labels here flow to
        // the pod and become joinable in cAdvisor/kubelet metrics. `role`
        // distinguishes claimed pods from warm-pool pods (template sets
        // role=sandbox-pod by default).
        additionalPodMetadata: {
          labels: buildTenantLabels(opts.tenant, {
            [LABEL_KEYS.role]: "claimed",
            [LABEL_KEYS.sandboxHandle]: handle,
          }),
        },
        // `valueFrom.secretKeyRef` isn't supported on SandboxClaim env; RBAC
        // on the namespace is the secrecy boundary. Warm-pool off because the
        // operator rejects custom env on warm-pooled claims. Sorted by name
        // so `kubectl diff` / claim audit entries don't churn across runs
        // that pass the same env in different insertion orders.
        env: Object.entries(envMap)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([name, value]) => ({ name, value })),
        warmpool: "none",
        lifecycle: {
          shutdownPolicy: "Delete",
          shutdownTime: this.computeShutdownTime(),
        },
      },
    };
  }

  private async provision(
    id: SandboxId,
    handle: string,
    opts: EnsureOptions,
  ): Promise<K8sRecord> {
    const token = this.tokenGenerator();
    const daemonBootId = randomUUID();
    const workdir = DEFAULT_WORKDIR;

    const claim = this.buildClaim(handle, opts, {
      token,
      daemonBootId,
      workdir,
    });
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
      tenant: opts.tenant ?? null,
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

    const live = await this.openAndProbeDaemon(currentPodName, handle);
    if (!live) return null;

    // Pod bounced but the daemon's orchestrator handles re-bootstrap itself
    // on boot (resume-on-restart). Just refresh our copy of bootId.
    if (state.daemonBootId && state.daemonBootId !== live.bootId) {
      console.warn(
        `[${LOG_LABEL}] daemon restart detected (handle=${handle}): stored bootId=${state.daemonBootId} live bootId=${live.bootId}`,
      );
    }

    return {
      id,
      handle,
      podName: currentPodName,
      token: state.token,
      workdir: state.workdir ?? DEFAULT_WORKDIR,
      daemonUrl: live.daemonUrl,
      daemonForward: live.daemonForward,
      workload: state.workload ?? null,
      daemonBootId: live.bootId,
      tenant: state.tenant ?? null,
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

    const live = await this.openAndProbeDaemon(podName, handle);
    if (!live) return null;

    return {
      id,
      handle,
      podName,
      token,
      workdir: DEFAULT_WORKDIR,
      daemonUrl: live.daemonUrl,
      daemonForward: live.daemonForward,
      workload: null,
      daemonBootId: live.bootId,
      // Recovered from claim labels written at provision time. Null if the
      // claim pre-dates tenant labelling (back-compat with already-running
      // sandboxes when this code rolls out).
      tenant: readClaimTenant(claim),
    };
  }

  /**
   * Open the daemon port-forward and probe `/health`. Closes the forwarder
   * and returns null on any failure so the caller can fall through to
   * recreate. Both `rehydrate` and `adopt` share this shape — the only
   * difference is whether the bootId match is checked.
   */
  private async openAndProbeDaemon(
    podName: string,
    handle: string,
  ): Promise<{
    daemonForward: PortForwarder;
    daemonUrl: string;
    bootId: string;
  } | null> {
    const daemonForward = await this.openForwarder(
      podName,
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
    return { daemonForward, daemonUrl, bootId: health.bootId };
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

  // ---- Metric helpers -------------------------------------------------------

  private recordProxyDuration(
    source: "daemon" | "preview",
    statusCode: number,
    rec: K8sRecord | null,
    durationMs: number,
    fallbackHandle?: string,
  ): void {
    if (!this.metrics) return;
    this.metrics.proxyDurationMs.record(durationMs, {
      ...tenantAttrs(rec?.tenant ?? null),
      source,
      sandbox_handle: rec?.handle ?? fallbackHandle ?? "",
      status_code: statusCode || 0,
    });
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
      tenant: rec.tenant,
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
            // Release the failed listener before walking forward — listen()
            // failure leaves the Server object holding the connection handler
            // closure; closing makes the leak trivially visible to GC.
            try {
              server.close();
            } catch {}
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

interface RunnerMetrics {
  active: UpDownCounter;
  ensureOutcome: Counter;
  proxyDurationMs: Histogram;
}

function buildRunnerMetrics(meter: Meter): RunnerMetrics {
  return {
    active: meter.createUpDownCounter("mesh.sandbox.active", {
      description:
        "Active sandbox count, by runner kind and owning org. Cross-checks the cAdvisor-derived count from the cluster — divergence between the two indicates orphaned claims (mesh deleted but K8s didn't reap) or unattributed pods.",
      unit: "{sandbox}",
    }),
    ensureOutcome: meter.createCounter("mesh.sandbox.ensure.outcome", {
      description:
        "Outcome of each ensure() call: fresh provision, resume from state-store after restart, or adopt of a cluster-side claim mesh didn't know about. Cold-start ratio is the primary input for warm-pool sizing.",
      unit: "{call}",
    }),
    proxyDurationMs: meter.createHistogram("mesh.sandbox.proxy.duration_ms", {
      description:
        "Wall-clock latency of mesh-mediated requests to the sandbox daemon: tool exec proxies (source=daemon) and preview iframe traffic (source=preview).",
      unit: "ms",
    }),
  };
}

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

// CORS headers on synthesized preview-proxy responses. The studio iframe
// renders under the studio origin and fetches the preview origin cross-site
// (SSE at `/_decopilot_vm/events`, plus the EventSource probeMissing fetch);
// without ACAO the browser blocks the response *and* hides the actual status,
// so a 404 from us looks like an opaque CORS failure in devtools. The daemon
// already sets ACAO on its own responses — these headers only fire on errors
// we synthesize before reaching the daemon.
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

// K8s label keys mesh attaches. Centralized so writers (buildTenantLabels)
// and the reader (readClaimTenant) can't drift.
const LABEL_KEYS = {
  role: "mesh.decocms.com/role",
  sandboxHandle: "mesh.decocms.com/sandbox-handle",
  orgId: "mesh.decocms.com/org-id",
  userId: "mesh.decocms.com/user-id",
} as const;

// K8s label values: ≤63 chars, must match `(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?`.
// Org/user IDs are UUIDs in mesh and pass through unchanged; the regex check
// + truncation is defensive against future ID-shape changes (the operator will
// reject the claim outright if a label value is invalid).
const LABEL_VALUE_RE = /^([A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?)?$/;
const MAX_LABEL_VALUE_LEN = 63;

function sanitizeLabelValue(value: string): string {
  const truncated = value.slice(0, MAX_LABEL_VALUE_LEN);
  return LABEL_VALUE_RE.test(truncated) ? truncated : "";
}

/**
 * Tenant labels for `adopt()` recovery + cost attribution. Used on both the
 * claim (so `kubectl get sandboxclaim` shows ownership and adopt() can read
 * orgId/userId after a state-store wipe) and the pod (where cAdvisor /
 * kubelet metrics pick them up). Pass `extra` for pod-only fields like
 * `role` and `sandbox-handle`.
 */
function buildTenantLabels(
  tenant: EnsureOptions["tenant"],
  extra: Record<string, string> = {},
): Record<string, string> {
  const labels: Record<string, string> = { ...extra };
  if (tenant) {
    const orgId = sanitizeLabelValue(tenant.orgId);
    const userId = sanitizeLabelValue(tenant.userId);
    if (orgId) labels[LABEL_KEYS.orgId] = orgId;
    if (userId) labels[LABEL_KEYS.userId] = userId;
  }
  return labels;
}

/** Read tenant back from a claim's metadata.labels (adopt path). */
function readClaimTenant(claim: SandboxResource): RunnerTenant | null {
  const labels = claim.metadata?.labels;
  if (!labels) return null;
  const orgId = labels[LABEL_KEYS.orgId];
  const userId = labels[LABEL_KEYS.userId];
  if (!orgId || !userId) return null;
  return { orgId, userId };
}

/**
 * Convert tenant struct to OTel attribute keys. `runner_kind` is constant for
 * a given runner instance but included on every attrs set so downstream
 * dashboards can pivot across runners (k8s vs docker) without re-aggregating.
 */
function tenantAttrs(tenant: RunnerTenant | null): {
  org_id: string;
  user_id: string;
  runner_kind: string;
} {
  return {
    org_id: tenant?.orgId ?? "",
    user_id: tenant?.userId ?? "",
    runner_kind: RUNNER_KIND,
  };
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
