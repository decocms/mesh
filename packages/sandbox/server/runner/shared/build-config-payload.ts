import type { PackageManagerConfig, TenantConfig } from "../../../daemon/types";
import type { EnsureOptions } from "../types";

/**
 * Collapses caller intent into the daemon's TenantConfig shape. Intent
 * defaults to "running" when a packageManager is provided so the dev
 * server auto-starts after the orchestrator's clone+install completes.
 */
export function buildConfigPayload(args: {
  runtime: "node" | "bun" | "deno";
  packageManager: PackageManagerConfig | null;
  desiredPort?: number;
  repo: NonNullable<EnsureOptions["repo"]> | null;
}): Partial<TenantConfig> | null {
  const repo = args.repo;
  const git = repo
    ? {
        repository: {
          cloneUrl: repo.cloneUrl,
          repoName: repo.displayName ?? deriveRepoLabel(repo.cloneUrl),
          ...(repo.branch ? { branch: repo.branch } : {}),
        },
        identity: {
          userName: repo.userName,
          userEmail: repo.userEmail,
        },
      }
    : undefined;

  const packageManager = args.packageManager
    ? {
        name: args.packageManager.name,
        ...(args.packageManager.path ? { path: args.packageManager.path } : {}),
      }
    : undefined;

  const application = packageManager
    ? {
        packageManager,
        runtime: args.runtime,
        intent: "running" as const,
        ...(args.desiredPort !== undefined
          ? { desiredPort: args.desiredPort }
          : {}),
        proxy: {},
      }
    : undefined;

  if (!git && !application) return null;
  return {
    ...(git ? { git } : {}),
    ...(application ? { application } : {}),
  };
}

export function deriveRepoLabel(cloneUrl: string): string {
  try {
    const u = new URL(cloneUrl);
    const trimmed = u.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    return trimmed || u.hostname;
  } catch {
    return cloneUrl;
  }
}
