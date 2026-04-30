import type { BootstrapPayload } from "./persistence";
import type { PackageManager, Runtime, TenantConfig } from "./types";

export function tenantConfigFromBootstrap(
  payload: BootstrapPayload,
): TenantConfig {
  const runtime = payload.runtime as Runtime;
  const pathPrefix =
    runtime === "bun"
      ? "export PATH=/opt/bun/bin:$PATH && "
      : runtime === "deno"
        ? "export PATH=/opt/deno/bin:$PATH && "
        : "";

  return Object.freeze({
    cloneUrl: payload.cloneUrl ?? null,
    repoName: payload.repoName ?? null,
    branch: payload.branch ?? null,
    gitUserName: payload.gitUserName ?? null,
    gitUserEmail: payload.gitUserEmail ?? null,
    packageManager: (payload.packageManager ?? null) as PackageManager | null,
    devPort: payload.devPort ?? 3000,
    runtime,
    pathPrefix,
    env: Object.freeze({ ...(payload.env ?? {}) }),
  });
}
