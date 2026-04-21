#!/usr/bin/env bun
/**
 * Dev entry point — thin wrapper that delegates to the CLI `dev` subcommand.
 *
 * Called by `bun run dev` from the monorepo root.
 */
import { join } from "path";

const repoRoot = join(import.meta.dir, "..");

// Hot-reload the sandbox daemon inside the container: the Docker runner
// reads this env var and, when set, bind-mounts the host source over
// `/opt/sandbox-daemon` + runs it under `node --watch`. Saving any .mjs
// under `packages/mesh-plugin-user-sandbox/image/` restarts the daemon in
// place — no `docker build`, no container restart by hand.
const sandboxDaemonDir = join(
  repoRoot,
  "packages/mesh-plugin-user-sandbox/image",
);

const child = Bun.spawn(
  [
    "bun",
    "run",
    join(repoRoot, "apps/mesh/src/cli.ts"),
    "dev",
    ...process.argv.slice(2),
  ],
  {
    stdio: ["inherit", "inherit", "inherit"],
    env: {
      ...process.env,
      MESH_SANDBOX_DEV_DAEMON_DIR:
        process.env.MESH_SANDBOX_DEV_DAEMON_DIR ?? sandboxDaemonDir,
    },
  },
);

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

const code = await child.exited;
process.exit(code);
