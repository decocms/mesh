import type { SandboxId } from "./types";

/**
 * Record persisted per (sandboxId, runnerKind). The `state` blob is opaque —
 * each runner serialises its own private fields (tokens, ports, domains) and
 * reads them back after a mesh restart.
 */
export interface RunnerStateRecord {
  handle: string;
  state: Record<string, unknown>;
  updatedAt: Date;
}

/**
 * Record returned by `getByHandle` — also carries the SandboxId so the runner
 * can rebuild its in-memory record after a mesh restart when only the handle
 * is known (e.g. mesh-proxy lookups from a URL param).
 */
export interface RunnerStateRecordWithId extends RunnerStateRecord {
  id: SandboxId;
}

export interface RunnerStatePut {
  handle: string;
  state: Record<string, unknown>;
}

/**
 * Pluggable persistence for sandbox runner state. Host apps supply a concrete
 * implementation (e.g. Kysely-backed) and inject it into runners that need
 * cross-restart recovery. Keep this interface storage-agnostic so the sandbox
 * package stays free of database dependencies.
 */
export interface RunnerStateStore {
  get(id: SandboxId, kind: string): Promise<RunnerStateRecord | null>;
  getByHandle(
    kind: string,
    handle: string,
  ): Promise<RunnerStateRecordWithId | null>;
  put(id: SandboxId, kind: string, entry: RunnerStatePut): Promise<void>;
  delete(id: SandboxId, kind: string): Promise<void>;
  deleteByHandle(kind: string, handle: string): Promise<void>;
  /**
   * Serialize concurrent `ensure()` calls for the same (id, kind) across
   * every pod sharing this store. Implementations should take a lock keyed
   * on `(id.userId, id.projectRef, kind)`, run `fn`, and release the lock
   * when `fn` settles. The lock auto-releases on connection loss so a
   * crashed pod never strands a sandbox.
   *
   * Optional: in-memory / test state stores can omit it. Runners check for
   * the method and fall back to in-process-only dedupe when absent, which
   * is correct single-pod behavior but still leaks containers under
   * multi-pod races — so production deploys MUST use a store that
   * implements this.
   */
  withLock?<T>(id: SandboxId, kind: string, fn: () => Promise<T>): Promise<T>;
}
