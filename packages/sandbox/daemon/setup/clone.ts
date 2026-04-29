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
    // Cold path: shallow bare clone. --depth 1 is fine here because we never
    // pass this mirror to `git clone --reference` (which rejects shallow repos
    // with "reference repository is shallow"). Instead we wire it as an
    // alternate manually — git looks up objects from the pack without a
    // shallow check. Double-checked inside the flock so concurrent pods don't
    // race on creation.
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
    // TTL refresh. --depth 1 is consistent with creation (mirror stays shallow).
    // Failure is non-fatal — fall through with the stale mirror.
    // Touch HEAD after fetch so GC TTL reflects last-used time.
    onChunk("setup", `$ (refreshing git mirror for ${config.repoName})\r\n`);
    const fetchCmd = [
      `flock -x ${JSON.stringify(lockFile)}`,
      `-c 'git -C ${JSON.stringify(mirror)} fetch --depth 1 --prune --quiet 2>/dev/null;`,
      `touch ${JSON.stringify(headFile)} 2>/dev/null || true'`,
    ].join(" ");
    await spawnShell(fetchCmd, { dropPrivileges, onChunk });
  }

  // Manually wire the mirror as an alternates source instead of using
  // `git clone --reference` (which rejects shallow repos). The alternates
  // file tells git where to look for objects before contacting the remote:
  // objects already in the mirror are served from EFS; only new/changed
  // objects are fetched from GitHub. Works for any branch, including ones
  // not yet in the mirror — missing objects fall through to origin.
  const mirrorObjects = `${mirror}/objects`;
  const appRoot = JSON.stringify(config.appRoot);
  const alternatesDir = `${config.appRoot}/.git/objects/info`;
  const fetchRef = JSON.stringify(config.branch ?? "HEAD");

  onChunk("setup", `$ git init ${config.repoName} ${config.appRoot}\r\n`);

  const cloneCmd = [
    `git init -q ${appRoot}`,
    `&& mkdir -p ${JSON.stringify(alternatesDir)}`,
    `&& echo ${JSON.stringify(mirrorObjects)} > ${JSON.stringify(`${alternatesDir}/alternates`)}`,
    `&& git -C ${appRoot} remote add origin ${JSON.stringify(config.cloneUrl!)}`,
    `&& git -C ${appRoot} fetch --depth 1 --quiet origin ${fetchRef}`,
    `&& git -C ${appRoot} checkout FETCH_HEAD`,
    ...(config.branch
      ? [`&& git -C ${appRoot} branch -M ${JSON.stringify(config.branch)}`]
      : []),
  ].join(" ");
  return spawnShell(cloneCmd, { dropPrivileges, onChunk });
}
