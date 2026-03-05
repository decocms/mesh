#!/usr/bin/env node

// Re-export the @decocms/mesh CLI entry point.
// This wrapper package exists so that `npx decocms` / `deco` works
// while the canonical package remains @decocms/mesh.

const { execFileSync } = require("child_process");
const { createRequire } = require("module");
const { dirname, join } = require("path");

const require_ = createRequire(__filename);
const meshPkgJson = require_.resolve("@decocms/mesh/package.json");
const meshDir = dirname(meshPkgJson);
const meshBin = join(meshDir, "dist", "server", "cli.js");

// The built CLI uses Bun APIs (Bun.file, Bun.serve), so we must run it with bun.
// Fall back to node if bun is not available (will fail on Bun-specific APIs).
const runtime = (() => {
  try {
    execFileSync("bun", ["--version"], { stdio: "ignore" });
    return "bun";
  } catch {
    return process.execPath;
  }
})();

try {
  execFileSync(runtime, [meshBin, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
} catch (e) {
  process.exit(e.status || 1);
}
