import { createHash } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import type { Config } from "../types";
import { spawnShell } from "./spawn-shell";

const MIRROR_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface CloneDeps {
  config: Config;
  dropPrivileges?: boolean;
  onChunk: (source: "setup", data: string) => void;
}

/**
 * Derives a stable, credential-free filesystem path for a repo's mirror.
 * e.g. https://token@github.com/org/repo.git → <gitCacheDir>/github.com/org/repo
 */
function mirrorPath(gitCacheDir: string, cloneUrl: string): string {
  try {
    const url = new URL(cloneUrl);
    url.username = "";
    url.password = "";
    const canonical = (url.hostname + url.pathname).replace(/\.git$/, "");
    return `${gitCacheDir}/${canonical.replace(/[^a-zA-Z0-9/_-]/g, "_")}`;
  } catch {
    const hash = createHash("sha256")
      .update(cloneUrl)
      .digest("hex")
      .slice(0, 16);
    return `${gitCacheDir}/${hash}`;
  }
}

/** Resolves to exit code (0 on success). Emits chunks via `onChunk`. */
export function spawnClone(deps: CloneDeps): Promise<number> {
  const { config, dropPrivileges, onChunk } = deps;

  if (config.gitCacheDir) {
    return spawnCloneWithReference({ config, dropPrivileges, onChunk });
  }

  const cmd = `git clone --depth 1 ${config.cloneUrl} ${config.appRoot}`;
  onChunk(
    "setup",
    `$ git clone --depth 1 ${config.repoName} ${config.appRoot}\r\n`,
  );
  return spawnShell(cmd, { dropPrivileges, onChunk });
}

async function spawnCloneWithReference(deps: CloneDeps): Promise<number> {
  const { config, dropPrivileges, onChunk } = deps;
  const mirror = mirrorPath(config.gitCacheDir!, config.cloneUrl!);
  const headFile = `${mirror}/HEAD`;
  const lockFile = `${mirror}.lock`;

  mkdirSync(dirname(mirror), { recursive: true });

  // Check mirror state before acquiring flock (cheap, best-effort).
  let headMtimeMs: number | null = null;
  try {
    headMtimeMs = statSync(headFile).mtimeMs;
  } catch {
    // Mirror not yet created — will be initialised inside the flock below.
  }

  const mirrorMissing = headMtimeMs === null;
  const mirrorStale =
    headMtimeMs !== null && Date.now() - headMtimeMs > MIRROR_TTL_MS;

  if (mirrorMissing) {
    // Cold path: create a shallow bare clone. --depth 1 keeps the mirror
    // small (only the latest tree) — enough for any --reference --depth 1
    // sandbox clone. Double-checked inside the flock so concurrent pods
    // don't race on creation.
    onChunk("setup", `$ (warming git mirror for ${config.repoName})\r\n`);
    const createCmd = [
      `flock -x ${JSON.stringify(lockFile)}`,
      `-c 'if [ ! -f ${JSON.stringify(headFile)} ]; then`,
      `  git clone --bare --depth 1 --quiet ${config.cloneUrl} ${JSON.stringify(mirror)};`,
      `fi'`,
    ].join(" ");
    const code = await spawnShell(createCmd, { dropPrivileges, onChunk });
    if (code !== 0) {
      onChunk(
        "setup",
        `\r\nWarning: git mirror setup failed (exit ${code}), falling back to direct clone\r\n`,
      );
      onChunk(
        "setup",
        `$ git clone --depth 1 ${config.repoName} ${config.appRoot}\r\n`,
      );
      return spawnShell(
        `git clone --depth 1 ${config.cloneUrl} ${config.appRoot}`,
        { dropPrivileges, onChunk },
      );
    }
  } else if (mirrorStale) {
    // TTL refresh: fetch latest refs so the mirror stays useful for new
    // commits. Failure is non-fatal — we fall through with the stale mirror
    // (git fills in any missing objects from origin during --dissociate).
    // Touch HEAD after fetch so GC TTL is based on last-used time.
    onChunk("setup", `$ (refreshing git mirror for ${config.repoName})\r\n`);
    const fetchCmd = [
      `flock -x ${JSON.stringify(lockFile)}`,
      `-c 'git -C ${JSON.stringify(mirror)} fetch --depth 1 --prune --quiet 2>/dev/null;`,
      `touch ${JSON.stringify(headFile)} 2>/dev/null || true'`,
    ].join(" ");
    await spawnShell(fetchCmd, { dropPrivileges, onChunk });
  }

  // No --dissociate: without it git writes a single .git/objects/info/alternates
  // pointer rather than copying every borrowed object from EFS into the pod.
  // --dissociate would trigger the full Counting→Compressing→Writing phase
  // (one NFS read per object) which is the dominant cost for cache-hit clones.
  // The alternates reference to /mnt/cache/git/… is safe: the GC TTL (30d) far
  // exceeds any sandbox lifetime, so objects will never disappear under a live pod.
  onChunk(
    "setup",
    `$ git clone --reference ${config.repoName} ${config.appRoot}\r\n`,
  );
  const cloneCmd = [
    "git clone",
    `--reference ${JSON.stringify(mirror)}`,
    "--depth 1",
    config.cloneUrl,
    config.appRoot,
  ].join(" ");
  return spawnShell(cloneCmd, { dropPrivileges, onChunk });
}
