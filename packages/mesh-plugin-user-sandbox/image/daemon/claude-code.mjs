/**
 * /claude-code/query endpoint — remote SpawnedProcess over HTTP. Backs
 * `@anthropic-ai/claude-agent-sdk`'s `spawnClaudeCodeProcess` hook. The SDK
 * on the mesh side builds the full claude CLI invocation (args, env, cwd);
 * this endpoint runs it inside the container, streaming stdin and stdout
 * between the two processes.
 *
 * Wire protocol:
 *   Request (ndjson body):
 *     line 1: { "args": string[], "env"?: {...}, "cwd"?: string, "files"?: {...} }
 *     lines 2+: bytes piped into claude stdin
 *   Response:
 *     200, content-type: application/x-ndjson
 *     Body: claude stdout, byte-for-byte
 *     Trailer: x-claude-exit = <exit code>, x-claude-stderr = base64(tail)
 *
 * The `command` field in SpawnOptions is ignored — we always run CLAUDE_BIN.
 * Mesh-side callers should set `pathToClaudeCodeExecutable: "claude"` so the
 * SDK's own ChildProcess fallback stays consistent with what we do here.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CLAUDE_BIN, WORKDIR } from "./config.mjs";
import { appendLog } from "./events.mjs";
import { readFirstLine, send } from "./http-helpers.mjs";
import { childEnv, ensureClaudeCodeInstalled } from "./lazy-install.mjs";

// Worktree isolation: when cwd points at a per-thread git worktree, claude is
// spawned in a private mount namespace with that path bind-mounted onto /app.
// The agent's view of /app becomes its thread's files only — no
// `/app/workspaces/thread-<uuid>` leaking into tool output, and stray
// absolute-path writes (/CLAUDE.md, etc.) don't pollute sibling threads.
const WORKTREE_PATH_RE = /^\/app\/workspaces\/thread-[A-Za-z0-9_-]+\/?$/;

/**
 * Allow-list for env vars forwarded from the mesh-side SpawnOptions.env.
 * Everything else is noise for this container (HOME, PATH, and a pile of
 * ANTHROPIC_CLI_* metrics vars for the host's claude install). We keep the
 * CLAUDE_* / ANTHROPIC_* families since they carry auth and behavior flags.
 */
const CLAUDE_ENV_PREFIXES = ["CLAUDE_", "ANTHROPIC_"];

function filterClaudeEnv(env) {
  const out = {};
  if (!env || typeof env !== "object") return out;
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== "string") continue;
    if (CLAUDE_ENV_PREFIXES.some((p) => k.startsWith(p))) out[k] = v;
  }
  return out;
}

/**
 * Materialize `files` ({ "/container/path": contents }) into the container
 * and return the paths written. Used to shuttle `--mcp-config` / `--settings`
 * JSON from the mesh adapter into a file path claude can read. Paths must be
 * absolute and rooted in /tmp so a compromised mesh process can't clobber
 * container state outside its own ephemeral scratch area.
 *
 * Callers decide lifetime by keeping or discarding the returned list:
 * ephemeral per-turn files get unlinked on child exit; persistent state
 * (e.g. `CLAUDE_CONFIG_DIR/.credentials.json`, whose session history
 * `--resume` relies on) is written without tracking.
 */
function writeFiles(files) {
  const written = [];
  for (const [p, contents] of Object.entries(files ?? {})) {
    if (typeof p !== "string" || !p.startsWith("/tmp/")) {
      throw new Error(`refusing to write outside /tmp: ${p}`);
    }
    if (typeof contents !== "string") {
      throw new Error(`file contents for ${p} must be a string`);
    }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, contents, { mode: 0o600 });
    written.push(p);
  }
  return written;
}

/**
 * Build the (bin, args, cwd) triple used to spawn claude. For per-thread
 * worktrees we wrap the invocation in `unshare --user --map-root-user
 * --mount` so a private mount namespace bind-mounts the worktree onto `/app`.
 * Non-worktree spawns (blank sandboxes, legacy threads) pass through
 * unchanged — no container-wide change in behavior for existing flows.
 */
