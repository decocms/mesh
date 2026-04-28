/**
 * Low-level CRUD + readiness watch for agent-sandbox SandboxClaim / Sandbox.
 *
 * Talks to the k8s REST API directly via the runtime's native `fetch` with
 * `{ tls: { cert, key, ca } }`. Credentials (client cert + CA) are extracted
 * from the active `KubeConfig` context using the library's own
 * `applyToHTTPSOptions` helper.
 *
 * Why not `kc.makeApiClient(CustomObjectsApi)` like admin does:
 *   `@kubernetes/client-node` 1.x's generated clients ship an
 *   `IsomorphicFetchHttpLibrary` that calls `fetch(url, { agent })` — a
 *   node-fetch signal that Node's https.Agent (cert/key/ca) should be used
 *   for the TLS handshake. Bun's node-fetch polyfill silently drops the
 *   `agent` option: TLS verification fails and, if bypassed, the cluster
 *   sees `system:anonymous` (no client cert). The fix is Bun-native:
 *   `fetch(url, { tls: { cert, key, ca } })`. The library's Watch hits
 *   the same bug, so readiness is rebuilt from scratch here too.
 *
 * Surface intentionally minimal: create/delete/get/waitForReady. Higher-level
 * "ensure ready" flows live on the runner, not here.
 */

import {
  type KubeConfig,
  type V1Status as V1StatusUpstream,
} from "@kubernetes/client-node";
import { K8S_CONSTANTS, SandboxError, SandboxTimeoutError } from "./constants";

type V1Status = Partial<V1StatusUpstream> & { reason?: string };

/**
 * Subset of SandboxClaim `spec.env[]`. The CRD accepts only literal
 * `{name, value}` pairs — no `valueFrom`/`secretKeyRef`. That's why Stage 2.1
 * injects `DAEMON_TOKEN` here directly rather than via a Secret reference.
 */
export interface SandboxClaimEnvVar {
  name: string;
  value: string;
  containerName?: string;
}

export interface SandboxClaim {
  apiVersion: string;
  kind: "SandboxClaim";
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    sandboxTemplateRef: { name: string };
    env?: SandboxClaimEnvVar[];
    /**
     * Pod-level metadata the operator merges onto the spawned Pod (CRD field,
     * see sandboxclaims.extensions.agents.x-k8s.io v1alpha1). Used to attach
     * tenant labels for downstream metrics attribution.
     */
    additionalPodMetadata?: {
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
    };
    /**
     * `"none"` forces a fresh pod per claim — required when `spec.env` is
     * set because the operator rejects custom env when the claim would
     * come from a warm pool (warm pods are pre-started, can't take new
     * env). Passing `undefined` lets the CRD default ("default") apply.
     */
    warmpool?: "none" | "default" | string;
    lifecycle?: {
      shutdownTime?: string;
      shutdownPolicy?: "Delete" | "Retain";
    };
  };
}

export interface SandboxCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

