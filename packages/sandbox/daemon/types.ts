export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";
export type Runtime = "node" | "bun" | "deno";
export type CloneDepth = "shallow" | "full";

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
  /** "shallow" → `git clone --depth 1`; "full" → drop the flag. Default "shallow". */
  readonly cloneDepth: CloneDepth;
  /** When true, prepend `corepack enable` to the install command. Containers
   * ship with corepack; native host environments often don't, so the host
   * runner sets this false. */
  readonly useCorepack: boolean;
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
