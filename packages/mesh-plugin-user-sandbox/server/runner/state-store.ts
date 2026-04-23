import type { SandboxId } from "./types";

/** Persisted per (sandboxId, runnerKind). `state` is an opaque runner-private blob. */
export interface RunnerStateRecord {
  handle: string;
  state: Record<string, unknown>;
  updatedAt: Date;
}

/** Like RunnerStateRecord but carries the SandboxId (handle-only lookups after restart). */
export interface RunnerStateRecordWithId extends RunnerStateRecord {
  id: SandboxId;
}

export interface RunnerStatePut {
  handle: string;
  state: Record<string, unknown>;
}

/** Pluggable persistence; storage-agnostic so this package stays DB-free. */
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
   * Cross-pod serialization for concurrent `ensure()` on the same (id, kind).
   * Must transactionally release on connection loss so a crashed pod never
   * strands a sandbox. Optional in tests; prod deploys MUST implement it.
   */
  withLock?<T>(id: SandboxId, kind: string, fn: () => Promise<T>): Promise<T>;
}
