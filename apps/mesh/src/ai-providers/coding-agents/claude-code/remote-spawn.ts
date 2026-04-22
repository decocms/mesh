import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough, Readable } from "node:stream";
import type {
  SpawnOptions,
  SpawnedProcess,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * Mesh-side target for a remote claude invocation. Obtained from
 * `DockerSandboxRunner.resolveDaemonUrl` / `.resolveDaemonToken`.
 */
export interface DaemonTarget {
  daemonUrl: string;
  daemonToken: string;
  /** Optional OTel traceparent header for span propagation. */
  traceparent?: string;
  /**
   * Override the cwd the daemon spawns claude in. The SDK's `cwd` field
   * goes through host-side `existsSync` validation that we explicitly
   * bypass (see sandbox-model.ts), so this is the only path for telling
   * the daemon "run inside thread-<id>'s git worktree" instead of /app.
   */
  containerCwd?: string;
  /**
   * Per-turn Claude OAuth credentials, injected into the request rather
   * than bind-mounted into a long-lived `/root/.claude/.credentials.json`.
   * Lets a shared (user, agent) container handle parallel turns without
   * rewriting one user's creds under another's feet. Daemon writes the
   * file under /tmp and unlinks on exit; we set CLAUDE_CONFIG_DIR so the
   * CLI reads from there instead of $HOME/.claude.
   */
  inlineCreds?: {
    /** Raw `.credentials.json` contents. */
    contents: string;
  };
  /**
   * Called for every `assistant` message in the stream-json output, with
   * that API call's token totals. The LAST call to this before the `result`
   * message reflects the actual end-of-turn context fill (as opposed to the
   * claude-cli `result.usage` which sums input_tokens across every API call
   * in the turn — inflating 5–10× with prompt caching). Used to drive the
   * real context % ring; cost/billed totals keep using the aggregated usage.
   */
  onAssistantUsage?: (tokens: {
    inputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    outputTokens: number;
  }) => void;
  /**
   * Called once when the turn's `result` message arrives, with the real
   * per-model limits the claude CLI saw. The CLI's own input-bar context
   * gauge reads from the same source — exposing it here lets the UI render
   * a correct context % ring without hardcoding per-model numbers.
   */
  onModelLimits?: (limits: {
    contextWindow: number;
    maxOutputTokens: number;
  }) => void;
}

/**
 * Flags whose value the SDK sometimes emits as a host-side file path. The
 * daemon can't read host paths, so we inline the file contents into the
 * request `files` map and rewrite the flag to point at a path inside the
 * container's /tmp. When the flag value is already inline JSON (starts with
 * `{` or `[`) it passes through unchanged.
 */
const FILE_FLAGS = new Set([
  "--mcp-config",
  "--settings",
  "--append-system-prompt-file",
]);

interface RewrittenArgs {
  args: string[];
  files: Record<string, string>;
}

function rewriteFileArgs(args: string[]): RewrittenArgs {
  const files: Record<string, string> = {};
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const cur = args[i];
    if (cur === undefined) continue;
    const next = args[i + 1];
    if (FILE_FLAGS.has(cur) && typeof next === "string") {
      if (next.startsWith("{") || next.startsWith("[")) {
        out.push(cur, next);
        i++;
        continue;
      }
      try {
        const contents = readFileSync(next, "utf8");
        const containerPath = `/tmp/mesh-${cur.slice(2)}-${randomUUID()}.json`;
        files[containerPath] = contents;
        out.push(cur, containerPath);
        i++;
        continue;
      } catch {
        // Fall through; let the daemon/claude surface the real error.
      }
    }
    out.push(cur);
  }
  return { args: out, files };
}

/**
 * SpawnedProcess-shaped adapter that ships a claude CLI invocation to a
 * remote sandbox daemon over HTTP. Plugs into
 * `@anthropic-ai/claude-agent-sdk`'s `spawnClaudeCodeProcess` hook — the SDK
 * writes prompts to `stdin` and reads stream-json off `stdout` exactly as if
 * it had spawned claude locally.
 *
 * Semantics:
 *   - stdin writes → streamed into the fetch request body (duplex=half)
 *   - response body → stdout reads
 *   - kill() aborts the fetch; daemon SIGTERMs the child on request close
 *   - exit code is synthesized, not read from the trailer: clean close = 0,
 *     aborted = 143 (SIGTERM), fetch/daemon error = 1. The SDK treats the
 *     stream-json `result` event as finish authority, so the synthesized
 *     code is just for bookkeeping — it surfaces on the 'exit' event and in
 *     `exitCode`.
 */
