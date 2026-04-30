import type { BootConfig } from "./types";

export function loadBootConfigFromEnv(
  env: Record<string, string | undefined>,
): BootConfig {
  const daemonToken = env.DAEMON_TOKEN;
  if (!daemonToken || daemonToken.length < 32) {
    throw new Error("DAEMON_TOKEN is required and must be ≥ 32 chars");
  }

  const daemonBootId = env.DAEMON_BOOT_ID;
  if (!daemonBootId || daemonBootId.length === 0) {
    throw new Error("DAEMON_BOOT_ID is required");
  }

  const proxyPort = parseInt(env.PROXY_PORT ?? "9000", 10);
  if (!Number.isFinite(proxyPort) || proxyPort <= 0) {
    throw new Error(`PROXY_PORT invalid: ${env.PROXY_PORT}`);
  }

  const appRoot = env.APP_ROOT ?? "/app";
  const dropPrivileges = env.DAEMON_DROP_PRIVILEGES === "1";

  return Object.freeze({
    daemonToken,
    daemonBootId,
    appRoot,
    proxyPort,
    dropPrivileges,
  });
}
