export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";
export type Runtime = "node" | "bun" | "deno";

export interface BootConfig {
  readonly daemonToken: string;
  readonly daemonBootId: string;
  readonly appRoot: string;
  readonly proxyPort: number;
  readonly dropPrivileges: boolean;
}

export interface TenantConfig {
  readonly cloneUrl: string | null;
  readonly repoName: string | null;
  readonly branch: string | null;
  readonly gitUserName: string | null;
  readonly gitUserEmail: string | null;
  readonly packageManager: PackageManager | null;
  readonly devPort: number;
  readonly runtime: Runtime;
  readonly pathPrefix: string;
  readonly env: Readonly<Record<string, string>>;
}

export type Config = BootConfig & TenantConfig;

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
