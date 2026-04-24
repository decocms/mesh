/**
 * Dev-server control on the daemon's /_daemon/dev/* endpoints. Fire-and-
 * forget start (the daemon is idempotent); best-effort stop before teardown.
 *
 * Freestyle runs its dev server under systemd; these are not called there.
 */

import { proxyDaemonRequest } from "../../daemon-client";
import type { Workload } from "../types";

const DEV_START_TIMEOUT_MS = 30_000;

/**
 * Kick the daemon's dev server. When no workload hint is available the daemon
 * sniffs runtime/script from the workdir (package.json / deno.json) and picks
 * `dev` or `start`.
 */
export function startDevServer(
  daemonUrl: string,
  token: string,
  workload: Workload | null,
  logLabel: string,
): void {
  const body = workload ? JSON.stringify({ runtime: workload.runtime }) : "{}";
  proxyDaemonRequest(daemonUrl, token, "/_daemon/dev/start", {
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body,
    signal: AbortSignal.timeout(DEV_START_TIMEOUT_MS),
  }).catch((err) => {
    const isAbort = err instanceof Error && err.name === "AbortError";
    const detail = isAbort
      ? `timed out after ${DEV_START_TIMEOUT_MS}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    console.error(`[${logLabel}] /dev/start failed: ${detail}`);
  });
}

export async function stopDevServer(
  daemonUrl: string,
  token: string,
  logLabel: string,
): Promise<void> {
  await proxyDaemonRequest(daemonUrl, token, "/_daemon/dev/stop", {
    method: "POST",
    headers: new Headers(),
    body: null,
  }).catch((err) =>
    console.warn(
      `[${logLabel}] graceful dev-stop failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    ),
  );
}
