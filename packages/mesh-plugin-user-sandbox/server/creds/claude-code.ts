import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where Claude Code OAuth credentials live on the host. The CLI writes them
 * on `claude login` and rewrites them in-place whenever the access token is
 * refreshed.
 *
 *  - macOS: stored in the login keychain under the generic-password service
 *    "Claude Code-credentials", keyed by the local username. The shape is
 *    identical to the Linux file form — a single JSON blob. Extract with
 *    `security find-generic-password -s <service> -a <account> -w`.
 *  - Linux: a plain file at `$CLAUDE_CREDS_PATH` (defaulting to
 *    `$HOME/.claude/.credentials.json`).
 *
 * Kept as a tagged union so callers at the mesh boundary pick the right
 * branch per OS; the resolver itself knows how to materialize either into
 * a tempfile the sandbox can bind-mount.
 */
export type ClaudeCodeCredsSource =
  | { kind: "keychain"; account: string }
  | { kind: "file"; path: string };

export interface ResolvedClaudeCodeCreds {
  /**
   * Host path to a freshly materialized creds tempfile (mode 0600). Bind-mount
   * this at `/root/.claude/.credentials.json` inside the sandbox, RW — Claude
   * Code refreshes the access token in place during long turns, and a
   * read-only mount would silently fail those writes mid-stream.
   *
   * Refreshed contents are discarded when `cleanup` runs; the host source
   * (keychain on macOS, file on Linux) stays authoritative and is re-read at
   * the start of the next turn, so we never diverge.
   */
  tempPath: string;
  /** Delete the tempfile. Idempotent; safe to call multiple times. */
  cleanup: () => Promise<void>;
}

/**
 * Materialize Claude Code OAuth credentials into a short-lived, mode-0600
 * tempfile so the sandbox container can bind-mount it. Caller is responsible
 * for invoking `cleanup` once the turn ends.
 */
export async function resolveClaudeCodeCreds(
  source: ClaudeCodeCredsSource,
): Promise<ResolvedClaudeCodeCreds> {
  const contents = await readCredsContents(source);
  const tempPath = path.join(
    os.tmpdir(),
    `mesh-claude-creds-${randomUUID()}.json`,
  );
  await fs.writeFile(tempPath, contents, { mode: 0o600 });
  let cleaned = false;
  return {
    tempPath,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      await fs.unlink(tempPath).catch(() => {
        /* best effort — the tempdir sweep will get it eventually */
      });
    },
  };
}

async function readCredsContents(
  source: ClaudeCodeCredsSource,
): Promise<string> {
  if (source.kind === "keychain") {
    const body = await runSecurityFind(source.account);
    if (!body || body.trim().length === 0) {
      throw new Error(
        `Claude Code credentials not found in macOS keychain for account "${source.account}". ` +
          `Run \`claude login\` as this user first.`,
      );
    }
    return body;
  }
  try {
    return await fs.readFile(source.path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `Claude Code credentials file not found at ${source.path}. ` +
          `Run \`claude login\` or set CLAUDE_CREDS_PATH.`,
      );
    }
    if (code === "EACCES") {
      throw new Error(
        `Claude Code credentials file at ${source.path} is not readable by ` +
          `the mesh process. If mesh runs under a service account, either ` +
          `chmod the file or point CLAUDE_CREDS_PATH at a copy owned by the ` +
          `service account.`,
      );
    }
    throw err;
  }
}

/**
 * Invoke `security find-generic-password -s "Claude Code-credentials" -a
 * <account> -w` and capture stdout. Exit 44 = item not found; any other
 * non-zero exit becomes an error with the security CLI's stderr attached so
 * callers see the real diagnostic (locked keychain, missing keychain, etc).
 */
async function runSecurityFind(account: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      "security",
      [
        "find-generic-password",
        "-s",
        "Claude Code-credentials",
        "-a",
        account,
        "-w",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        reject(
          new Error(
            "`security` binary not found on PATH. macOS credential extraction " +
              "only works on darwin — set CLAUDE_CREDS_PATH to use the file form.",
          ),
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.replace(/\n$/, ""));
        return;
      }
      if (code === 44) {
        resolve("");
        return;
      }
      reject(
        new Error(
          `security find-generic-password exited ${code}` +
            (stderr.trim() ? `: ${stderr.trim()}` : ""),
        ),
      );
    });
  });
}