export interface SandboxResource {
  metadata?: {
    name?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  /**
   * Present when this came back from `getSandboxClaim` (CRD has a spec);
   * absent from Sandbox-kind resources because `waitForSandboxReady` only
   * projects out metadata/status. `adopt()` reads `spec.env` to recover the
   * per-claim DAEMON_TOKEN it originally injected.
   */
  spec?: {
    sandboxTemplateRef?: { name?: string };
    env?: SandboxClaimEnvVar[];
    lifecycle?: {
      shutdownTime?: string;
      shutdownPolicy?: "Delete" | "Retain";
    };
  };
  status?: {
    conditions?: SandboxCondition[];
  };
}

type WatchEvent = {
  type: "ADDED" | "MODIFIED" | "DELETED" | "BOOKMARK" | "ERROR";
  object: SandboxResource | V1Status;
};

// ---- Transport --------------------------------------------------------------

/** Resolved auth + TLS material for the active kubeconfig context. */
interface KubeAuth {
  server: string;
  headers: Record<string, string>;
  tls: {
    cert?: string;
    key?: string;
    ca?: string;
    rejectUnauthorized?: boolean;
  };
}

async function resolveKubeAuth(kc: KubeConfig): Promise<KubeAuth> {
  const cluster = kc.getCurrentCluster();
  if (!cluster) throw new SandboxError("No active cluster in kubeconfig");

  // `applyToHTTPSOptions` mutates a plain options object, threading through the
  // authenticator chain (token files, exec plugins, etc.). We harvest the bits
  // we care about — headers (bearer/impersonation), cert/key/ca — and discard
  // the `agent` it leaves behind since we route around node-fetch entirely.
  const opts: Record<string, unknown> = {};
  await kc.applyToHTTPSOptions(opts);

  const headers: Record<string, string> = {};
  const optHeaders = (opts.headers ?? {}) as Record<string, string | string[]>;
  for (const [k, v] of Object.entries(optHeaders)) {
    if (Array.isArray(v)) headers[k] = v.join(", ");
    else if (v !== undefined) headers[k] = String(v);
  }
  if (typeof opts.auth === "string" && !headers.Authorization) {
    headers.Authorization = `Basic ${Buffer.from(opts.auth).toString("base64")}`;
  }

  return {
    server: cluster.server.replace(/\/+$/, ""),
    headers,
    tls: {
      cert: bufferLike(opts.cert),
      key: bufferLike(opts.key),
      ca: bufferLike(opts.ca),
      rejectUnauthorized: cluster.skipTLSVerify ? false : undefined,
    },
  };
}

function bufferLike(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  return String(v);
}

interface KubeFetchInit {
  method: "GET" | "POST" | "DELETE" | "PATCH";
  path: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Extra Accept / query hints. Merged with auth headers. */
  headers?: Record<string, string>;
  /**
   * Required iff `method === "PATCH"`. Drives the patch content-type:
   * RFC 7396 merge-patch (CRDs) vs. strategic-merge (built-in types).
   */
  patchType?: "merge" | "strategic-merge";
}

/**
 * Thin wrapper around `fetch` that threads TLS + auth from the kubeconfig.
 * Returns the raw `Response` so streaming callers (watch) can consume the
 * body themselves; non-streaming callers parse JSON explicitly.
 */
async function kubeFetch(
  kc: KubeConfig,
  init: KubeFetchInit,
): Promise<Response> {
  const auth = await resolveKubeAuth(kc);
  const headers: Record<string, string> = { ...auth.headers, ...init.headers };
  if (init.method === "PATCH") {
    headers["content-type"] =
      init.patchType === "strategic-merge"
        ? "application/strategic-merge-patch+json"
        : "application/merge-patch+json";
  } else if (init.body !== undefined && !("content-type" in headers)) {
    headers["content-type"] = "application/json";
  }
  const reqInit: RequestInit & { tls?: typeof auth.tls } = {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
    tls: auth.tls,
  };
  return fetch(`${auth.server}${init.path}`, reqInit as RequestInit);
}

/** HTTP error carrier used for the 404 fast-path before SandboxError wrapping. */
class KubeHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: V1Status | null,
    message: string,
  ) {
    super(message);
    this.name = "KubeHttpError";
  }
}

async function readStatusBody(resp: Response): Promise<V1Status | null> {
  try {
    return (await resp.json()) as V1Status;
  } catch {
    return null;
  }
}

async function ensureOk(resp: Response, action: string): Promise<void> {
  if (resp.ok) return;
  const body = await readStatusBody(resp);
  const message =
    body?.message ?? `${action} failed: ${resp.status} ${resp.statusText}`;
  throw new KubeHttpError(resp.status, body, message);
}

/**
 * Issue a kube call where 404 is *not* an error (the resource was already
 * gone; mesh's next ensure() recreates it). On 404, returns `null`. On 2xx,
 * returns the parsed JSON body — or `null` for callers that don't need it.
 * All other errors are wrapped in `SandboxError` with `wrapMessage` as the
 * surfaced label.
 */
