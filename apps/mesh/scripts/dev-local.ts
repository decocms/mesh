#!/usr/bin/env bun
/**
 * Local-first dev server — mirrors the CLI (`deco` / `npx decocms`) behaviour.
 *
 * Resolves ~/deco as MESH_HOME, generates secrets, enables local mode
 * (auto-login, no signup required), then spawns the normal dev pipeline.
 *
 * Use `bun run dev:local` from the repo root.
 * Regular `bun run dev` is unchanged — requires .env like always.
 */

import { join } from "path";
import { homedir } from "os";
import { spawn } from "child_process";

import {
  ansi,
  loadOrCreateSecrets,
  resolveMeshHome,
  printBanner,
  printStatus,
} from "./bootstrap";

const meshAppDir = join(import.meta.dir, "..");
const userHome = join(homedir(), "deco");
const ciHome = join(meshAppDir, ".mesh-dev");

// ============================================================================
// Resolve MESH_HOME (same heuristics as CLI)
// ============================================================================

const meshHome = await resolveMeshHome({
  explicit: process.env.MESH_HOME,
  defaultPath: userHome,
  ciFallback: ciHome,
  banner: `${ansi.bold}${ansi.cyan}Deco Studio${ansi.reset} ${ansi.dim}(dev:local)${ansi.reset}`,
});

// ============================================================================
// Secrets (same as CLI — auto-generate on first run)
// ============================================================================

await loadOrCreateSecrets(meshHome);

// ============================================================================
// Set environment (mirrors CLI defaults)
// ============================================================================

process.env.MESH_HOME = meshHome;
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? `file:${join(meshHome, "mesh.db")}`;
process.env.MESH_LOCAL_MODE = process.env.MESH_LOCAL_MODE ?? "true";

// ============================================================================
// Banner
// ============================================================================

printBanner({
  meshHome,
  localMode: true,
  label: `Deco Studio ${ansi.dim}(dev:local)${ansi.reset}`,
});

printStatus({
  meshHome,
  localMode: true,
  baseUrl: process.env.BASE_URL,
});

// ============================================================================
// Spawn the normal dev pipeline
// ============================================================================

const child = spawn(
  "bun",
  [
    "run",
    "migrate",
    "&&",
    "concurrently",
    '"bun run dev:client"',
    '"bun run dev:server"',
  ],
  {
    stdio: "inherit",
    shell: true,
    env: process.env,
    cwd: meshAppDir,
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
