/**
 * Pure helpers for the unified daemon's HTTP API. Daemon endpoints live
 * under `/_decopilot_vm/*` (except `/health` at root, which is unauth).
 * POST bodies are base64-encoded JSON — the daemon decodes on its side.
 */

import { sleep } from "../shared";
import type { ExecInput, ExecOutput } from "./runner/types";

const DEFAULT_EXEC_TIMEOUT_MS = 60_000;
const HEALTH_PROBE_TIMEOUT_MS = 500;
const READY_ATTEMPTS = 25;
const READY_INTERVAL_MS = 200;
const READY_JITTER_MS = 50; // ±50ms around READY_INTERVAL_MS

/**
 * Default budget for `waitForDaemonHttp`. Equivalent attempt count to
 * `waitForDaemonReady` so a daemon that boots cleanly but never finishes
 * orchestration shows up as a `phase != "ready"` rather than a `/health`
 * timeout — that's the signal `provision`'s caller needs to decide whether
 * to bootstrap or wait.
 */
const HTTP_ATTEMPTS = READY_ATTEMPTS;

/**
 * Daemon bootstrap phase. Mirrors the values the daemon emits on `/health`
 * post-Phase-1. Tests read it through this exported type so the union
 * stays canonical mesh-side.
 */
export type DaemonPhase =
  | "pending-bootstrap"
  | "bootstrapping"
  | "ready"
  | "failed";

export interface DaemonHealth {
  ready: boolean;
  bootId: string;
  setup: { running: boolean; done: boolean };
  /**
   * Optional for back-compat with daemons that predate Phase 1. After Phase
   * 3 cutover this is required; today we treat absence as `ready` (the env
   * path bootstraps the daemon directly to ready without going through the
   * pending → bootstrapping → ready ladder).
   */
  phase?: DaemonPhase;
}

export interface BootstrapPayload {
  schemaVersion: 1;
  claimNonce: string;
  daemonToken: string;
  runtime: "node" | "bun" | "deno";
  cloneUrl?: string;
  repoName?: string;
  branch?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  packageManager?: "npm" | "pnpm" | "yarn" | "bun" | "deno";
  devPort?: number;
  appRoot?: string;
  env?: Record<string, string>;
}

export interface BootstrapResponse {
  phase: "bootstrapping" | "ready";
  bootId: string;
  hash: string;
}

/**
 * Mesh-side error type for non-2xx responses from `POST /_decopilot_vm/bootstrap`.
 * Callers branch on `status` to distinguish:
 *   - 400 (validation) — payload is malformed; abort and surface to the user.
 *   - 403 (nonce mismatch) — wrong daemon (pod recreate stamped a new nonce);
 *     drop the row and recurse to provision.
 *   - 409 (conflict / failed phase) — another writer already bootstrapped
 *     with a different payload OR the phase is `failed`. Body's `phase`
 *     field disambiguates; `failed` requires pod recreate.
 */
export class DaemonBootstrapError extends Error {
  constructor(
    readonly status: number,
    readonly body: { phase?: DaemonPhase; reason?: string } | null,
    message: string,
  ) {
    super(message);
    this.name = "DaemonBootstrapError";
  }
}

/**
 * Returns the parsed /health response, or null if unreachable or the
 * shape is wrong (e.g. an old daemon that predates bootId). Null is
 * the signal to the runner that the container is incompatible and
 * should be force-recreated.
 *
 * `phase` is round-tripped opportunistically: post-Phase-1 daemons set
 * it; back-compat (env-driven) daemons don't and the field is left
 * undefined. Callers that need the phase guard should treat absence as
 * `ready` (the env path lands the daemon directly there).
 */
