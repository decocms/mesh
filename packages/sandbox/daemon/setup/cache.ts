import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
} from "node:fs";
import { dirname } from "node:path";
import { PACKAGE_MANAGER_DAEMON_CONFIG } from "../constants";
import type { Config } from "../types";
import { spawnShell } from "./spawn-shell";

export interface CacheDeps {
  config: Config;
  dropPrivileges?: boolean;
  onChunk: (source: "setup", data: string) => void;
}

const LOCKFILES = [
  "bun.lockb",
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

function findLockfile(appRoot: string): string | null {
  for (const name of LOCKFILES) {
    const p = `${appRoot}/${name}`;
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Symlinks /app/.next/cache → a per-(userId,projectRef) directory on the
 * shared PVC so webpack compilation state persists across sandbox restarts.
 *
 * Safe without locking: sandbox_runner_state's advisory lock guarantees at
 * most one live pod per (userId, projectRef) at any time, so there is never
 * more than one writer for a given sandboxCacheKey.
 */
const NEXT_CONFIGS = [
  "next.config.js",
  "next.config.ts",
  "next.config.mjs",
  "next.config.cjs",
];

function isNextJsProject(appRoot: string): boolean {
  return NEXT_CONFIGS.some((f) => existsSync(`${appRoot}/${f}`));
}

export function linkNextCache(deps: CacheDeps): void {
  const { config, onChunk } = deps;
  if (!config.nextCacheDir || !config.sandboxCacheKey) return;
  if (!isNextJsProject(config.appRoot)) return;

  const cacheDir = `${config.nextCacheDir}/${config.sandboxCacheKey}`;
  const dotNext = `${config.appRoot}/.next`;
  const target = `${dotNext}/cache`;

  try {
    mkdirSync(cacheDir, { recursive: true });
    mkdirSync(dotNext, { recursive: true });
    symlinkSync(cacheDir, target);
    onChunk(
      "setup",
      `$ (next.js cache → ${config.sandboxCacheKey.slice(0, 8)}…)\r\n`,
    );
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "EEXIST") {
      onChunk(
        "setup",
        `Warning: failed to link .next/cache: ${err.message}\r\n`,
      );
    }
  }
}

/**
 * Shares node_modules across sandboxes that have the same lockfile by
 * symlinking /app/node_modules to a PVC directory keyed on the lockfile hash.
 *
 * Uses the same flock double-checked pattern as git mirrors: only one pod
 * installs per lockfile hash; others block then reuse the result.
 *
 * Returns true when node_modules are ready and install can be skipped.
 * Returns false when caching is disabled, no lockfile was found, or any
 * setup step failed — callers fall through to the normal spawnInstall path.
 */
export async function linkNodeModules(deps: CacheDeps): Promise<boolean> {
  const { config, dropPrivileges, onChunk } = deps;
  if (!config.nodeModulesCacheDir || !config.packageManager) return false;

  const pmConfig = PACKAGE_MANAGER_DAEMON_CONFIG[config.packageManager];
  if (!pmConfig?.install) return false;

  const lockfile = findLockfile(config.appRoot);
  if (!lockfile) return false;

  let content: Buffer;
  try {
    content = readFileSync(lockfile);
  } catch {
    return false;
  }

  const lockHash = createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, 24);

  // Structure: <nodeModulesCacheDir>/<lockHash>/node_modules/<packages>
  //
  // The extra nesting level is required for Node.js module resolution.
  // When a postinstall script runs from the real (symlink-resolved) path
  // <nodeModulesCacheDir>/<lockHash>/node_modules/pkg/dist/file.js, Node's
  // NODE_MODULES_PATHS algorithm skips the innermost "node_modules" segment
  // and correctly looks at <lockHash>/node_modules/ for sibling packages.
  // Without this extra level the path IS the node_modules directory and Node
  // skips it, causing "Cannot find module" errors in postinstall scripts.
  const moduleSlot = `${config.nodeModulesCacheDir}/${lockHash}`;
  const cacheDir = `${moduleSlot}/node_modules`;
  const flockFile = `${moduleSlot}.lock`;
  const sentinel = `${moduleSlot}/.deco_cache_ok`;
  const nmPath = `${config.appRoot}/node_modules`;

  try {
    mkdirSync(cacheDir, { recursive: true });
    mkdirSync(dirname(flockFile), { recursive: true });
  } catch {
    return false;
  }

  // Symlink /app/node_modules → cache dir so subsequent installs write
  // directly into the shared cache. Check for EEXIST and verify it points
  // to our cache dir; a real directory (resume) means skip caching entirely.
  let symlinkOk = false;
  try {
    symlinkSync(cacheDir, nmPath);
    symlinkOk = true;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "EEXIST") {
      try {
        symlinkOk = readlinkSync(nmPath) === cacheDir;
      } catch {
        symlinkOk = false;
      }
    }
  }

  if (!symlinkOk) {
    return false;
  }

  // Fast path: another pod already installed and marked the sentinel.
  if (existsSync(sentinel)) {
    // Touch sentinel so the GC CronJob measures last-used time, not
    // creation time, when deciding which cache slots to evict.
    try {
      const now = new Date();
      utimesSync(sentinel, now, now);
    } catch {
      // Non-fatal: worst case GC evicts a slot sooner than intended.
    }
    onChunk(
      "setup",
      `$ (node_modules cache hit: ${lockHash.slice(0, 8)}…)\r\n`,
    );
    return true;
  }

  onChunk(
    "setup",
    `$ (warming node_modules cache: ${lockHash.slice(0, 8)}…)\r\n`,
  );

  const corepack =
    "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && corepack enable && ";
  const install = `${config.pathPrefix}cd ${config.appRoot} && ${corepack}${pmConfig.install}`;

  // Double-checked lock: block until the current holder finishes, then
  // re-check the sentinel before running install.
  const cmd = [
    `flock -x ${JSON.stringify(flockFile)}`,
    `-c 'if [ ! -f ${JSON.stringify(sentinel)} ]; then`,
    `  ${install} &&`,
    `  touch ${JSON.stringify(sentinel)};`,
    `fi'`,
  ].join(" ");

  const code = await spawnShell(cmd, { dropPrivileges, onChunk });
  if (code !== 0) {
    onChunk(
      "setup",
      `\r\nWarning: node_modules cache install failed (exit ${code}), falling back to direct install\r\n`,
    );
    // Remove the symlink so the fallback install writes to real node_modules
    // on ephemeral storage instead of the (possibly full) PVC slot.
    try {
      unlinkSync(nmPath);
    } catch {
      // Non-fatal: fallback install will likely also fail but the error will
      // be surfaced to the user.
    }
    return false;
  }

  return true;
}
