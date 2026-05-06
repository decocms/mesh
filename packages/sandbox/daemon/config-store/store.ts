import { existsSync } from "node:fs";
import { join } from "node:path";
import { writeConfig } from "../persistence";
import type { EnrichedTenantConfig, TenantConfig } from "../types";
import { validateTenantConfig } from "../validate";
import { classify } from "./classify";
import { enrich } from "./derive";
import { deepMerge } from "./merge";
import { REJECTION_REASONS, type ApplyEvent, type ApplyResult } from "./types";

export interface TenantConfigStoreDeps {
  /** Repo directory. Config is written to <storageDir>/.decocms/daemon.json. */
  storageDir: string;
}

interface QueueEntry {
  patch: Partial<TenantConfig>;
  resolve: (r: ApplyResult) => void;
}

/**
 * Single-writer store for tenant config.
 *
 * - In-memory state is the source of truth for *reads*.
 * - Disk (`.decocms/daemon.json`) is the durable source of truth — every successful
 *   write fsyncs the merged result before mutating memory.
 * - All mutations go through `apply()`. An internal FIFO worker drains
 *   pending applies one at a time, so two concurrent PUT /config requests
 *   compose deterministically (last write wins on the same field).
 * - `subscribe()` listeners run synchronously inside the worker after each
 *   applied change. Subscribers must return immediately — slow handlers
 *   stall the queue.
 */
export class TenantConfigStore {
  private current: EnrichedTenantConfig | null = null;
  private readonly subscribers = new Set<(e: ApplyEvent) => void>();
  private readonly queue: QueueEntry[] = [];
  private draining = false;

  constructor(private readonly deps: TenantConfigStoreDeps) {}

  read(): EnrichedTenantConfig | null {
    return this.current;
  }

  /**
   * Bootstrap the in-memory state from a value already on disk (or seeded
   * from env). Does NOT classify, persist, or notify subscribers — purely
   * loads memory. Used once during daemon boot.
   */
  hydrate(config: TenantConfig): void {
    this.current = enrich(config);
  }

  /**
   * Drop in-memory state. Used on orchestrator failure to reset to
   * "awaiting fresh bootstrap." Does NOT delete .decocms/daemon.json — caller is
   * responsible for that if needed.
   */
  clear(): void {
    this.current = null;
  }

  apply(patch: Partial<TenantConfig>): Promise<ApplyResult> {
    return new Promise((resolve) => {
      this.queue.push({ patch, resolve });
      void this.drain();
    });
  }

  subscribe(fn: (e: ApplyEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const entry = this.queue.shift();
        if (!entry) break;
        try {
          entry.resolve(await this.runOne(entry.patch));
        } catch {
          entry.resolve({
            kind: "rejected",
            reason: REJECTION_REASONS.APPLY_FAILED,
          });
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async runOne(patch: Partial<TenantConfig>): Promise<ApplyResult> {
    const before = this.current ? plainConfig(this.current) : null;
    const merged = deepMerge(before, patch);

    const validation = validateTenantConfig(merged);
    if (validation.kind === "invalid") {
      return { kind: "rejected", reason: REJECTION_REASONS.INVALID };
    }

    const transition = classify(before, merged);
    if (transition.kind === "identity-conflict") {
      return {
        kind: "rejected",
        reason: REJECTION_REASONS.IMMUTABLE,
        detail: transition.field,
      };
    }

    if (transition.kind === "no-op") {
      return {
        kind: "applied",
        before,
        after: merged,
        transition,
      };
    }

    if (existsSync(join(this.deps.storageDir, ".git"))) {
      try {
        writeConfig(merged, this.deps.storageDir);
      } catch {
        return {
          kind: "rejected",
          reason: REJECTION_REASONS.PERSISTENCE_FAILED,
        };
      }
    }

    this.current = enrich(merged);

    const event: ApplyEvent = { before, after: merged, transition };
    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch {
        /* one bad subscriber does not stall the queue */
      }
    }

    return {
      kind: "applied",
      before,
      after: merged,
      transition,
    };
  }
}

/** Strip in-memory derived fields when reading "before" out of state. */
function plainConfig(enriched: EnrichedTenantConfig): TenantConfig {
  return {
    git: enriched.git,
    application: enriched.application,
  };
}
