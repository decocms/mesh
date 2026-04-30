import type { BootstrapPayload } from "./persistence";
import type { Config, PackageManager, Runtime } from "./types";

export function configFromBootstrap(
  payload: BootstrapPayload,
  daemonBootId: string,
): Config {
  const runtime = payload.runtime as Runtime;
  const pathPrefix =
    runtime === "bun"
      ? "export PATH=/opt/bun/bin:$PATH && "
      : runtime === "deno"
        ? "export PATH=/opt/deno/bin:$PATH && "
        : "";

  const proxyPort = parseInt(process.env.PROXY_PORT ?? "9000", 10);

  return Object.freeze({
    daemonToken: payload.daemonToken,
    daemonBootId,
    cloneUrl: payload.cloneUrl ?? null,
    repoName: payload.repoName ?? null,
    branch: payload.branch ?? null,
    gitUserName: payload.gitUserName ?? null,
    gitUserEmail: payload.gitUserEmail ?? null,
    packageManager: (payload.packageManager ?? null) as PackageManager | null,
    devPort: payload.devPort ?? 3000,
    runtime,
    appRoot: payload.appRoot ?? "/app",
    proxyPort,
    pathPrefix,
  });
}
