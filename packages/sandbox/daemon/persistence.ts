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
import { dirname } from "node:path";
import type { TenantConfig } from "./types";

const DEFAULT_CONFIG_DIR = "/home/sandbox/.daemon";
const CONFIG_TMP_FILENAME = "config.json.tmp";
export const CONFIG_FILENAME = "config.json";

function configPath(dir: string = DEFAULT_CONFIG_DIR): string {
  return `${dir}/${CONFIG_FILENAME}`;
}

function configTmpPath(dir: string = DEFAULT_CONFIG_DIR): string {
  return `${dir}/${CONFIG_TMP_FILENAME}`;
}

/**
 * Writes the merged user-intent TenantConfig atomically (tmp + rename +
 * fsync of the directory). Derived fields (runtime pathPrefix, etc.) are
 * NOT persisted — they're recomputed on read.
 */
export function writeConfig(
  config: TenantConfig,
  dir: string = DEFAULT_CONFIG_DIR,
): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const bytes = Buffer.from(JSON.stringify(config), "utf-8");
  const tmp = configTmpPath(dir);
  const final = configPath(dir);

  const fd = openSync(tmp, "w", 0o600);
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
    throw new Error(`persistence failed: ${JSON.stringify(config)}`);
  }
}

export type ReadOutcome =
  | { kind: "absent" }
  | { kind: "valid"; config: TenantConfig }
  | { kind: "invalid"; reason: string };

export function readConfig(dir: string = DEFAULT_CONFIG_DIR): ReadOutcome {
  try {
    unlinkSync(configTmpPath(dir));
  } catch {
    /* tmp file did not exist; nothing to clean up */
  }

  let raw: string;
  try {
    raw = readFileSync(configPath(dir), "utf-8");
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
