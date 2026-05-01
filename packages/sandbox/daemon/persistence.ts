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
  runtime: "node" | "bun" | "deno";
  cloneUrl?: string;
  repoName?: string;
  branch?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  packageManager?: "npm" | "pnpm" | "yarn" | "bun" | "deno";
  devPort?: number;
  env?: Record<string, string>;
}

export interface BootstrapFile {
  schemaVersion: 1;
  hash: string;
  payload: BootstrapPayload;
}
const DEFAULT_BOOTSTRAP_DIR = "/home/sandbox/.daemon";
const BOOTSTRAP_FILENAME = "bootstrap.json";
const BOOTSTRAP_TMP_FILENAME = "bootstrap.json.tmp";

export function bootstrapPath(dir: string = DEFAULT_BOOTSTRAP_DIR): string {
  return `${dir}/${BOOTSTRAP_FILENAME}`;
}

function bootstrapTmpPath(dir: string = DEFAULT_BOOTSTRAP_DIR): string {
  return `${dir}/${BOOTSTRAP_TMP_FILENAME}`;
}

export function hashPayload(payload: BootstrapPayload): string {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

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

  try {
    const dirFd = openSync(dirname(final), "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch {}

  return { hash };
}

export type ReadOutcome =
  | { kind: "absent" }
  | { kind: "valid"; file: BootstrapFile }
  | { kind: "invalid"; reason: string };
