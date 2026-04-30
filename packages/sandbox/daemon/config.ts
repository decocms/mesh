import type {
  BootConfig,
  PackageManager,
  Runtime,
  TenantConfig,
} from "./types";

const BRANCH_RE = /^[A-Za-z0-9._/-]+$/;
const PACKAGE_MANAGERS: readonly PackageManager[] = [
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "deno",
];
const RUNTIMES: readonly Runtime[] = ["node", "bun", "deno"];

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

// Returns null when env doesn't carry tenant material (the new normal:
// tenant config arrives via POST /_decopilot_vm/bootstrap). Returns a
// TenantConfig when env supplies repo+runtime info — preserves the docker
// runner's env-injection path and lets dev/test seed a daemon without
// going through the bootstrap route.
export function tryLoadTenantConfigFromEnv(
  env: Record<string, string | undefined>,
): TenantConfig | null {
  const cloneUrl = env.CLONE_URL ?? null;
  const runtimeRaw = env.RUNTIME;
  const devPortRaw = env.DEV_PORT;
  const pmRaw = env.PACKAGE_MANAGER;

  // Any explicit tenant signal triggers env-driven tenant config. Without
  // one of these the daemon stays in pending-bootstrap and waits for a
  // POST /_decopilot_vm/bootstrap.
  if (!cloneUrl && !runtimeRaw && !devPortRaw && !pmRaw) return null;

  const runtime = (runtimeRaw ?? "node") as Runtime;
  if (!RUNTIMES.includes(runtime)) {
    throw new Error(`RUNTIME invalid: ${runtimeRaw}`);
  }

  const repoName = env.REPO_NAME ?? null;
  const branch = env.BRANCH ?? null;
  const gitUserName = env.GIT_USER_NAME ?? null;
  const gitUserEmail = env.GIT_USER_EMAIL ?? null;

  if (cloneUrl) {
    if (!repoName)
      throw new Error("REPO_NAME is required when CLONE_URL is set");
    if (!branch || !BRANCH_RE.test(branch) || branch.startsWith("-")) {
      throw new Error(`BRANCH invalid: ${branch}`);
    }
    if (!gitUserName)
      throw new Error("GIT_USER_NAME is required when CLONE_URL is set");
    if (!gitUserEmail)
      throw new Error("GIT_USER_EMAIL is required when CLONE_URL is set");
  }

  const pm = env.PACKAGE_MANAGER ?? null;
  if (pm !== null && !PACKAGE_MANAGERS.includes(pm as PackageManager)) {
    throw new Error(`PACKAGE_MANAGER invalid: ${pm}`);
  }

  const devPort = parseInt(env.DEV_PORT ?? "3000", 10);
  if (!Number.isFinite(devPort) || devPort <= 0) {
    throw new Error(`DEV_PORT invalid: ${env.DEV_PORT}`);
  }

  const pathPrefix =
    runtime === "bun"
      ? "export PATH=/opt/bun/bin:$PATH && "
      : runtime === "deno"
        ? "export PATH=/opt/deno/bin:$PATH && "
        : "";

  return Object.freeze({
    cloneUrl,
    repoName,
    branch,
    gitUserName,
    gitUserEmail,
    packageManager: (pm ?? null) as PackageManager | null,
    devPort,
    runtime,
    pathPrefix,
    env: Object.freeze({}),
  });
}
