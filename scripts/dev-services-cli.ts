#!/usr/bin/env bun
import { homedir } from "os";
import { join } from "path";
import {
  ensureServices,
  getStatus,
  printTable,
  stopServices,
} from "./dev-services.ts";
import { loadDotEnv } from "./load-dot-env.ts";

const repoRoot = join(import.meta.dir, "..");
const dotEnv = loadDotEnv(join(repoRoot, "apps/mesh/.env"));
for (const [key, value] of Object.entries(dotEnv)) {
  if (!(key in process.env)) {
    process.env[key] = value;
  }
}

const decoHome =
  process.env.DATA_DIR || process.env.DECOCMS_HOME || join(homedir(), "deco");

const command = process.argv[2];

switch (command) {
  case "up": {
    await ensureServices(decoHome);
    break;
  }
  case "down": {
    await stopServices(decoHome);
    break;
  }
  case "status": {
    const services = await getStatus(decoHome);
    printTable(services);
    break;
  }
  default: {
    console.log("Usage: bun run scripts/dev-services-cli.ts <up|down|status>");
    process.exit(1);
  }
}
