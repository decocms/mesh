/**
 * Wire-protocol helpers for the sandbox daemon's HTTP API.
 *
 * All control-plane routes live under `/_daemon/*` on the daemon's port.
 * Callers pass the full path (including the `/_daemon` prefix) — the helpers
 * don't magic it in, so each call site is greppable.
 *
 * Pure functions parameterised by `(daemonUrl, token, …)` — no class state,
 * no docker CLI. Reusable from any runner that targets the same daemon image.
 */

import { gitIdentityScript, shellQuote } from "../../shared";
import type { EnsureOptions, ExecInput, ExecOutput } from "./types";

const DEFAULT_EXEC_TIMEOUT_MS = 60_000;
const HEALTH_PROBE_TIMEOUT_MS = 500;
const READY_ATTEMPTS = 25;
const READY_INTERVAL_MS = 200;

/** One-shot GET /health — true iff the daemon answers ok within the probe window. */
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

/** Poll /health until ready; throws on timeout. Does not stop the container. */
export async function waitForDaemonReady(daemonUrl: string): Promise<void> {
  for (let i = 0; i < READY_ATTEMPTS; i++) {
    if (await probeDaemonHealth(daemonUrl)) return;
    await sleep(READY_INTERVAL_MS);
  }
  throw new Error(
    `sandbox daemon at ${daemonUrl} did not respond on /health within ${
      (READY_ATTEMPTS * READY_INTERVAL_MS) / 1000
    }s`,
  );
}

/** POST /_daemon/bash — run a shell command inside the container. */
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
      timeoutMs,
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
 * Idempotent repo bootstrap: sets global git identity, then clones into
 * `workdir`. Three branches:
 *  - `workdir/.git` exists → already a repo, skip.
 *  - `workdir` empty → clone directly.
 *  - `workdir` non-empty and not a repo → late-attach. Move every existing
 *    file (including dotfiles) into a sibling `<workdir>.prelink.<unix-ts>/`
 *    backup so the clone can proceed without clobbering user work.
 */
export async function bootstrapRepo(
  daemonUrl: string,
  token: string,
  workdir: string,
  repo: NonNullable<EnsureOptions["repo"]>,
): Promise<void> {
  const qWorkdir = shellQuote(workdir);
  const cmd = [
    gitIdentityScript(repo.userName, repo.userEmail),
    `if [ -d ${qWorkdir}/.git ]; then echo "workdir already a git repo, skipping clone"; elif [ -z "$(ls -A ${qWorkdir} 2>/dev/null)" ]; then git clone ${shellQuote(repo.cloneUrl)} ${qWorkdir}; else BACKUP=${qWorkdir}.prelink.$(date +%s) && mkdir -p "$BACKUP" && ( shopt -s dotglob nullglob && mv ${qWorkdir}/* "$BACKUP"/ ) && echo "moved pre-link contents to $BACKUP" && git clone ${shellQuote(repo.cloneUrl)} ${qWorkdir}; fi`,
  ].join(" && ");
  // git clone for medium repos can easily exceed the default 60s exec timeout.
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

/**
 * Headers that must never flow from the browser through mesh into the user
 * sandbox. The browser attaches the mesh session cookie to same-origin
 * requests; without this strip the daemon would see the caller's session.
 * Also covers hop-by-hop headers per RFC 7230.
 */
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
 * HTTP passthrough to the daemon. Caller passes the full daemon path
 * (e.g. `/_daemon/dev/status`). The browser's cookies + auth header are
 * dropped and replaced with the bearer. Returns the native `Response` so the
 * body streams through without buffering.
 *
 * `signal` must be the client's AbortSignal (e.g. `c.req.raw.signal` in
 * Hono). For long-lived streams — especially SSE — the browser closing the
 * connection has to cascade all the way to the daemon so it can drop the
 * subscriber.
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
