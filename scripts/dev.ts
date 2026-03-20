#!/usr/bin/env bun
/**
 * Dev entry point — thin wrapper that delegates to the CLI `dev` subcommand.
 *
 * Called by `bun run dev` from the monorepo root.
 */
import { join } from "path";

const repoRoot = join(import.meta.dir, "..");

const child = Bun.spawn(
  [
    "bun",
    "run",
    join(repoRoot, "apps/mesh/src/cli.ts"),
    "dev",
    "--env-file",
    join(repoRoot, "apps/mesh/.env"),
  ],
  { stdio: ["inherit", "inherit", "inherit"] },
);

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

const code = await child.exited;
process.exit(code);
