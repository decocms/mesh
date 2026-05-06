import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { buildPkgKey } from "../cache/pkg-key";
import type { S3Store } from "../cache/s3-store";
import { resolvePmRoot } from "../paths";
import type { Config } from "../types";
import { spawnSetupStep } from "./spawn-step";

const PM_LOCKFILES: Record<string, string[]> = {
  // yarn.lock first: repos migrating from yarn to bun only have yarn.lock on
  // disk at restore time (before install). Putting it first means both the
  // pre-install restore lookup and the post-install snapshot lookup find the
  // same file → same cache key → cache hit on the next run.
  bun: ["yarn.lock", "package-lock.json", "bun.lockb", "bun.lock"],
  npm: ["package-lock.json"],
  yarn: ["yarn.lock"],
  pnpm: ["pnpm-lock.yaml"],
  // deno.lock first; fall back to deno.json/deno.jsonc (import map pins
  // versions, good enough as a cache key when no lockfile is present).
  deno: ["deno.lock", "deno.json", "deno.jsonc"],
};

// DENO_DIR is where Deno caches downloaded modules and compiled bytecode.
// The env var is set by the Helm chart (nodeCache.denoDir) for node-local
// caching; fall back to the Deno default on Linux when unset.
function resolveDenoDir(): string {
  return (
    process.env.DENO_DIR ?? join(process.env.HOME ?? "/root", ".cache", "deno")
  );
}

// For npm PMs the archive target is `installRoot/node_modules`.
// For Deno it's DENO_DIR (a global cache, not inside the project).
function cacheTarget(pm: string, installRoot: string): string {
  return pm === "deno" ? resolveDenoDir() : join(installRoot, "node_modules");
}

// SQLite WAL/SHM files and tmp dirs are written by the live Deno process.
// Excluding them keeps the snapshot consistent (SQLite recovers cleanly
// without WAL on restore) and avoids spurious tar exit-1 warnings.
const DENO_TAR_EXCLUDES =
  "--exclude='*-wal' --exclude='*-shm' --exclude='*-journal' --exclude='*_tmp'";

function normalizeRepoUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return raw;
  }
}

function cacheKey(repoUrl: string, lockfileContent: Buffer): string {
  return createHash("sha256")
    .update(normalizeRepoUrl(repoUrl))
    .update(lockfileContent)
    .digest("hex")
    .slice(0, 16);
}

function snapshotPath(nodeCacheDir: string, key: string): string {
  return join(nodeCacheDir, "modules", key, "snapshot.tar.gz");
}