async function callSwallowing404<T>(
  kc: KubeConfig,
  init: KubeFetchInit,
  action: string,
  wrapMessage: string,
  parse: "json" | "none" = "none",
): Promise<T | null> {
  try {
    const resp = await kubeFetch(kc, init);
    if (resp.status === 404) return null;
    await ensureOk(resp, action);
    if (parse === "json") return (await resp.json()) as T;
    return null;
  } catch (error) {
    throw new SandboxError(wrapMessage, error);
  }
}

// ---- Public surface ---------------------------------------------------------

const CLAIM_PATH_PREFIX = `/apis/${K8S_CONSTANTS.CLAIM_API_GROUP}/${K8S_CONSTANTS.CLAIM_API_VERSION}/namespaces`;

export async function createSandboxClaim(
  kc: KubeConfig,
  namespace: string,
  claim: SandboxClaim,
): Promise<void> {
  const path = `${CLAIM_PATH_PREFIX}/${encodeURIComponent(namespace)}/${K8S_CONSTANTS.CLAIM_PLURAL}`;
  try {
    const resp = await kubeFetch(kc, { method: "POST", path, body: claim });
    await ensureOk(resp, "createSandboxClaim");
  } catch (error) {
    throw new SandboxError(
      `Failed to create SandboxClaim: ${claim.metadata.name}`,
      error,
    );
  }
}

function claimPath(namespace: string, claimName: string): string {
  return `${CLAIM_PATH_PREFIX}/${encodeURIComponent(namespace)}/${K8S_CONSTANTS.CLAIM_PLURAL}/${encodeURIComponent(claimName)}`;
}

/**
 * Update the claim's idle-reap clock. The agent-sandbox operator honors
 * `spec.lifecycle.shutdownTime` with `shutdownPolicy: Delete`: once the
 * wall clock passes `shutdownTime`, the operator deletes the claim + pod.
 *
 * Mesh calls this on every `ensure()` hit so an active sandbox continuously
 * pushes its deadline forward; an abandoned one hits the deadline and the
 * operator reaps it. No mesh-side cron/reconcile needed.
 *
 * Uses merge-patch (RFC 7396), which is the documented patch format for
 * CRDs — strategic-merge only works on built-in types that ship merge
 * keys. 404 is swallowed because a deleted-since-lookup claim is not an
 * error from mesh's perspective; the caller's next ensure() will
 * re-provision.
 */
export async function patchSandboxClaimShutdown(
  kc: KubeConfig,
  namespace: string,
  claimName: string,
  shutdownTime: string,
): Promise<void> {
  await callSwallowing404(
    kc,
    {
      method: "PATCH",
      path: claimPath(namespace, claimName),
      patchType: "merge",
      body: {
        spec: { lifecycle: { shutdownPolicy: "Delete", shutdownTime } },
      },
    },
    "patchSandboxClaimShutdown",
    `Failed to patch SandboxClaim shutdownTime: ${claimName}`,
  );
}

export async function deleteSandboxClaim(
  kc: KubeConfig,
  namespace: string,
  claimName: string,
): Promise<void> {
  await callSwallowing404(
    kc,
    { method: "DELETE", path: claimPath(namespace, claimName) },
    "deleteSandboxClaim",
    `Failed to delete SandboxClaim: ${claimName}`,
  );
}

export async function getSandboxClaim(
  kc: KubeConfig,
  namespace: string,
  claimName: string,
): Promise<SandboxResource | undefined> {
  const found = await callSwallowing404<SandboxResource>(
    kc,
    { method: "GET", path: claimPath(namespace, claimName) },
    "getSandboxClaim",
    `Failed to get SandboxClaim: ${claimName}`,
    "json",
  );
  return found ?? undefined;
}

export interface WaitForSandboxReadyResult {
  sandboxName: string;
  podName: string;
}

/**
 * Resolves on the first `Ready=True` condition on the Sandbox matching
 * `claimName`; rejects on stream error, missing name metadata, or timeout.
 * The watch is aborted exactly once via `settle()`; callers get deterministic
 * teardown regardless of which branch fires first.
 */
