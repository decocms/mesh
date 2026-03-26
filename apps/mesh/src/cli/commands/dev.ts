/**
 * Dev mode startup logic.
 *
 * Delegates environment resolution, service startup, and migrations to
 * buildSettings(). Spawns dev servers and reports progress via the CLI
 * store so the Ink UI can update live.
 */
import { join } from "path";
import type { Subprocess } from "bun";
import { buildSettings } from "../../settings/pipeline";
import {
  addLogEntry,
  setMigrationsDone,
  setServerUrl,
  updateService,
} from "../cli-store";

export interface DevOptions {
  port: string;
  vitePort: string;
  home: string;
  baseUrl?: string;
  skipMigrations: boolean;
  noTui?: boolean;
  localMode: boolean;
}

// Strip ANSI escape codes from a string
function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI codes requires matching control chars
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Pipe a readable stream line-by-line into the CLI store log entries.
 * Lines are stripped of ANSI codes and concurrently prefixes like "[0] " / "[1] ".
 */
function pipeToLogStore(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function processLines() {
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const stripped = stripAnsi(raw)
        .replace(/^\[\d+\]\s*/, "")
        .trim();
      if (!stripped) continue;
      addLogEntry({
        method: "",
        path: "",
        status: 0,
        duration: 0,
        timestamp: new Date(),
        rawLine: stripped,
      });
    }
  }

  (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      processLines();
    }
    if (buffer.trim()) {
      const stripped = stripAnsi(buffer)
        .replace(/^\[\d+\]\s*/, "")
        .trim();
      if (stripped) {
        addLogEntry({
          method: "",
          path: "",
          status: 0,
          duration: 0,
          timestamp: new Date(),
          rawLine: stripped,
        });
      }
    }
  })();
}

export async function startDevServer(
  options: DevOptions,
): Promise<{ port: number; process: Subprocess }> {
  const { port, vitePort, baseUrl, noTui } = options;

  const settings = await buildSettings({
    port: options.port,
    home: options.home,
    baseUrl: options.baseUrl,
    localMode: options.localMode,
    skipMigrations: options.skipMigrations,
    noTui: options.noTui,
    vitePort: options.vitePort,
  });

  setMigrationsDone();

  // ── Spawn dev servers ─────────────────────────────────────────────
  // import.meta.dir = apps/mesh/src/cli/commands → go up 5 levels to repo root
  const repoRoot = join(import.meta.dir, "..", "..", "..", "..", "..");

  // When TUI is active, pipe stdout/stderr so child output doesn't corrupt
  // Ink's cursor-based rendering. Lines are fed into the CLI store instead.
  const useInherit = noTui === true;
  const child = Bun.spawn(["bun", "run", "--cwd=apps/mesh", "dev:servers"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(settings.port),
      VITE_PORT: String(vitePort),
      DATABASE_URL: settings.databaseUrl,
      NATS_URL: settings.natsUrls.join(","),
      NODE_ENV: settings.nodeEnv,
      DECOCMS_LOCAL_MODE: String(settings.localMode),
      DECOCMS_HOME: settings.dataDir,
      DATA_DIR: settings.dataDir,
      DECO_CLI: "1",
      ...(settings.baseUrl ? { BASE_URL: settings.baseUrl } : {}),
    },
    stdio: [
      "inherit",
      useInherit ? "inherit" : "pipe",
      useInherit ? "inherit" : "pipe",
    ],
  });

  if (!useInherit) {
    pipeToLogStore(child.stdout as ReadableStream<Uint8Array>);
    pipeToLogStore(child.stderr as ReadableStream<Uint8Array>);
  }

  const serverUrl = baseUrl || `http://localhost:${port}`;
  setServerUrl(serverUrl);
  updateService({ name: "Vite", status: "ready", port: Number(vitePort) });

  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));

  return { port: Number(port), process: child };
}
