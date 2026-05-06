import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSetupStep } from "./spawn-step";

function mirrorPath(nodeCacheDir: string, repoUrl: string): string {
  const key = createHash("sha256").update(repoUrl).digest("hex").slice(0, 16);
  return join(nodeCacheDir, "git", key);
}

// Sentinel is a sibling file next to the mirror dir (not inside it) so that
// `git clone --bare` can create the mirror dir itself without finding a
// non-empty directory and aborting.
function sentinelPath(mirror: string): string {
  return `${mirror}.creating`;
}

function wrap(
  onChunk: (source: "setup", data: string) => void,
): (source: "setup", data: string) => void {
  return onChunk;
}

/**
 * Clone from a node-local bare mirror instead of the remote.
 * Falls back silently (returns false) when no mirror exists yet.
 * After local clone, fetches the target branch from origin so the working
 * tree is always at the latest remote commit — the mirror acts as a seed
 * that eliminates most of the pack-file transfer on subsequent sandboxes
 * for the same repo.
 */
export async function restoreFromMirror(opts: {
  repoUrl: string;
  repoDir: string;
  nodeCacheDir: string;
  onChunk: (source: "setup", data: string) => void;
}): Promise<boolean> {
  const { repoUrl, repoDir, nodeCacheDir, onChunk } = opts;
  const mirror = mirrorPath(nodeCacheDir, repoUrl);
  if (!existsSync(mirror) || existsSync(sentinelPath(mirror))) {
    return false;
  }
  // Verify the mirror is a valid bare git repo (HEAD file must exist).
  if (!existsSync(join(mirror, "HEAD"))) {
    return false;
  }

  // The daemon writes config files into repoDir before clone runs.
  // git clone refuses a non-empty target — remove it if there's no .git yet.
  if (existsSync(repoDir) && !existsSync(join(repoDir, ".git"))) {
    try {
      rmSync(repoDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const gc = "git -c safe.directory='*'";
  // Clone from the mirror for the bulk of git objects, then point origin at
  // the real remote. gitSetup's checkoutBranch fetches the target branch
  // (delta only) and handles new branches that don't exist on remote yet.
  const cmd = [
    `${gc} clone ${mirror} ${repoDir}`,
    `${gc} -C ${repoDir} remote set-url origin ${repoUrl}`,
  ].join(" && ");

  onChunk("setup", "[repo-cache] cloning from node-local mirror\r\n");
  const code = await spawnSetupStep(cmd, wrap(onChunk));
  if (code !== 0) {
    // Clean up the partially-created repoDir so the fallback clone can proceed.
    try {
      rmSync(repoDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    onChunk("setup", "[repo-cache] mirror restore failed, falling back\r\n");
  }
  return code === 0;
}

/**
 * Create a bare mirror from a freshly cloned repo. Runs in the background —
 * callers should not await this. Skips silently if the mirror already exists
 * or another pod is creating it (sentinel file).
 */
export async function snapshotMirror(opts: {
  repoUrl: string;
  repoDir: string;
  nodeCacheDir: string;
  onChunk: (source: "setup", data: string) => void;
}): Promise<void> {
  const { repoUrl, repoDir, nodeCacheDir, onChunk } = opts;
  const mirror = mirrorPath(nodeCacheDir, repoUrl);
  const sentinel = sentinelPath(mirror);
  // Skip if mirror already exists or another pod is creating it.
  if (existsSync(mirror) || existsSync(sentinel)) return;

  mkdirSync(join(nodeCacheDir, "git"), { recursive: true });
  // Sentinel is a sibling file — git clone creates the mirror dir itself.
  writeFileSync(sentinel, "");

  const gc = "git -c safe.directory='*'";
  const cmd = `${gc} clone --bare --no-local file://${repoDir} ${mirror}`;
  onChunk("setup", "[repo-cache] snapshotting git mirror\r\n");
  const code = await spawnSetupStep(cmd, wrap(onChunk));

  if (code === 0) {
    try {
      unlinkSync(sentinel);
    } catch {
      /* already gone */
    }
    onChunk("setup", "[repo-cache] git mirror ready\r\n");
  } else {
    // Clean up so the next sandbox can retry.
    try {
      unlinkSync(sentinel);
    } catch {
      /* already gone */
    }
    try {
      rmSync(mirror, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    onChunk("setup", "[repo-cache] git mirror snapshot failed (non-fatal)\r\n");
  }
}