function findLockfile(installRoot: string, pm: string): string | null {
  for (const name of PM_LOCKFILES[pm] ?? []) {
    const p = join(installRoot, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function getPmVersion(pm: string): string {
  if (pm === "bun") {
    return (process.versions as Record<string, string>)["bun"] ?? "0";
  }
  return "0";
}

/**
 * Extract a previously snapshotted node_modules into installRoot.
 * Returns true when a cache hit is found and extracted successfully.
 * Skips deno (no node_modules) and any PM without a lockfile.
 */
export async function restoreModules(opts: {
  config: Config;
  nodeCacheDir: string;
  onChunk: (source: "setup", data: string) => void;
  s3Store?: S3Store;
}): Promise<boolean> {
  try {
    return await _restoreModules(opts);
  } catch (e) {
    opts.onChunk(
      "setup",
      `[module-cache] restore error (non-fatal): ${(e as Error).message}\r\n`,
    );
    return false;
  }
}

async function _restoreModules(opts: {
  config: Config;
  nodeCacheDir: string;
  onChunk: (source: "setup", data: string) => void;
  s3Store?: S3Store;
}): Promise<boolean> {
  const { config, nodeCacheDir, onChunk, s3Store } = opts;
  const pm = config.application?.packageManager?.name;
  if (!pm) return false;

  const repoUrl = config.git?.repository?.cloneUrl;
  if (!repoUrl) return false;

  const installRoot = resolvePmRoot(
    config.repoDir,
    config.application?.packageManager?.path,
  );
  const lockfile = findLockfile(installRoot, pm);
  if (!lockfile) return false;

  const key = cacheKey(repoUrl, readFileSync(lockfile));
  const snapshot = snapshotPath(nodeCacheDir, key);
  const target = cacheTarget(pm, installRoot);
  const extractTo = dirname(target);

  // L1: node-local snapshot
  if (existsSync(snapshot)) {
    onChunk("setup", `[module-cache] restoring ${pm} cache (${key})\r\n`);
    mkdirSync(extractTo, { recursive: true });
    const code = await spawnSetupStep(
      `tar xzf ${snapshot} -C ${extractTo}`,
      onChunk,
    );
    if (code !== 0) {
      onChunk(
        "setup",
        "[module-cache] restore failed, falling back to install\r\n",
      );
    }
    return code === 0;
  }

  // L2: S3
  if (s3Store) {
    const s3Key = buildPkgKey({
      pm,
      pmVersion: getPmVersion(pm),
      lockfileHash: key,
    });
    if (!(await s3Store.head(s3Key))) return false;
    onChunk(
      "setup",
      `[module-cache] restoring ${pm} cache from S3 (${s3Key})\r\n`,
    );
    const buf = await s3Store.get(s3Key);
    mkdirSync(join(nodeCacheDir, "modules", key), { recursive: true });
    mkdirSync(extractTo, { recursive: true });
    writeFileSync(snapshot, buf);
    const code = await spawnSetupStep(
      `tar xzf ${snapshot} -C ${extractTo}`,
      onChunk,
    );
    if (code !== 0) {
      onChunk(
        "setup",
        "[module-cache] S3 restore failed, falling back to install\r\n",
      );
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Tar node_modules from installRoot into the node-local snapshot cache.
 * Runs in the background — callers should not await this.
 * Skips if the snapshot already exists or node_modules is absent.
 */
export async function snapshotModules(opts: {
  config: Config;
  nodeCacheDir: string;
  onChunk: (source: "setup", data: string) => void;
  s3Store?: S3Store;
}): Promise<void> {
  try {
    return await _snapshotModules(opts);
  } catch (e) {
    opts.onChunk(
      "setup",
      `[module-cache] snapshot error (non-fatal): ${(e as Error).message}\r\n`,
    );
  }
}

async function _snapshotModules(opts: {
  config: Config;
  nodeCacheDir: string;
  onChunk: (source: "setup", data: string) => void;
  s3Store?: S3Store;
}): Promise<void> {
  const { config, nodeCacheDir, onChunk, s3Store } = opts;
  const pm = config.application?.packageManager?.name;
  if (!pm) return;

  const repoUrl = config.git?.repository?.cloneUrl;
  if (!repoUrl) return;

  const installRoot = resolvePmRoot(
    config.repoDir,
    config.application?.packageManager?.path,
  );
  const target = cacheTarget(pm, installRoot);
  if (!existsSync(target)) return;

  const lockfile = findLockfile(installRoot, pm);
  if (!lockfile) return;

  const key = cacheKey(repoUrl, readFileSync(lockfile));
  const snapshot = snapshotPath(nodeCacheDir, key);
  if (existsSync(snapshot)) return;

  // Skip if the node has less than 2 GiB free — avoid filling the disk.
  try {
    const { bsize, bavail } = statfsSync(nodeCacheDir);
    if (bsize * bavail < 2 * 1024 ** 3) {
      onChunk("setup", "[module-cache] skipping snapshot: low disk space\r\n");
      return;
    }
  } catch {
    /* statfs unavailable — proceed anyway */
  }

  mkdirSync(join(nodeCacheDir, "modules", key), { recursive: true });
  onChunk("setup", `[module-cache] snapshotting ${pm} cache (${key})\r\n`);

  const excludes = pm === "deno" ? ` ${DENO_TAR_EXCLUDES}` : "";
  const tarCode = await spawnSetupStep(
    `tar czf ${snapshot}.tmp${excludes} -C ${dirname(target)} ${basename(target)}`,
    onChunk,
  );
  // tar exit 1 = "file changed as we read it" — archive is still usable.
  if (tarCode > 1) {
    onChunk("setup", "[module-cache] snapshot failed (non-fatal)\r\n");
    return;
  }
  const mvCode = await spawnSetupStep(
    `mv ${snapshot}.tmp ${snapshot}`,
    onChunk,
  );
  if (mvCode !== 0) {
    onChunk("setup", "[module-cache] snapshot failed (non-fatal)\r\n");
    return;
  }

  if (s3Store) {
    const s3Key = buildPkgKey({
      pm,
      pmVersion: getPmVersion(pm),
      lockfileHash: key,
    });
    if (!(await s3Store.head(s3Key))) {
      void (async () => {
        const buf = readFileSync(snapshot);
        await s3Store.put(s3Key, buf, { ifNoneMatch: "*" });
        onChunk("setup", "[module-cache] uploaded to S3\r\n");
      })().catch(() => {});
    }
  }
}