export function waitForSandboxReady(
  kc: KubeConfig,
  namespace: string,
  claimName: string,
  timeoutSeconds = 180,
): Promise<WaitForSandboxReadyResult> {
  const path = `/apis/${K8S_CONSTANTS.SANDBOX_API_GROUP}/${K8S_CONSTANTS.SANDBOX_API_VERSION}/namespaces/${encodeURIComponent(namespace)}/${K8S_CONSTANTS.SANDBOX_PLURAL}?watch=true&fieldSelector=${encodeURIComponent(`metadata.name=${claimName}`)}`;

  const { resolve, reject, promise } =
    Promise.withResolvers<WaitForSandboxReadyResult>();

  const controller = new AbortController();
  let settled = false;
  const timeoutHandle = setTimeout(() => {
    if (settled) return;
    settled = true;
    controller.abort();
    reject(
      new SandboxTimeoutError(
        `Sandbox did not become ready within ${timeoutSeconds} seconds`,
      ),
    );
  }, timeoutSeconds * 1000);

  const settleWith = (fn: () => void) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutHandle);
    controller.abort();
    fn();
  };

  (async () => {
    let resp: Response;
    try {
      resp = await kubeFetch(kc, {
        method: "GET",
        path,
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
    } catch (err) {
      settleWith(() =>
        reject(
          new SandboxError("Failed to start watch for sandbox readiness", err),
        ),
      );
      return;
    }

    if (!resp.ok || !resp.body) {
      const body = await readStatusBody(resp).catch(() => null);
      settleWith(() =>
        reject(
          new SandboxError(
            `Watch handshake failed (${resp.status}): ${body?.message ?? resp.statusText}`,
          ),
        ),
      );
      return;
    }

    try {
      for await (const event of readNdJson<WatchEvent>(resp.body)) {
        if (settled) return;
        // Bookmark/ERROR/DELETED are never a "ready" signal. ERROR carries a
        // V1Status payload rather than a SandboxResource; treating it as a
        // fatal stream error mirrors client-go's behaviour.
        if (event.type === "ERROR") {
          const status = event.object as V1Status;
          settleWith(() =>
            reject(
              new SandboxError(
                `Watch stream error while waiting for sandbox: ${status.message ?? "unknown"}`,
              ),
            ),
          );
          return;
        }
        if (event.type !== "ADDED" && event.type !== "MODIFIED") continue;

        const sandbox = event.object as SandboxResource;
        const ready = sandbox.status?.conditions?.find(
          (c) => c.type === "Ready" && c.status === "True",
        );
        if (!ready) continue;

        const sandboxName = sandbox.metadata?.name;
        if (!sandboxName) {
          settleWith(() =>
            reject(new SandboxError("Sandbox metadata or name is missing")),
          );
          return;
        }
        const podName =
          sandbox.metadata?.annotations?.[K8S_CONSTANTS.POD_NAME_ANNOTATION] ??
          sandboxName;
        settleWith(() => resolve({ sandboxName, podName }));
        return;
      }
      // Stream ended before Ready observed — treat as transient failure so the
      // caller can retry rather than wait out the timeout.
      settleWith(() =>
        reject(
          new SandboxError("Watch stream closed before sandbox became ready"),
        ),
      );
    } catch (err) {
      if (settled) return;
      // AbortError during in-flight stream is the timeout path above; don't
      // double-reject.
      if (
        err instanceof Error &&
        (err.name === "AbortError" || controller.signal.aborted)
      )
        return;
      settleWith(() =>
        reject(
          new SandboxError("Watch stream error while waiting for sandbox", err),
        ),
      );
    }
  })();

  return promise;
}

/** ND-JSON line reader over a WHATWG ReadableStream. */
async function* readNdJson<T>(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<T, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let newline: number;
      // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic line loop
      while ((newline = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, newline).trim();
        buf = buf.slice(newline + 1);
        if (!line) continue;
        yield JSON.parse(line) as T;
      }
    }
    const tail = buf.trim();
    if (tail) yield JSON.parse(tail) as T;
  } finally {
    reader.releaseLock();
  }
}
