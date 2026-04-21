/**
 * Sandbox Prep Worker
 *
 * Polls the `sandbox_prep` table for rows in `status='pending'` (or stuck
 * `baking`), claims one at a time via `FOR UPDATE SKIP LOCKED`, re-derives
 * an authenticated GitHub clone URL via `buildCloneInfo()`, and runs the
 * bake pipeline. On success/failure the row is updated with the image tag
 * or error text.
 *
 * Docker-only — no-op when `MESH_SANDBOX_RUNNER !== "docker"`. Bakes are
 * serialised per process: only one clone+install runs at a time. Multiple
 * mesh pods can run workers concurrently; the `SKIP LOCKED` claim ensures
 * no two workers take the same row.
 */

import type { Kysely } from "kysely";
import {
  bakePrepImage,
  prepImageExists,
  prepImageTag,
} from "mesh-plugin-user-sandbox/prep";
import {
  KyselySandboxPrepStorage,
  type SandboxPrep,
} from "@/storage/sandbox-prep";
import { buildCloneInfo } from "@/shared/github-clone-info";
import type { CredentialVault } from "@/encryption/credential-vault";
import type { Database } from "@/storage/types";

const DEFAULT_POLL_INTERVAL_MS = 2_000;
// Bakes are heavy (docker run + clone + install + warmup) but mostly I/O
// bound — registry fetches, disk I/O. Two in parallel roughly halves the
// queue drain time for a user who links several repos in quick succession,
// without overloading a typical dev machine. Override via the option below
// when baking on a beefier host.
const DEFAULT_MAX_CONCURRENCY = 2;

export interface PrepWorkerOptions {
  pollIntervalMs?: number;
  maxConcurrency?: number;
  log?: (line: string) => void;
}

export interface PrepWorker {
  stop(): Promise<void>;
}

export function startSandboxPrepWorker(
  db: Kysely<Database>,
  vault: CredentialVault,
  opts: PrepWorkerOptions = {},
): PrepWorker | null {
  if (process.env.MESH_SANDBOX_RUNNER !== "docker") return null;

  const log = opts.log ?? ((line) => console.log(line));
  const storage = new KyselySandboxPrepStorage(db);
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxConcurrency = Math.max(
    1,
    opts.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
  );

  let stopped = false;
  const activeBakes = new Set<Promise<void>>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(tick, delay);
    timer.unref?.();
  };

  // Reconcile on startup: a worker that dies between `docker commit` and
  // `markReady` leaves the row in `baking` with the image already on disk.
  // Before polling, find those and flip them to `ready` so the next thread
  // uses the cache instead of paying a full cold-start while the row sits
  // stale for 15 minutes.
  void reconcileOrphanedBakes(storage, log).catch((err) => {
    log(
      `[prep-worker] reconcile error: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  const tick = async () => {
    timer = null;
    if (stopped) return;
    // Drain the queue as far as our concurrency slot allows. `claimNext` uses
    // `FOR UPDATE SKIP LOCKED`, so each loop iteration grabs a distinct row
    // without cross-worker contention.
    while (!stopped && activeBakes.size < maxConcurrency) {
      let row;
      try {
        row = await storage.claimNext();
      } catch (err) {
        log(
          `[prep-worker] claim error: ${err instanceof Error ? err.message : String(err)}`,
        );
        break;
      }
      if (!row) break;
      const p: Promise<void> = runBake(storage, row, db, vault, log)
        .catch((err) => {
          log(
            `[prep-worker] unexpected error on ${row.prepKey}: ${err instanceof Error ? err.message : String(err)}`,
          );
        })
        .finally(() => {
          activeBakes.delete(p);
          // Kick the loop to pick up any backed-up work without waiting for
          // the next poll tick.
          schedule(0);
        });
      activeBakes.add(p);
    }
    schedule(pollIntervalMs);
  };

  schedule(pollIntervalMs);

  return {
    stop: async () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await Promise.allSettled(activeBakes);
    },
  };
}

/**
 * Scan `baking` rows and flip them to `ready` when the expected image is
 * already present on the local docker daemon. Covers the window where the
 * previous worker process committed the image but died before the DB write.
 * Safe to run repeatedly — rows without an image stay in `baking` and the
 * stale-reclaim path (`claimNext`) will re-bake them after BAKE_STALE_MS.
 */
async function reconcileOrphanedBakes(
  storage: KyselySandboxPrepStorage,
  log: (line: string) => void,
): Promise<void> {
  const rows = await storage.listBaking();
  for (const row of rows) {
    const tag = prepImageTag(row.prepKey);
    if (!(await prepImageExists(tag))) continue;
    await storage.markReady(row.prepKey, {
      imageTag: tag,
      lockfileHash: row.lockfileHash,
      headSha: row.headSha,
      installCommand: row.installCommand,
    });
    log(
      `[prep-worker] reconciled orphaned bake ${row.prepKey} → ${tag} (image already on disk)`,
    );
  }
}

async function runBake(
  storage: KyselySandboxPrepStorage,
  row: SandboxPrep,
  db: Kysely<Database>,
  vault: CredentialVault,
  log: (line: string) => void,
): Promise<void> {
  try {
    // Mint a fresh authenticated clone URL — the stored URL is canonical
    // (no token) so it remains a stable identity across token rotation.
    const info = await buildCloneInfo(
      row.connectionId,
      row.repoOwner,
      row.repoName,
      db,
      vault,
    );
    const result = await bakePrepImage(
      {
        prepKey: row.prepKey,
        cloneUrl: info.cloneUrl,
        gitUserName: info.gitUserName,
        gitUserEmail: info.gitUserEmail,
        installCommand: row.installCommand,
      },
      { log },
    );
    await storage.markReady(row.prepKey, {
      imageTag: result.imageTag,
      lockfileHash: result.lockfileHash,
      headSha: result.headSha,
      installCommand: result.installCommand,
    });
    log(`[prep-worker] ${row.prepKey} ready → ${result.imageTag}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[prep-worker] ${row.prepKey} failed: ${message}`);
    await storage.markFailed(row.prepKey, message).catch(() => {});
  }
}