export function createRemoteSpawnedProcess(
  spawnOpts: SpawnOptions,
  daemon: DaemonTarget,
): SpawnedProcess {
  const { args, files } = rewriteFileArgs(spawnOpts.args);

  // Inline-creds wiring: stash the credentials file under a stable
  // /tmp directory and tell claude where to read it from via
  // CLAUDE_CONFIG_DIR. The CLI uses this dir for BOTH `.credentials.json`
  // AND session history at `projects/<cwd-encoded>/<sessionId>.jsonl` —
  // if we rotate the dir per turn, `--resume` can't find prior sessions.
  // Stability per container is fine: the sandbox is per (user, agent), so
  // creds across turns belong to the same account. The daemon's
  // `persistentFiles` channel writes these without the per-turn unlink
  // that applies to the ephemeral `files` map.
  //
  // SDK types env as `NodeJS.ProcessEnv` (string | undefined). The wire
  // format is JSON, so undefined values would round-trip as missing keys
  // anyway — drop them up front to keep the type narrow and the body
  // small.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(spawnOpts.env ?? {})) {
    if (typeof v === "string") env[k] = v;
  }
  const persistentFiles: Record<string, string> = {};
  if (daemon.inlineCreds) {
    const credsDir = "/tmp/mesh-claude-config";
    persistentFiles[`${credsDir}/.credentials.json`] =
      daemon.inlineCreds.contents;
    env.CLAUDE_CONFIG_DIR = credsDir;
  }

  const configLine = `${JSON.stringify({
    args,
    env,
    // containerCwd wins when set so a shared (user, agent) container can
    // run different threads in different git worktrees. Falls through to
    // spawnOpts.cwd (typically undefined, see sandbox-model.ts comment)
    // and the daemon's WORKDIR default.
    cwd: daemon.containerCwd ?? spawnOpts.cwd,
    files,
    persistentFiles,
  })}\n`;

  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const emitter = new EventEmitter();
  const fetchController = new AbortController();

  let exitCode: number | null = null;
  let killed = false;
  let finished = false;

  const finish = (code: number, signal: NodeJS.Signals | null = null) => {
    if (finished) return;
    finished = true;
    exitCode = code;
    emitter.emit("exit", code, signal);
  };

  // Build the request body as a ReadableStream so fetch can stream it with
  // duplex=half. The first chunk is the config line; subsequent chunks are
  // stdin bytes from the SDK.
  let bodyBytesSent = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      console.log(
        `[remote-spawn] body.start() fired, enqueuing configLine (${configLine.length}B)`,
      );
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(configLine));
      bodyBytesSent += configLine.length;
      stdin.on("data", (chunk: Buffer | string) => {
        const bytes =
          typeof chunk === "string"
            ? encoder.encode(chunk)
            : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        bodyBytesSent += bytes.byteLength;
        console.log(
          `[remote-spawn] stdin→body ${bytes.byteLength}B (total ${bodyBytesSent}B): ${String(chunk).slice(0, 120)}`,
        );
        try {
          controller.enqueue(bytes);
        } catch (err) {
          console.log(`[remote-spawn] enqueue failed: ${err}`);
        }
      });
      stdin.on("end", () => {
        console.log(
          `[remote-spawn] stdin ended, closing body after ${bodyBytesSent}B`,
        );
        try {
          controller.close();
        } catch {}
      });
      stdin.on("error", (err) => {
        console.log(`[remote-spawn] stdin error: ${err}`);
        try {
          controller.error(err);
        } catch {}
      });
    },
  });

  const headers: Record<string, string> = {
    "content-type": "application/x-ndjson",
    authorization: `Bearer ${daemon.daemonToken}`,
  };
  if (daemon.traceparent) headers.traceparent = daemon.traceparent;

  fetch(`${daemon.daemonUrl}/claude-code/query`, {
    method: "POST",
    headers,
    body,
    signal: fetchController.signal,
    // @ts-expect-error undici/Bun-only: required to stream the request body
    // concurrently with reading the response.
    duplex: "half",
  })
    .then(async (response) => {
      console.log(
        `[remote-spawn] fetch response status=${response.status} hasBody=${!!response.body}`,
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.log(
          `[remote-spawn] ERROR ${response.status} body: ${text.slice(0, 1000)}`,
        );
        emitter.emit(
          "error",
          new Error(
            `sandbox daemon /claude-code/query returned ${response.status}${
              text ? `: ${text}` : ""
            }`,
          ),
        );
        finish(1);
        return;
      }
      if (!response.body) {
        console.log("[remote-spawn] no response body, finishing");
        finish(0);
        return;
      }
      const responseReadable = Readable.fromWeb(
        response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
      );
      let bytesReceived = 0;

      // Stream-json terminal frame from the daemon. The Claude Code CLI
      // always emits exactly one `{"type":"result", ...}` line as the last
      // event of a turn. Its absence at stream end means the connection
      // dropped mid-turn — most commonly because the sandbox container died
      // (OOM, kill, node failure). We promote that to an error so the AI
      // SDK fires `onError` instead of `onFinish`; otherwise the thread is
      // misclassified as `requires_action` (the SDK has no result so it
      // falls back to a default `finishReason` based on the partial parts
      // it had buffered, which mesh's status resolver maps to "user, your
      // turn"). See PLAN-AUTOMATION-CONCURRENCY.md for the full diagnosis.
      let sawResult = false;

      // NDJSON line buffer for the stream-json output. We always run it —
      // detecting the terminal `result` frame is required for correctness,
      // and the optional usage/limit callbacks piggyback on the same parse.
      let lineBuffer = "";
      const parseLine = (line: string) => {
        if (line.length === 0) return;
        try {
          const msg = JSON.parse(line) as {
            type?: string;
            message?: {
              usage?: {
                input_tokens?: number;
                cache_read_input_tokens?: number;
                cache_creation_input_tokens?: number;
                output_tokens?: number;
              };
            };
            modelUsage?: Record<
              string,
              { contextWindow?: number; maxOutputTokens?: number }
            >;
          };

          if (msg.type === "assistant" && msg.message?.usage) {
            // Per-API-call usage (input_tokens already excludes cache
            // reads/writes); captured here so the caller can reconstruct
            // real end-of-turn context fill, which the aggregated
            // `result.usage` loses by summing across all calls.
            if (daemon.onAssistantUsage) {
              const u = msg.message.usage;
              daemon.onAssistantUsage({
                inputTokens: u.input_tokens ?? 0,
                cacheReadTokens: u.cache_read_input_tokens ?? 0,
                cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
                outputTokens: u.output_tokens ?? 0,
              });
            }
            return;
          }

          if (msg.type === "result") {
            sawResult = true;
            if (msg.modelUsage && daemon.onModelLimits) {
              // Multi-model turns: pick the largest contextWindow since the
              // primary (most capable) model dictates what fits.
              let contextWindow = 0;
              let maxOutputTokens = 0;
              for (const entry of Object.values(msg.modelUsage)) {
                if ((entry.contextWindow ?? 0) > contextWindow) {
                  contextWindow = entry.contextWindow ?? 0;
                  maxOutputTokens = entry.maxOutputTokens ?? 0;
                }
              }
              if (contextWindow > 0) {
                daemon.onModelLimits({ contextWindow, maxOutputTokens });
              }
            }
          }
        } catch {
          // Non-JSON lines (blank/keepalives) are fine to ignore.
        }
      };

      responseReadable.on("data", (chunk: Buffer) => {
        bytesReceived += chunk.length;
        const preview = chunk.toString("utf8").slice(0, 150);
        console.log(
          `[remote-spawn] recv ${chunk.length}B (total ${bytesReceived}B): ${preview}`,
        );
        lineBuffer += chunk.toString("utf8");
        let nl = lineBuffer.indexOf("\n");
        while (nl !== -1) {
          parseLine(lineBuffer.slice(0, nl));
          lineBuffer = lineBuffer.slice(nl + 1);
          nl = lineBuffer.indexOf("\n");
        }
      });
      responseReadable.pipe(stdout);
      responseReadable.on("error", (err) => {
        console.log(
          `[remote-spawn] response error aborted=${fetchController.signal.aborted}: ${err}`,
        );
        if (fetchController.signal.aborted) return;
        emitter.emit("error", err);
        finish(1);
      });
      responseReadable.on("end", () => {
        console.log(
          `[remote-spawn] response ended after ${bytesReceived}B total, sawResult=${sawResult}, killed=${killed}`,
        );
        if (!sawResult && !killed) {
          // Stream closed cleanly at the TCP/HTTP layer but the daemon
          // never emitted its terminal `result` event — see the comment
          // on `sawResult` above.
          emitter.emit(
            "error",
            new Error(
              "sandbox daemon stream ended without result event " +
                "(sandbox likely crashed or was evicted)",
            ),
          );
          finish(1);
          return;
        }
        finish(0);
      });
    })
    .catch((err) => {
      if (fetchController.signal.aborted) {
        finish(143, "SIGTERM");
        return;
      }
      emitter.emit("error", err as Error);
      finish(1);
    });

  // If the SDK caller's own signal fires (turn aborted upstream), fold it
  // into our kill path so the daemon-side child gets reaped.
  spawnOpts.signal?.addEventListener(
    "abort",
    () => {
      proc.kill("SIGTERM");
    },
    { once: true },
  );

  const proc: SpawnedProcess = {
    stdin,
    stdout,
    get killed() {
      return killed;
    },
    get exitCode() {
      return exitCode;
    },
    kill(_signal) {
      if (killed || finished) return false;
      killed = true;
      fetchController.abort();
      return true;
    },
    on(event, listener) {
      emitter.on(event, listener as (...a: unknown[]) => void);
    },
    once(event, listener) {
      emitter.once(event, listener as (...a: unknown[]) => void);
    },
    off(event, listener) {
      emitter.off(event, listener as (...a: unknown[]) => void);
    },
  };

  return proc;
}
