/**
 * Pure helpers for the unified daemon's HTTP API. Daemon endpoints live
 * under `/_decopilot_vm/*` (except `/health` at root, which is unauth).
 * POST bodies are base64-encoded JSON — the daemon decodes on its side.
 */

import { TenantConfig } from "../daemon/types";
import { sleep } from "../shared";
import type { ExecInput, ExecOutput } from "./runner/types";

const DEFAULT_EXEC_TIMEOUT_MS = 60_000;
const HEALTH_PROBE_TIMEOUT_MS = 500;
const BOOTSTRAP_TIMEOUT_MS = 10_000;
const READY_ATTEMPTS = 25;
const READY_INTERVAL_MS = 200;
const READY_JITTER_MS = 50; // ±50ms around READY_INTERVAL_MS

export interface BootstrapResponse {
  phase: string;
  bootId: string;
  hash: string;
}

export interface DaemonHealth {
  ready: boolean;
  bootId: string;
  setup: { running: boolean; done: boolean };
}

/**
 * Returns the parsed /health response, or null if unreachable or the
 * shape is wrong (e.g. an old daemon that predates bootId). Null is
 * the signal to the runner that the container is incompatible and
 * should be force-recreated.
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
      return body as DaemonHealth;
    }
    return null;
  } catch {
    return null;
  }
}

/** Polls /health; throws on timeout. Resolves as soon as the daemon's /health returns a valid shape (setup may still be in-flight). */
export async function waitForDaemonReady(daemonUrl: string): Promise<void> {
  for (let i = 0; i < READY_ATTEMPTS; i++) {
    if ((await probeDaemonHealth(daemonUrl)) !== null) return;
    const jitter = (Math.random() * 2 - 1) * READY_JITTER_MS;
    await sleep(READY_INTERVAL_MS + jitter);
  }
  throw new Error(
    `sandbox daemon at ${daemonUrl} did not respond on /health within ${
      (READY_ATTEMPTS * READY_INTERVAL_MS) / 1000
    }s`,
  );
}

export interface ConfigUpdateResponse {
  phase: string;
  bootId: string;
  applied: "devport-only" | "rerun";
}

// `/bootstrap` is unauthenticated: NetworkPolicy is the trust boundary on the
// daemon's port (see daemon/bootstrap.ts). Body is base64-encoded JSON like
// every other `/_decopilot_vm/*` route. 200 = accepted (or idempotent re-POST
// with matching hash); 409 = a different bootstrap is already pinned, surfaced
// as an Error so the runner fails loudly instead of running with stale tenant.
export async function postBootstrap(
  daemonUrl: string,
  payload: TenantConfig,
): Promise<BootstrapResponse> {
  const rawBody = JSON.stringify(payload);
  const b64Body = Buffer.from(rawBody, "utf-8").toString("base64");
  const res = await fetch(`${daemonUrl}/_decopilot_vm/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: b64Body,
    signal: AbortSignal.timeout(BOOTSTRAP_TIMEOUT_MS),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(
      `sandbox daemon /_decopilot_vm/bootstrap returned ${res.status}: ${body}`,
    );
  }
  return JSON.parse(body) as BootstrapResponse;
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
