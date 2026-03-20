/**
 * Dev mode startup logic.
 *
 * Loads .env, starts services, runs migrations, and spawns dev servers.
 * Reports progress via the CLI store so the Ink UI can update live.
 */
import { readFileSync } from "fs";
import { join } from "path";
import type { Subprocess } from "bun";
import {
  setEnv,
  setMigrationsDone,
  setServerUrl,
  updateService,
} from "../cli-store";
import type { ServiceStatus } from "../header";

export interface DevOptions {
  port: string;
  vitePort: string;
  home: string;
  baseUrl?: string;
  skipMigrations: boolean;
  envFile?: string;
}

function loadDotEnv(path: string): Record<string, string> {
  try {
    const result: Record<string, string> = {};
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed
        .slice(idx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      result[key] = val;
    }
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function startDevServer(
  options: DevOptions,
): Promise<{ port: number; process: Subprocess }> {
  const { port, vitePort, home, baseUrl, skipMigrations, envFile } = options;

  // ── .env loading ────────────────────────────────────────────────────
  if (envFile) {
    const dotEnv = loadDotEnv(envFile);
    for (const [key, value] of Object.entries(dotEnv)) {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }

  // ── Environment ─────────────────────────────────────────────────────
  process.env.DECOCMS_HOME = home;
  process.env.DATA_DIR = home;
  process.env.PORT = port;
  process.env.VITE_PORT = vitePort;
  process.env.NODE_ENV = "development";
  process.env.DECO_CLI = "1";

  if (baseUrl) {
    process.env.BASE_URL = baseUrl;
  }

  // ── Services ──────────────────────────────────────────────────────
  const { ensureServices } = await import("../../services/ensure-services");
  const services = await ensureServices(home);

  for (const s of services) {
    const svc: ServiceStatus = {
      name: s.name === "PostgreSQL" ? "Postgres" : s.name,
      status: "ready",
      port: s.port,
    };
    updateService(svc);
  }

  // ── Migrations ────────────────────────────────────────────────────
  if (!skipMigrations) {
    try {
      const { migrateToLatest } = await import("../../database/migrate");
      await migrateToLatest({ keepOpen: true });
    } catch (error) {
      console.error("Failed to run migrations:", error);
      process.exit(1);
    }
  }
  setMigrationsDone();

  // ── Env ───────────────────────────────────────────────────────────
  const { env } = await import("../../env");
  setEnv(env);

  // ── Spawn dev servers ─────────────────────────────────────────────
  // import.meta.dir = apps/mesh/src/cli/commands → go up 5 levels to repo root
  const repoRoot = join(import.meta.dir, "..", "..", "..", "..", "..");

  const child = Bun.spawn(["bun", "run", "--cwd=apps/mesh", "dev:servers"], {
    cwd: repoRoot,
    env: process.env,
    stdio: ["inherit", "inherit", "inherit"],
  });

  const serverUrl = baseUrl || `http://localhost:${port}`;
  setServerUrl(serverUrl);

  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));

  return { port: Number(port), process: child };
}
