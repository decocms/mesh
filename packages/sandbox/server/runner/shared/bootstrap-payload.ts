/**
 * Bootstrap payload + handshake helper shared across HTTP-bootstrapped runners.
 *
 * The unified daemon's tenant config (clone URL, runtime, dev port, env)
 * arrives via `POST /_decopilot_vm/bootstrap`. Boot config (token, bootId,
 * appRoot, proxyPort) comes from env at process startup — see
 * `packages/sandbox/daemon/config.ts:loadBootConfigFromEnv`. This module
 * encapsulates the post-spawn handshake (HTTP-up → POST → ready) so each
 * runner contributes only the inputs that vary by environment.
 *
 * Why a shared helper: host, docker, and freestyle runners differ in *how*
 * the daemon process is reached (child process port, container port, public
 * domain) but the handshake itself is identical. agent-sandbox uses the same
 * helpers with extra retry/recovery logic and stays inline.
 */

import { randomUUID } from "node:crypto";
import {
  type BootstrapPayload,
  type DaemonProbeFn,
  daemonBootstrap,
  waitForDaemonHttp,
  waitForDaemonReady,
} from "../../daemon-client";
import type { EnsureOptions } from "../types";

/**
 * Inputs the runner must supply that aren't carried on `EnsureOptions`.
 * `daemonToken` is what mesh stamped into the daemon's env at spawn — the
 * payload field is currently inert (the daemon reads its token from env)
 * but is included for forward-compat with agent-sandbox.
 */
export interface BootstrapInputs {
  /** Mesh-side per-claim nonce; opaque to the daemon today. */
  claimNonce?: string;
  /** Bearer token the daemon validates from env. */
  daemonToken: string;
  /** Path the daemon treats as the project root. */
  workdir: string;
  /** Dev-server port hint; the daemon's port-discovery may override. */
  devPort: number;
}

/**
 * Compose the bootstrap payload from `EnsureOptions` + per-runner inputs.
 * Mirrors the agent-sandbox builder — keep them in sync until the dead
 * fields (`claimNonce`, `daemonToken`, `appRoot`) are removed from the
 * shared `BootstrapPayload` type.
 */
export function buildBootstrapPayload(
  opts: EnsureOptions,
  inputs: BootstrapInputs,
): BootstrapPayload {
  const repo = opts.repo ?? null;
  const repoLabel = repo
    ? (repo.displayName ?? deriveRepoLabel(repo.cloneUrl))
    : null;
  const runtime = opts.workload?.runtime ?? "node";
  return {
    schemaVersion: 1,
    claimNonce: inputs.claimNonce ?? randomUUID(),
    daemonToken: inputs.daemonToken,
    runtime,
    ...(repo
      ? {
          cloneUrl: repo.cloneUrl,
          repoName: repoLabel ?? "",
          branch: repo.branch ?? "",
          gitUserName: repo.userName,
          gitUserEmail: repo.userEmail,
        }
      : {}),
    ...(opts.workload?.packageManager
      ? { packageManager: opts.workload.packageManager }
      : {}),
    devPort: inputs.devPort,
    appRoot: inputs.workdir,
    ...(opts.env && Object.keys(opts.env).length > 0 ? { env: opts.env } : {}),
  };
}

/**
 * Wait for the daemon HTTP server to bind, POST the bootstrap payload, then
 * wait for `phase === "ready"`. Throws on any step's timeout — caller is
 * responsible for tearing down the spawned daemon/container/VM on failure.
 *
 * `bootstrapFn` and `probe` are seams so tests can stub network calls
 * without mocking `fetch` globally; production callers leave them default.
 *
 * `httpTimeoutMs` overrides the default `waitForDaemonHttp` budget. Use for
 * environments where the daemon's HTTP listener takes longer than the
 * default 5s to come up (e.g. freestyle VM cold start).
 */
export async function bootstrapAndWaitReady(
  daemonUrl: string,
  payload: BootstrapPayload,
  opts: {
    bootstrapFn?: typeof daemonBootstrap;
    probe?: DaemonProbeFn;
    signal?: AbortSignal;
    httpTimeoutMs?: number;
  } = {},
): Promise<{ bootId: string; hash: string }> {
  await waitForDaemonHttp(daemonUrl, {
    probe: opts.probe,
    timeoutMs: opts.httpTimeoutMs,
  });
  const fn = opts.bootstrapFn ?? daemonBootstrap;
  const resp = await fn(daemonUrl, payload, opts.signal);
  await waitForDaemonReady(daemonUrl, { probe: opts.probe });
  return { bootId: resp.bootId, hash: resp.hash };
}

/**
 * Best-effort human label for a clone URL — last path segment minus `.git`,
 * falling back to the hostname or the raw URL on parse failure. Pure; no
 * side effects. Duplicated previously across all four runners.
 */
function deriveRepoLabel(cloneUrl: string): string {
  try {
    const u = new URL(cloneUrl);
    const trimmed = u.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    return trimmed || u.hostname;
  } catch {
    return cloneUrl;
  }
}
