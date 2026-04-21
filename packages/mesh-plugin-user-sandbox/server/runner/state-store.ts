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
}
