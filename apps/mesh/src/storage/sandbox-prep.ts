/**
 * Sandbox Prep Storage
 *
 * Tracks baked Docker images that carry a cloned repo + installed deps so new
 * thread containers can boot from them instead of redoing clone + install.
 *
 * One row per (user, canonical_clone_url). The `lockfile_hash` reflects the
 * last successful bake — the runner checks it at provision time and, if the
 * repo's current lockfile differs, re-enqueues the bake while the current
 * thread falls back to the slow path.
 *
 * `clone_url` is stored unauthenticated so the row identity is stable across
 * OAuth-token refreshes. `(repo_owner, repo_name, connection_id)` lets the
 * worker re-mint an authenticated URL at bake time via `buildCloneInfo()`.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { createHash } from "node:crypto";
import type { Database, SandboxPrepStatus } from "./types";

export interface SandboxPrep {
  prepKey: string;
  userId: string;
  cloneUrl: string;
  repoOwner: string;
  repoName: string;
  connectionId: string;
  lockfileHash: string | null;
  headSha: string | null;
  status: SandboxPrepStatus;
  imageTag: string | null;
  error: string | null;
  installCommand: string | null;
  claimedAt: Date | null;
  lastUsedAt: Date;
  updatedAt: Date;
}

export interface EnqueuePrepInput {
  userId: string;
  cloneUrl: string;
  repoOwner: string;
  repoName: string;
  connectionId: string;
  /** Best-effort install command (e.g. `bun install`). Worker may override. */
  installCommand?: string | null;
}

export interface MarkReadyInput {
  imageTag: string;
  lockfileHash: string | null;
  headSha: string | null;
  installCommand: string | null;
}

/**
 * Stale-claim threshold. A row left in `'baking'` beyond this is assumed to
 * belong to a dead worker and may be reclaimed. Picked to comfortably outlive
 * a typical clone + install run.
 */
const BAKE_STALE_MS = 15 * 60_000;

export interface SandboxPrepStorage {
  /** Lookup a row by its deterministic prep_key. */
  get(prepKey: string): Promise<SandboxPrep | null>;
  /** Lookup by (userId, unauthenticated cloneUrl). */
  findByUserClone(
    userId: string,
    cloneUrl: string,
  ): Promise<SandboxPrep | null>;
  /** All rows currently in `baking`. Used for worker-startup reconciliation. */
  listBaking(): Promise<SandboxPrep[]>;
  /**
   * Enqueue a bake for this (user, repo). Idempotent:
   *  - no row → insert `pending`.
   *  - existing `ready`/`failed`/`stale` → reset to `pending` so the worker
   *    picks it up again (used when the user re-links a repo or explicitly
   *    asks for a refresh).
   *  - existing `pending`/`baking` → leave untouched.
   */
  enqueue(input: EnqueuePrepInput): Promise<SandboxPrep>;
  /**
   * Atomically claim the next bakeable row. Uses `FOR UPDATE SKIP LOCKED` so
   * multiple workers on different processes never pick the same row.
   * Reclaims rows stuck in `'baking'` past {@link BAKE_STALE_MS}.
   */
  claimNext(): Promise<SandboxPrep | null>;
  /** Flip a claimed row to `ready` with the baked image tag. */
  markReady(prepKey: string, input: MarkReadyInput): Promise<void>;
  /** Flip a claimed row to `failed`; keeps the row for debugging. */
  markFailed(prepKey: string, error: string): Promise<void>;
  /** Touch `last_used_at` — called every time the runner spawns a thread. */
  touchUsed(prepKey: string): Promise<void>;
}