function buildClaudeInvocation(bin, args, cwd) {
  if (!WORKTREE_PATH_RE.test(cwd)) {
    return { cmd: bin, cmdArgs: args, spawnCwd: cwd, isolated: false };
  }
  // Shell-escape cwd for the inline `sh -c`. The regex already rejects
  // anything outside `[A-Za-z0-9_-]` plus the fixed prefix; the escape is a
  // belt-and-braces guard against future regex loosening.
  const safeCwd = cwd.replace(/'/g, `'\\''`);
  // `propagation=private` so the bind is local to our namespace. `cd /app`
  // before exec so claude's own `process.cwd()` resolves to the neutral
  // `/app` rather than the worktree's real path.
  const script =
    `mount --make-rprivate / 2>/dev/null; ` +
    `mount --bind '${safeCwd}' /app && cd /app && exec "$@"`;
  return {
    cmd: "unshare",
    cmdArgs: [
      "--user",
      "--map-root-user",
      "--mount",
      "sh",
      "-c",
      script,
      "--",
      bin,
      ...args,
    ],
    // Node's spawn cwd must exist and be reachable pre-namespace. The shell
    // wrapper will `cd /app` after the bind mount, so this is effectively a
    // placeholder — but it still has to be a real path that exists outside.
    spawnCwd: "/app",
    isolated: true,
  };
}

export async function handleClaudeCodeQuery(req, res) {
  const installed = await ensureClaudeCodeInstalled();
  if (!installed) {
    send(res, 500, {
      error: "claude-code CLI install failed — check /dev/logs?source=setup",
    });
    return;
  }

  let first;
  try {
    first = await readFirstLine(req);
  } catch (err) {
    send(res, 400, { error: `failed to read request body: ${String(err)}` });
    return;
  }
  let config;
  try {
    config = JSON.parse(first.line);
  } catch {
    send(res, 400, {
      error: "first body line must be JSON { args, env?, cwd?, files? }",
    });
    return;
  }
  if (!Array.isArray(config.args)) {
    send(res, 400, { error: "config.args must be a string[]" });
    return;
  }

  let writtenFiles = [];
  try {
    writtenFiles = writeFiles(config.files);
    writeFiles(config.persistentFiles);
  } catch (err) {
    send(res, 400, { error: String(err) });
    return;
  }

  const env = childEnv(filterClaudeEnv(config.env));
  const rawCwd = typeof config.cwd === "string" ? config.cwd : WORKDIR;
  const { cmd, cmdArgs, spawnCwd } = buildClaudeInvocation(
    CLAUDE_BIN,
    config.args,
    rawCwd,
  );

  const child = spawn(cmd, cmdArgs, {
    cwd: spawnCwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  res.writeHead(200, {
    "content-type": "application/x-ndjson",
    "transfer-encoding": "chunked",
    trailer: "x-claude-exit, x-claude-stderr",
  });

  // Capture stderr both in the daemon log AND in the trailer so mesh can
  // surface claude errors to the user. Last 2KB of stderr rides the trailer.
  let stderrTail = "";
  const STDERR_TAIL_LIMIT = 2048;
  child.stderr.on("data", (d) => {
    const s = d.toString("utf8");
    appendLog("claude-code", s);
    stderrTail = (stderrTail + s).slice(-STDERR_TAIL_LIMIT);
  });

  // Claude stdout → HTTP response body. Pipe without `end: true` so we can
  // attach the exit-code trailer on child exit.
  child.stdout.pipe(res, { end: false });

  if (first.rest) child.stdin.write(first.rest);
  req.pipe(child.stdin, { end: true });

  // Client aborts → kill the child so we don't orphan a headless claude
  // chewing through the account's rate limit. `close` fires for BOTH normal
  // end-of-request AND abnormal disconnect; `req.complete === true` means
  // the body flowed fully, so skip the kill in that case.
  req.on("close", () => {
    if (req.complete) return;
    if (child.exitCode == null && !child.killed) {
      appendLog(
        "claude-code",
        `[sandbox-daemon] req aborted (complete=false), SIGTERM child\n`,
      );
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode == null) child.kill("SIGKILL");
      }, 2_000).unref?.();
    }
  });

  const cleanup = () => {
    for (const p of writtenFiles) fs.unlink(p, () => {});
  };

  child.on("exit", (code) => {
    if (code !== 0 && code != null) {
      appendLog(
        "claude-code",
        `[sandbox-daemon] claude exited code=${code} stderr_tail=${JSON.stringify(stderrTail)}\n`,
      );
    }
    try {
      const trailers = { "x-claude-exit": String(code ?? -1) };
      if (stderrTail) {
        trailers["x-claude-stderr"] = Buffer.from(stderrTail, "utf8").toString(
          "base64",
        );
      }
      res.addTrailers(trailers);
      res.end();
    } catch {}
    cleanup();
  });
  child.on("error", (err) => {
    appendLog(
      "claude-code",
      `[sandbox-daemon] claude spawn error: ${String(err)}\n`,
    );
    try {
      res.addTrailers({ "x-claude-exit": "-1" });
      res.end();
    } catch {}
    cleanup();
  });
}
