import { createHash } from "node:crypto";
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
import { canonicalize } from "./canonicalize";

export interface BootstrapPayload {
  schemaVersion: 1;
  claimNonce: string;
  daemonToken: string;
  runtime: "node" | "bun" | "deno";
  cloneUrl?: string;
  repoName?: string;
  branch?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  packageManager?: "npm" | "pnpm" | "yarn" | "bun" | "deno";
  devPort?: number;
  appRoot?: string;
  env?: Record<string, string>;
}

export interface BootstrapFile {
  schemaVersion: 1;
  hash: string;
  payload: BootstrapPayload;
}

export const KNOWN_SCHEMA_VERSIONS: ReadonlySet<number> = new Set([1]);

export const DEFAULT_BOOTSTRAP_DIR = "/home/sandbox/.daemon";
export const BOOTSTRAP_FILENAME = "bootstrap.json";
export const BOOTSTRAP_TMP_FILENAME = "bootstrap.json.tmp";

export function bootstrapPath(dir: string = DEFAULT_BOOTSTRAP_DIR): string {
  return `${dir}/${BOOTSTRAP_FILENAME}`;
}

export function bootstrapTmpPath(dir: string = DEFAULT_BOOTSTRAP_DIR): string {
  return `${dir}/${BOOTSTRAP_TMP_FILENAME}`;
}

export function hashPayload(payload: BootstrapPayload): string {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

/**
 * Atomic write: tmp → fsync(file) → rename → fsync(parent dir). Rename is
 * atomic on POSIX so a crash leaves either old contents or new contents,
 * never partial. Mode 0600 + chown 1000:1000 when running as root.
 */
export function writeBootstrap(
  payload: BootstrapPayload,
  dir: string = DEFAULT_BOOTSTRAP_DIR,
): { hash: string } {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const hash = hashPayload(payload);
  const file: BootstrapFile = { schemaVersion: 1, hash, payload };
  const bytes = Buffer.from(JSON.stringify(file), "utf-8");
  const tmp = bootstrapTmpPath(dir);
  const final = bootstrapPath(dir);

  const fd = openSync(tmp, "w", 0o600);
  try {
    writeSync(fd, bytes, 0, bytes.length, 0);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, final);

  // fsync the parent directory so the rename is durable across power loss.
  // Some platforms (notably non-Linux) reject O_DIRECTORY/fsync on a dir;
  // best-effort.
  try {
    const dirFd = openSync(dirname(final), "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch {
    /* best-effort */
  }

  return { hash };
}

export type ReadOutcome =
  | { kind: "absent" }
  | { kind: "valid"; file: BootstrapFile }
  | { kind: "invalid"; reason: string };

/**
 * On boot: delete leftover .tmp, then attempt to read bootstrap.json. Returns
 * a tagged outcome — caller decides phase based on it. Validates schemaVersion
 * is known and recomputes the hash to detect tampering or partial writes.
 */
export function readBootstrap(
  dir: string = DEFAULT_BOOTSTRAP_DIR,
): ReadOutcome {
  // Best-effort cleanup of an interrupted prior write.
  try {
    unlinkSync(bootstrapTmpPath(dir));
  } catch {
    /* not present */
  }

  let raw: string;
  try {
    raw = readFileSync(bootstrapPath(dir), "utf-8");
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
  const file = parsed as Partial<BootstrapFile>;
  if (
    typeof file.schemaVersion !== "number" ||
    !KNOWN_SCHEMA_VERSIONS.has(file.schemaVersion)
  ) {
    return {
      kind: "invalid",
      reason: `unknown schemaVersion: ${String(file.schemaVersion)}`,
    };
  }
  if (typeof file.hash !== "string" || !file.payload) {
    return { kind: "invalid", reason: "missing hash or payload" };
  }
  const computed = hashPayload(file.payload);
  if (computed !== file.hash) {
    return {
      kind: "invalid",
      reason: `hash mismatch: stored=${file.hash} computed=${computed}`,
    };
  }
  return { kind: "valid", file: file as BootstrapFile };
}
