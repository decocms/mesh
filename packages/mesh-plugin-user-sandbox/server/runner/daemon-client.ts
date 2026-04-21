/**
 * Wire-protocol helpers for the sandbox daemon's HTTP API.
 *
 * Pure functions parameterised by `(daemonUrl, token, …)` — no class state,
 * no docker CLI. Reusable from any runner (docker, k8s, freestyle…) that
 * targets the same daemon image, and mirrors the module split on the
 * container side under `image/daemon/*`.
 */

import * as net from "node:net";
import type { IncomingHttpHeaders } from "node:http";
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

/** POST /bash — run a shell command inside the container. */
export async function daemonBash(
  daemonUrl: string,
  token: string,
  input: ExecInput,
): Promise<ExecOutput> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
  const response = await fetch(`${daemonUrl}/bash`, {
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
      `sandbox daemon /bash returned ${response.status}${body ? `: ${body}` : ""}`,
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
  // `shopt -s dotglob nullglob` lets the glob expand to dotfiles and to
  // nothing when the dir is empty, so `mv` never sees `*` literally.
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
 * HTTP passthrough to the daemon — the caller's bearer is overwritten with
 * ours and hop-by-hop headers are dropped. Returns the native `Response` so
 * the body streams through without buffering.
 */
export async function proxyDaemonRequest(
  daemonUrl: string,
  token: string,
  path: string,
  init: { method: string; headers: Headers; body: BodyInit | null },
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("accept-encoding");
  headers.delete("content-length");
  const hasBody = init.method !== "GET" && init.method !== "HEAD";
  const target = `${daemonUrl}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(target, {
    method: init.method,
    headers,
    body: hasBody ? init.body : undefined,
    redirect: "manual",
    // @ts-expect-error Bun/Undici-only: allow streaming request body.
    duplex: hasBody ? "half" : undefined,
  });
}

/**
 * Raw TCP upgrade to the daemon with bearer attached. Caller pipes bytes
 * to/from the browser socket. We write the HTTP/1.1 request line by hand
 * instead of using `http.request` so the upstream socket is ours from before
 * the 101 handshake — needed to forward the full response verbatim.
 */
export async function openDaemonUpgrade(
  daemonUrl: string,
  token: string,
  path: string,
  clientHeaders: IncomingHttpHeaders | Headers,
): Promise<net.Socket> {
  const daemonHost = new URL(daemonUrl);
  const socket = net.connect(
    Number(daemonHost.port || 80),
    daemonHost.hostname,
  );
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", reject);
  });

  const headers: Record<string, string> = {};
  if (clientHeaders instanceof Headers) {
    clientHeaders.forEach((value, key) => {
      headers[key] = value;
    });
  } else {
    for (const [k, v] of Object.entries(clientHeaders)) {
      if (v == null) continue;
      // Multi-value headers collapse to last-wins in a Record.
      for (const vv of Array.isArray(v) ? v : [v]) headers[k] = vv;
    }
  }
  // Overwrite the client's host/auth with ours — the daemon only accepts
  // bearer auth and must see its own loopback host in the Host header.
  headers["host"] = `127.0.0.1:${daemonHost.port}`;
  headers["authorization"] = `Bearer ${token}`;

  const lines = [`GET ${path.startsWith("/") ? path : `/${path}`} HTTP/1.1`];
  for (const [k, v] of Object.entries(headers)) {
    lines.push(`${k}: ${v}`);
  }
  lines.push("", "");
  socket.write(lines.join("\r\n"));
  return socket;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
