export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";
export interface Runtime {
  name: "node" | "bun" | "deno";
  pathPrefix: string;
}

export interface BootConfig {
  readonly daemonToken: string;
  readonly daemonBootId: string;
  readonly appRoot: string;
  readonly proxyPort: number;
  readonly dropPrivileges: boolean;
}

interface GitIdentity {
  userName: string;
  userEmail: string;
}
interface GitConfig {
  repository: GitRepository;
  identity: GitIdentity | undefined;
}
interface GitRepository {
  cloneUrl: string;
  branch?: string;
  repoName?: string;
}

interface Application {
  packageManager: PackageManagerConfig;
  developmentServer: DevelopmentServer;
  runtime: Runtime;
}

interface DevelopmentServer {
  port?: number;
  running: boolean;
}

export interface PackageManagerConfig {
  name: PackageManager;
  path: string | undefined;
}

export interface TenantConfig {
  readonly git: GitConfig | undefined;
  readonly application: Application | undefined;
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
