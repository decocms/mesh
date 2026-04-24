/**
 * Pure helpers for the daemon's `/_daemon/*` HTTP API. Callers pass the full
 * path (incl. `/_daemon`) so call sites stay greppable.
 */

import { gitIdentityScript, shellQuote, sleep } from "../shared";
import type { EnsureOptions, ExecInput, ExecOutput } from "./runner/types";

const DEFAULT_EXEC_TIMEOUT_MS = 60_000;
const HEALTH_PROBE_TIMEOUT_MS = 500;
const READY_ATTEMPTS = 25;
const READY_INTERVAL_MS = 200;
const READY_JITTER_MS = 50; // ±50ms around READY_INTERVAL_MS

export async function probeDaemonHealth(daemonUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${daemonUrl}/health`, {
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Reads the daemon's per-boot UUID. Different value between calls means the
 * container was restarted (OOMKill, crash, kubelet eviction) and any ephemeral
 * workdir state is gone — callers should re-bootstrap. Returns null if the
 * daemon is unreachable or predates the bootId field (graceful for rollouts).
 */
export async function readDaemonBootId(
  daemonUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${daemonUrl}/health`, {
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { bootId?: unknown };
    return typeof body.bootId === "string" ? body.bootId : null;
  } catch {
    return null;
  }
}

/** Polls /health; throws on timeout. Does not stop the container. */
export async function waitForDaemonReady(daemonUrl: string): Promise<void> {
  for (let i = 0; i < READY_ATTEMPTS; i++) {
    if (await probeDaemonHealth(daemonUrl)) return;
    const jitter = (Math.random() * 2 - 1) * READY_JITTER_MS;
    await sleep(READY_INTERVAL_MS + jitter);
  }
  throw new Error(
    `sandbox daemon at ${daemonUrl} did not respond on /health within ${
      (READY_ATTEMPTS * READY_INTERVAL_MS) / 1000
    }s`,
  );
}

export async function daemonBash(
  daemonUrl: string,
  token: string,
  input: ExecInput,
): Promise<ExecOutput> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
  const response = await fetch(`${daemonUrl}/_daemon/bash`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      command: input.command,
      timeout: timeoutMs,
      cwd: input.cwd,
      env: input.env,
    }),
    signal: AbortSignal.timeout(timeoutMs + 5_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `sandbox daemon /_daemon/bash returned ${response.status}${body ? `: ${body}` : ""}`,
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

/**
 * Idempotent repo bootstrap. Three branches: (1) `.git` exists → skip;
 * (2) workdir empty → clone; (3) workdir non-empty → late-attach by moving
 * existing files to `<workdir>.prelink.<ts>/` before cloning.
 * Post-clone branch resolution (fetch-or-create) mirrors the Freestyle daemon
 * so docker sandboxes land on the requested branch, not the default.
 */
export async function bootstrapRepo(
  daemonUrl: string,
  token: string,
  workdir: string,
  repo: NonNullable<EnsureOptions["repo"]>,
): Promise<void> {
  const qWorkdir = shellQuote(workdir);
  const qCloneUrl = shellQuote(repo.cloneUrl);

  const cloneBlock = `if [ -d ${qWorkdir}/.git ]; then echo "workdir already a git repo, skipping clone"; elif [ -z "$(ls -A ${qWorkdir} 2>/dev/null)" ]; then git clone ${qCloneUrl} ${qWorkdir}; else BACKUP=${qWorkdir}.prelink.$(date +%s) && mkdir -p "$BACKUP" && ( shopt -s dotglob nullglob && mv ${qWorkdir}/* "$BACKUP"/ ) && echo "moved pre-link contents to $BACKUP" && git clone ${qCloneUrl} ${qWorkdir}; fi`;

  // Defense-in-depth branch name validation, mirrors daemon.ts runSetup().
  const branchBlock = (() => {
    if (!repo.branch) return null;
    if (
      !/^[A-Za-z0-9._/-]+$/.test(repo.branch) ||
      repo.branch.startsWith("-")
    ) {
      throw new Error(`invalid branch name: ${repo.branch}`);
    }
    const qBranch = shellQuote(repo.branch);
    return `cd ${qWorkdir} && if [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = ${qBranch} ]; then echo "already on ${repo.branch}"; elif git fetch origin ${qBranch}:${qBranch} 2>/dev/null; then git checkout ${qBranch}; else git checkout -b ${qBranch}; fi`;
  })();

  const cmd = [
    gitIdentityScript(repo.userName, repo.userEmail),
    cloneBlock,
    branchBlock,
  ]
    .filter((part): part is string => part !== null)
    .join(" && ");
  // Medium repos routinely exceed the default 60s exec timeout.
  const result = await daemonBash(daemonUrl, token, {
    command: cmd,
    timeoutMs: 10 * 60_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `sandbox repo bootstrap failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }
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
