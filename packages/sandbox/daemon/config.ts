import type { CloneDepth, Config, PackageManager, Runtime } from "./types";

const BRANCH_RE = /^[A-Za-z0-9._/-]+$/;
const PACKAGE_MANAGERS: readonly PackageManager[] = [
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "deno",
];
const RUNTIMES: readonly Runtime[] = ["node", "bun", "deno"];

export function loadConfig(env: Record<string, string | undefined>): Config {
  const daemonToken = env.DAEMON_TOKEN;
  if (!daemonToken || daemonToken.length < 32) {
    throw new Error("DAEMON_TOKEN is required and must be ≥ 32 chars");
  }

  const daemonBootId = env.DAEMON_BOOT_ID;
  if (!daemonBootId || daemonBootId.length === 0) {
    throw new Error("DAEMON_BOOT_ID is required");
  }

  const cloneUrl = env.CLONE_URL ?? null;
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

  const runtimeRaw = env.RUNTIME ?? "node";
  if (!RUNTIMES.includes(runtimeRaw as Runtime)) {
    throw new Error(`RUNTIME invalid: ${runtimeRaw}`);
  }
  const runtime = runtimeRaw as Runtime;

  const devPort = parseInt(env.DEV_PORT ?? "3000", 10);
  if (!Number.isFinite(devPort) || devPort <= 0) {
    throw new Error(`DEV_PORT invalid: ${env.DEV_PORT}`);
  }

  const proxyPort = parseInt(env.PROXY_PORT ?? "9000", 10);
  if (!Number.isFinite(proxyPort) || proxyPort <= 0) {
    throw new Error(`PROXY_PORT invalid: ${env.PROXY_PORT}`);
  }

  const appRoot = env.APP_ROOT ?? "/app";

  const pathPrefix =
    runtime === "bun"
      ? "export PATH=/opt/bun/bin:$PATH && "
      : runtime === "deno"
        ? "export PATH=/opt/deno/bin:$PATH && "
        : "";

  const cloneDepthRaw = env.CLONE_DEPTH ?? "shallow";
  if (cloneDepthRaw !== "shallow" && cloneDepthRaw !== "full") {
    throw new Error(`CLONE_DEPTH invalid: ${cloneDepthRaw}`);
  }
  const cloneDepth = cloneDepthRaw as CloneDepth;

  return Object.freeze({
    daemonToken,
    daemonBootId,
    cloneUrl,
    repoName,
    branch,
    gitUserName,
    gitUserEmail,
    packageManager: (pm ?? null) as PackageManager | null,
    devPort,
    runtime,
    appRoot,
    proxyPort,
    pathPrefix,
    cloneDepth,
  });
}