/** Deterministic key — collision-resistant within one mesh deployment. */
function sandboxPrepKey(userId: string, cloneUrl: string): string {
  return createHash("sha256")
    .update(`${userId}\u0000${cloneUrl}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Strip userinfo (`https://user:token@host/...` → `https://host/...`) so the
 * URL is a stable identity regardless of token rotation. Idempotent for URLs
 * that already lack userinfo.
 */
function canonicalizeCloneUrl(cloneUrl: string): string {
  try {
    const u = new URL(cloneUrl);
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return cloneUrl;
  }
}

type Row = {
  prep_key: string;
  user_id: string;
  clone_url: string;
  repo_owner: string;
  repo_name: string;
  connection_id: string;
  lockfile_hash: string | null;
  head_sha: string | null;
  status: SandboxPrepStatus;
  image_tag: string | null;
  error: string | null;
  install_command: string | null;
  claimed_at: Date | string | null;
  last_used_at: Date | string;
  updated_at: Date | string;
};

function toEntity(row: Row): SandboxPrep {
  return {
    prepKey: row.prep_key,
    userId: row.user_id,
    cloneUrl: row.clone_url,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    connectionId: row.connection_id,
    lockfileHash: row.lockfile_hash,
    headSha: row.head_sha,
    status: row.status,
    imageTag: row.image_tag,
    error: row.error,
    installCommand: row.install_command,
    claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
    lastUsedAt: new Date(row.last_used_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class KyselySandboxPrepStorage implements SandboxPrepStorage {
  constructor(private db: Kysely<Database>) {}

  async get(prepKey: string): Promise<SandboxPrep | null> {
    const row = await this.db
      .selectFrom("sandbox_prep")
      .selectAll()
      .where("prep_key", "=", prepKey)
      .executeTakeFirst();
    return row ? toEntity(row as Row) : null;
  }

  async findByUserClone(
    userId: string,
    cloneUrl: string,
  ): Promise<SandboxPrep | null> {
    const canonical = canonicalizeCloneUrl(cloneUrl);
    const row = await this.db
      .selectFrom("sandbox_prep")
      .selectAll()
      .where("user_id", "=", userId)
      .where("clone_url", "=", canonical)
      .executeTakeFirst();
    return row ? toEntity(row as Row) : null;
  }

  async listBaking(): Promise<SandboxPrep[]> {
    const rows = await this.db
      .selectFrom("sandbox_prep")
      .selectAll()
      .where("status", "=", "baking")
      .execute();
    return rows.map((r) => toEntity(r as Row));
  }

  async enqueue(input: EnqueuePrepInput): Promise<SandboxPrep> {
    const canonical = canonicalizeCloneUrl(input.cloneUrl);
    const prepKey = sandboxPrepKey(input.userId, canonical);
    const now = new Date().toISOString();
    // Two-phase idempotent upsert:
    //   1. ON CONFLICT DO NOTHING to either insert a fresh pending row or
    //      leave the existing row alone.
    //   2. If it was already there, only revive terminal rows ('ready',
    //      'failed', 'stale') back to 'pending' — a currently-running bake
    //      (status 'pending' or 'baking') is left untouched.
    // Using two statements keeps Kysely's type checker happy without
    // dropping to raw SQL for the CASE/WHEN revival logic.
    await this.db
      .insertInto("sandbox_prep")
      .values({
        prep_key: prepKey,
        user_id: input.userId,
        clone_url: canonical,
        repo_owner: input.repoOwner,
        repo_name: input.repoName,
        connection_id: input.connectionId,
        lockfile_hash: null,
        head_sha: null,
        status: "pending",
        image_tag: null,
        error: null,
        install_command: input.installCommand ?? null,
        claimed_at: null,
        last_used_at: now,
        updated_at: now,
      })
      .onConflict((oc) => oc.column("prep_key").doNothing())
      .execute();

    await this.db
      .updateTable("sandbox_prep")
      .set({
        status: "pending",
        error: null,
        // Connection id can rotate if the user disconnects and reconnects
        // github; we update it so the worker minting a token uses the
        // current connection.
        connection_id: input.connectionId,
        install_command: input.installCommand ?? null,
        updated_at: now,
      })
      .where("prep_key", "=", prepKey)
      .where("status", "in", ["ready", "failed", "stale"])
      .execute();

    const row = await this.db
      .selectFrom("sandbox_prep")
      .selectAll()
      .where("prep_key", "=", prepKey)
      .executeTakeFirstOrThrow();
    return toEntity(row as Row);
  }

  async claimNext(): Promise<SandboxPrep | null> {
    // Single-statement claim — atomic even across processes. The inner
    // SELECT locks just the target row, so concurrent workers don't contend
    // on a queue-wide scan.
    const result = await sql<Row>`
      UPDATE sandbox_prep
      SET status = 'baking',
          claimed_at = now(),
          updated_at = now(),
          error = NULL
      WHERE prep_key = (
        SELECT prep_key FROM sandbox_prep
        WHERE status = 'pending'
           OR (status = 'baking' AND claimed_at < now() - make_interval(secs => ${
             BAKE_STALE_MS / 1000
           }))
        ORDER BY updated_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `.execute(this.db);
    const row = result.rows[0];
    return row ? toEntity(row) : null;
  }

  async markReady(prepKey: string, input: MarkReadyInput): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .updateTable("sandbox_prep")
      .set({
        status: "ready",
        image_tag: input.imageTag,
        lockfile_hash: input.lockfileHash,
        head_sha: input.headSha,
        install_command: input.installCommand,
        error: null,
        claimed_at: null,
        last_used_at: now,
        updated_at: now,
      })
      .where("prep_key", "=", prepKey)
      .execute();
  }

  async markFailed(prepKey: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .updateTable("sandbox_prep")
      .set({
        status: "failed",
        error,
        claimed_at: null,
        updated_at: now,
      })
      .where("prep_key", "=", prepKey)
      .execute();
  }

  async touchUsed(prepKey: string): Promise<void> {
    await this.db
      .updateTable("sandbox_prep")
      .set({ last_used_at: new Date().toISOString() })
      .where("prep_key", "=", prepKey)
      .execute();
  }
}
