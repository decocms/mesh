import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { TenantConfig } from "./types";

const DECOCMS_SUBDIR = ".decocms";
const DAEMON_JSON = "daemon.json";
const DAEMON_JSON_TMP = "daemon.json.tmp";

// Relative paths used by entry.ts for `git add` and shutdown cleanup.
export const CONFIG_FILENAME = join(DECOCMS_SUBDIR, DAEMON_JSON);
export const CONFIG_TMP_FILENAME = join(DECOCMS_SUBDIR, DAEMON_JSON_TMP);

function configPath(repoDir: string): string {
  return join(repoDir, CONFIG_FILENAME);
}

function configTmpPath(repoDir: string): string {
  return join(repoDir, CONFIG_TMP_FILENAME);
}

/**
 * Persists the application section of TenantConfig to
 * `<repoDir>/.decocms/daemon.json` (git-tracked, application config only).
 *
 * The git section is intentionally NOT written to disk — it contains
 * credentials and is re-supplied by the mesh on every daemon boot via the
 * initial PUT /config. It lives in memory only.
 *
 * From the application section, only structural config is persisted:
 * packageManager, runtime, desiredPort. Ephemeral state (intent, proxy)
 * is excluded — intent is always re-derived on boot, and proxy.targetPort
 * is auto-detected at runtime.
 */
export function writeConfig(config: TenantConfig, repoDir: string): void {
  const app = config.application;
  if (app === undefined) return;

  const structural = {
    ...(app.packageManager !== undefined
      ? { packageManager: app.packageManager }
      : {}),
    ...(app.runtime !== undefined ? { runtime: app.runtime } : {}),
    ...(app.desiredPort !== undefined ? { desiredPort: app.desiredPort } : {}),
  };
  if (Object.keys(structural).length === 0) return;

  mkdirSync(join(repoDir, DECOCMS_SUBDIR), { recursive: true });
  const bytes = Buffer.from(
    JSON.stringify({ application: structural }, null, 2),
    "utf-8",
  );
  const tmp = configTmpPath(repoDir);
  const final = configPath(repoDir);

  const fd = openSync(tmp, "w", 0o644);
  try {
    writeSync(fd, bytes, 0, bytes.length, 0);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, final);

  try {
    const dirFd = openSync(dirname(final), "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch {
    throw new Error(`persistence failed: ${final}`);
  }
}

export type ReadOutcome =
  | { kind: "absent" }
  | { kind: "valid"; config: TenantConfig }
  | { kind: "invalid"; reason: string };

/**
 * Reads the application config from `<repoDir>/.decocms/daemon.json`.
 * Returns a TenantConfig with only the application section populated —
 * the git section will be supplied later via the mesh PUT /config.
 */
export function readConfig(repoDir: string): ReadOutcome {
  try {
    unlinkSync(configTmpPath(repoDir));
  } catch {
    /* tmp file absent — nothing to clean up */
  }

  let raw: string;
  try {
    raw = readFileSync(configPath(repoDir), "utf-8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return { kind: "absent" };
    return { kind: "invalid", reason: `read failed: ${err.message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      kind: "invalid",
      reason: `parse failed: ${(e as Error).message}`,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { kind: "invalid", reason: "not an object" };
  }
  return { kind: "valid", config: parsed as TenantConfig };
}
