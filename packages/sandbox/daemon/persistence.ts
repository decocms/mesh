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
import { TenantConfig } from "./types";

const DEFAULT_BOOTSTRAP_DIR = "/home/sandbox/.daemon";
const BOOTSTRAP_TMP_FILENAME = "bootstrap.json.tmp";
export const BOOTSTRAP_FILENAME = "bootstrap.json";

function bootstrapPath(dir: string = DEFAULT_BOOTSTRAP_DIR): string {
  return `${dir}/${BOOTSTRAP_FILENAME}`;
}

function bootstrapTmpPath(dir: string = DEFAULT_BOOTSTRAP_DIR): string {
  return `${dir}/${BOOTSTRAP_TMP_FILENAME}`;
}

export function writeBootstrap(
  config: TenantConfig,
  dir: string = DEFAULT_BOOTSTRAP_DIR,
): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const bytes = Buffer.from(JSON.stringify(config), "utf-8");
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
  } catch {
    throw new Error(`persistence failed: ${JSON.stringify(config)}`);
  }
}

export type ReadOutcome =
  | { kind: "absent" }
  | { kind: "valid"; config: TenantConfig }
  | { kind: "invalid"; reason: string };

export function readBootstrap(
  dir: string = DEFAULT_BOOTSTRAP_DIR,
): ReadOutcome {
  try {
    unlinkSync(bootstrapTmpPath(dir));
  } catch {}

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
  const config = parsed as Partial<TenantConfig>;
  if (
    typeof config.git !== "object" ||
    typeof config.application !== "object"
  ) {
    return {
      kind: "invalid",
      reason: `invalid config: ${JSON.stringify(config)}`,
    };
  }
  if (typeof config.git !== "object" || !config.application) {
    return { kind: "invalid", reason: "invalid config" };
  }
  return { kind: "valid", config: config as TenantConfig };
}
