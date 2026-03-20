/**
 * Service management commands: up, down, status.
 *
 * Replaces scripts/dev-services-cli.ts with a proper CLI subcommand.
 * Plain console output — no Ink UI needed for these one-shot commands.
 */
import { readFileSync } from "fs";

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

export interface ServicesOptions {
  subcommand: string;
  home: string;
  envFile?: string;
}

export async function servicesCommand(options: ServicesOptions): Promise<void> {
  const { subcommand, home, envFile } = options;

  // Load .env so services can find DATABASE_URL / NATS_URL
  if (envFile) {
    const dotEnv = loadDotEnv(envFile);
    for (const [key, value] of Object.entries(dotEnv)) {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }

  const { ensureServices, stopServices, getStatus, printTable } = await import(
    "../../services/ensure-services"
  );

  switch (subcommand) {
    case "up": {
      await ensureServices(home);
      break;
    }
    case "down": {
      await stopServices(home);
      break;
    }
    case "status": {
      const services = await getStatus(home);
      printTable(services);
      break;
    }
    default: {
      console.error(
        `Unknown services subcommand: ${subcommand}\nUsage: deco services <up|down|status>`,
      );
      process.exit(1);
    }
  }
}
