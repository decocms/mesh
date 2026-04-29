export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";
export type Runtime = "node" | "bun" | "deno";

export interface Config {
  readonly daemonToken: string;
  readonly daemonBootId: string;
  readonly cloneUrl: string | null;
  readonly repoName: string | null;
  readonly branch: string | null;
  readonly gitUserName: string | null;
  readonly gitUserEmail: string | null;
  readonly packageManager: PackageManager | null;
  readonly devPort: number;
  readonly runtime: Runtime;
  readonly appRoot: string;
  readonly proxyPort: number;
  /** Derived from `runtime`; e.g. "export PATH=/opt/bun/bin:$PATH && " when bun. */
  readonly pathPrefix: string;
  /**
   * Root of the shared cache volume (e.g. /mnt/cache). The daemon derives
   * all sub-directories from this single value and injects the corresponding
   * package-manager env vars into every subprocess it spawns. Null = no cache.
   */
  readonly cacheDir: string | null;
  /** Root dir for git reference mirrors. Derived from cacheDir unless overridden. */
  readonly gitCacheDir: string | null;
  /**
   * Stable hash of (userId, projectRef) injected by the runner. Used to key
   * the per-user-branch .next/cache directory on the shared PVC. Null when
   * cache is disabled or the runner didn't provide the key.
   */
  readonly sandboxCacheKey: string | null;
  /** Base dir for shared node_modules on the PVC. Derived from cacheDir unless overridden. */
  readonly nodeModulesCacheDir: string | null;
  /** Base dir for per-sandbox Next.js webpack caches on the PVC. Derived from cacheDir unless overridden. */
  readonly nextCacheDir: string | null;
}

export interface BroadcastSource {
  /** "setup" | "daemon" | script name */
  readonly name: string;
}

export interface SseFrame {
  readonly event: string;
  readonly payload: string;
}

export interface BranchStatus {
  branch: string;
  base: string;
  workingTreeDirty: boolean;
  unpushed: number;
  aheadOfBase: number;
  behindBase: number;
  headSha: string;
}
