export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";
export type RuntimeName = "node" | "bun" | "deno";

/** Runtime-derived adornment, never persisted to disk. */
export interface DerivedRuntime {
  readonly name: RuntimeName;
  readonly pathPrefix: string;
}

export interface BootConfig {
  readonly daemonToken: string;
  readonly daemonBootId: string;
  /**
   * Workspace root. Contains `app/` (the cloned repo), `daemon/` (config
   * + persistence), and `tmp/` (log tees). fs/bash routes are clamped here
   * so the LLM can read/mutate everything inside the workspace.
   */
  readonly appRoot: string;
  /** `<appRoot>/repo` — cwd for git, install, dev script, scripts. */
  readonly repoDir: string;
  readonly proxyPort: number;
  readonly dropPrivileges?: boolean;
}

export interface GitIdentity {
  readonly userName: string;
  readonly userEmail: string;
}

export interface GitRepository {
  readonly cloneUrl: string;
  readonly branch?: string;
  readonly repoName?: string;
}

export interface GitConfig {
  readonly repository: GitRepository;
  readonly identity?: GitIdentity;
}

export interface PackageManagerConfig {
  readonly name: PackageManager;
  readonly path?: string;
}

/**
 * What the proxy currently forwards to. Last-writer-wins between tenant
 * (explicit override via PUT /config) and the daemon's port probe. The
 * probe always reasserts to the current dev process's bound port, so a
 * tenant override is sticky only until the next dev (re)start observes a
 * different port.
 */
export interface ProxyConfig {
  readonly targetPort?: number;
}

/**
 * Tenant intent for the managed dev server.
 *
 * - "running": the daemon installs deps if needed and keeps the dev script
 *   alive. If the dev script exits non-zero, intent flips to "paused"
 *   automatically (failure is sticky — tenant must re-set "running" to
 *   retry).
 * - "paused": the daemon does not auto-start anything.
 */
export type ApplicationIntent = "running" | "paused";

export interface Application {
  readonly packageManager: PackageManagerConfig;
  readonly runtime: RuntimeName;
  readonly intent: ApplicationIntent;
  /** PORT env hint for the dev script. Daemon picks a default if unset. */
  readonly desiredPort?: number;
  readonly proxy: ProxyConfig;
}

/**
 * User-intent state for a sandboxed application. Persisted in
 * `<configDir>/config.json`. Derived fields (e.g. runtime pathPrefix,
 * proxy probe state) live in memory and are never persisted.
 */
export interface TenantConfig {
  readonly git?: GitConfig;
  readonly application?: Application;
}

/** In-memory enriched view: TenantConfig + derivations. */
export interface EnrichedTenantConfig extends TenantConfig {
  /** Computed from `application.runtime`. */
  readonly runtimePathPrefix: string;
}

/** What the rest of the daemon (orchestrator, routes) sees. */
export type Config = BootConfig & EnrichedTenantConfig;

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