export async function probeDaemonHealth(
  daemonUrl: string,
): Promise<DaemonHealth | null> {
  try {
    const res = await fetch(`${daemonUrl}/health`, {
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<DaemonHealth>;
    if (
      typeof body === "object" &&
      body !== null &&
      typeof body.bootId === "string" &&
      typeof body.ready === "boolean" &&
      body.setup &&
      typeof body.setup.running === "boolean" &&
      typeof body.setup.done === "boolean"
    ) {
      const phase =
        typeof body.phase === "string" &&
        (body.phase === "pending-bootstrap" ||
          body.phase === "bootstrapping" ||
          body.phase === "ready" ||
          body.phase === "failed")
          ? body.phase
          : undefined;
      return { ...(body as DaemonHealth), phase };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Optional probe override — lets unit tests stub the polling loop without
 * mocking `fetch` globally. Production callers leave it default.
 */
export type DaemonProbeFn = (daemonUrl: string) => Promise<DaemonHealth | null>;

/**
 * Polls /health until it responds with a valid shape. Does NOT inspect
 * `phase` — proves only that the daemon process is bound to its port.
 * Used between `waitForSandboxReady` and `daemonBootstrap` so mesh
 * doesn't POST bootstrap before the HTTP server accepts connections.
 *
 * Throws on timeout; legacy callers that need phase=ready should call
 * `waitForDaemonReady` instead.
 */
export async function waitForDaemonHttp(
  daemonUrl: string,
  opts: { timeoutMs?: number; probe?: DaemonProbeFn } = {},
): Promise<void> {
  const probe = opts.probe ?? probeDaemonHealth;
  const attempts =
    opts.timeoutMs !== undefined
      ? Math.max(1, Math.ceil(opts.timeoutMs / READY_INTERVAL_MS))
      : HTTP_ATTEMPTS;
  for (let i = 0; i < attempts; i++) {
    if ((await probe(daemonUrl)) !== null) return;
    const jitter = (Math.random() * 2 - 1) * READY_JITTER_MS;
    await sleep(READY_INTERVAL_MS + jitter);
  }
  throw new Error(
    `sandbox daemon at ${daemonUrl} did not respond on /health within ${
      (attempts * READY_INTERVAL_MS) / 1000
    }s`,
  );
}

/**
 * Polls /health until `phase === "ready"` (or absent — back-compat with
 * env-driven daemons). Throws on timeout, on terminal `failed` (caller
 * deletes the claim and recurses), and on persistent invalid shape.
 */
export async function waitForDaemonReady(
  daemonUrl: string,
  opts: { probe?: DaemonProbeFn } = {},
): Promise<void> {
  const probe = opts.probe ?? probeDaemonHealth;
  for (let i = 0; i < READY_ATTEMPTS; i++) {
    const health = await probe(daemonUrl);
    if (health !== null) {
      if (health.phase === undefined || health.phase === "ready") return;
      if (health.phase === "failed") {
        throw new Error(
          `sandbox daemon at ${daemonUrl} reports phase=failed; pod recreate required`,
        );
      }
      // pending-bootstrap or bootstrapping — keep polling.
    }
    const jitter = (Math.random() * 2 - 1) * READY_JITTER_MS;
    await sleep(READY_INTERVAL_MS + jitter);
  }
  throw new Error(
    `sandbox daemon at ${daemonUrl} did not reach phase=ready within ${
      (READY_ATTEMPTS * READY_INTERVAL_MS) / 1000
    }s`,
  );
}

/**
 * POST `/_decopilot_vm/bootstrap` with the per-claim payload. Unauth by
 * design (the route is phase + nonce gated, not auth gated — see Phase
 * 1 of SPEC-daemon-bootstrap.md). 400/403/409 surface as
 * `DaemonBootstrapError` so the runner can branch on the failure mode.
 */
export async function daemonBootstrap(
  daemonUrl: string,
  payload: BootstrapPayload,
  signal?: AbortSignal,
): Promise<BootstrapResponse> {
  const rawBody = JSON.stringify(payload);
  const b64Body = Buffer.from(rawBody, "utf-8").toString("base64");
  const res = await fetch(`${daemonUrl}/_decopilot_vm/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: b64Body,
    signal,
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const body =
      parsed && typeof parsed === "object"
        ? (parsed as { phase?: DaemonPhase; reason?: string })
        : null;
    throw new DaemonBootstrapError(
      res.status,
      body,
      `daemon bootstrap returned ${res.status}${
        body?.phase ? ` phase=${body.phase}` : ""
      }${body?.reason ? ` reason=${body.reason}` : ""}`,
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).phase !== "string" ||
    typeof (parsed as Record<string, unknown>).bootId !== "string" ||
    typeof (parsed as Record<string, unknown>).hash !== "string"
  ) {
    throw new DaemonBootstrapError(
      res.status,
      null,
      `daemon bootstrap returned ${res.status} with malformed body`,
    );
  }
  const body = parsed as BootstrapResponse;
  if (body.phase !== "bootstrapping" && body.phase !== "ready") {
    throw new DaemonBootstrapError(
      res.status,
      { phase: body.phase as DaemonPhase },
      `daemon bootstrap returned unexpected phase=${body.phase}`,
    );
  }
  return body;
}

/**
 * Deterministic JSON encoding for bootstrap payload hashing. Mirrors the
 * daemon's `canonicalize` so a hash computed mesh-side equals the one
 * the daemon stamps on its bootstrap.json. `undefined` values and
 * missing keys are treated identically; objects are recursively sorted
 * by key; arrays preserve order; nested env maps are sorted.
 */
export function canonicalizeBootstrapPayload(value: unknown): string {
  return JSON.stringify(canonicalSort(value));
}

function canonicalSort(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalSort);
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) out[k] = canonicalSort(v);
  return out;
}

export async function daemonBash(
  daemonUrl: string,
  token: string,
  input: ExecInput,
): Promise<ExecOutput> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
  const rawBody = JSON.stringify({
    command: input.command,
    timeout: timeoutMs,
    cwd: input.cwd,
    env: input.env,
  });
  const b64Body = Buffer.from(rawBody, "utf-8").toString("base64");
  const response = await fetch(`${daemonUrl}/_decopilot_vm/bash`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: b64Body,
    signal: AbortSignal.timeout(timeoutMs + 5_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `sandbox daemon /_decopilot_vm/bash returned ${response.status}${body ? `: ${body}` : ""}`,
    );
  }
  const json = (await response.json()) as {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    timedOut?: boolean;
  };
  return {
    stdout: json.stdout ?? "",
    stderr: json.stderr ?? "",
    exitCode: json.exitCode ?? -1,
    timedOut: Boolean(json.timedOut),
  };
}

// Dropped before proxying: session cookies (user code must not see the
// caller's session) + hop-by-hop headers per RFC 7230.
const STRIP_REQUEST_HEADERS = [
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
];

/**
 * HTTP passthrough to the daemon. Returns the native Response (streamed, not
 * buffered). `signal` must be the client's AbortSignal — closing the browser
 * connection must cascade to the daemon so SSE subscribers are dropped.
 */
export async function proxyDaemonRequest(
  daemonUrl: string,
  token: string,
  path: string,
  init: {
    method: string;
    headers: Headers;
    body: BodyInit | null;
    signal?: AbortSignal;
  },
): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const h of STRIP_REQUEST_HEADERS) headers.delete(h);
  headers.set("authorization", `Bearer ${token}`);
  const hasBody = init.method !== "GET" && init.method !== "HEAD";
  const target = `${daemonUrl}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(target, {
    method: init.method,
    headers,
    body: hasBody ? init.body : undefined,
    redirect: "manual",
    signal: init.signal,
    // @ts-expect-error Bun/Undici-only: allow streaming request body.
    duplex: hasBody ? "half" : undefined,
  });
}
