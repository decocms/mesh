#!/usr/bin/env bun
/**
 * Setup script for local-first dev mode.
 *
 * Resolves ~/deco as MESH_HOME, generates secrets, sets env vars,
 * then hands off to the normal `bun run dev` pipeline.
 *
 * Usage: `bun run dev:local`
 */

import { join } from "path";
import { homedir } from "os";
import { spawn } from "child_process";

import { ansi, loadOrCreateSecrets, resolveMeshHome } from "./bootstrap";

const meshAppDir = join(import.meta.dir, "..");

const meshHome = await resolveMeshHome({
  explicit: process.env.MESH_HOME,
  defaultPath: join(homedir(), "deco"),
  ciFallback: join(meshAppDir, ".mesh-dev"),
  banner: `${ansi.bold}${ansi.cyan}Deco Studio${ansi.reset} ${ansi.dim}(dev:local)${ansi.reset}`,
});

await loadOrCreateSecrets(meshHome);

process.env.MESH_HOME = meshHome;
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? `file:${join(meshHome, "mesh.db")}`;
process.env.MESH_LOCAL_MODE = process.env.MESH_LOCAL_MODE ?? "true";

// Hand off to the normal dev pipeline
const child = spawn("bun", ["run", "dev"], {
  stdio: "inherit",
  env: process.env,
  cwd: meshAppDir,
});

child.on("exit", (code) => process.exit(code ?? 0));
