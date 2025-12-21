#!/usr/bin/env bun
/**
 * MCP Mesh CLI Entry Point
 *
 * This script serves as the bin entry point for bunx @decocms/mesh
 * It runs database migrations and starts the production server.
 *
 * Usage:
 *   bunx @decocms/mesh
 *   bunx @decocms/mesh --port 8080
 *   bunx @decocms/mesh --help
 */

import { parseArgs } from "util";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: {
      type: "string",
      short: "p",
      default: process.env.PORT || "3000",
    },
    help: {
      type: "boolean",
      short: "h",
      default: false,
    },
    version: {
      type: "boolean",
      short: "v",
      default: false,
    },
    "skip-migrations": {
      type: "boolean",
      default: false,
    },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`
MCP Mesh - Self-hostable MCP Gateway

Usage:
  bunx @decocms/mesh [options]

Options:
  -p, --port <port>     Port to listen on (default: 3000, or PORT env var)
  -h, --help            Show this help message
  -v, --version         Show version
  --skip-migrations     Skip database migrations on startup

Environment Variables:
  PORT                  Port to listen on (default: 3000)
  DATABASE_URL          Database connection URL (default: file:./data/mesh.db)
  NODE_ENV              Set to 'production' for production mode
  BETTER_AUTH_SECRET    Secret for authentication (auto-generated if not set)
  ENCRYPTION_KEY        Key for encrypting secrets (auto-generated if not set)

Examples:
  bunx @decocms/mesh                    # Start on port 3000
  bunx @decocms/mesh -p 8080            # Start on port 8080
  PORT=9000 bunx @decocms/mesh          # Start on port 9000

Documentation:
  https://github.com/decocms/mesh
`);
  process.exit(0);
}

if (values.version) {
  // Try to read version from package.json
  // When bundled, the path changes depending on context:
  // - During development: ../package.json (relative to src/)
  // - When published: ../../package.json (relative to dist/server/)
  const possiblePaths = [
    new URL("../package.json", import.meta.url),
    new URL("../../package.json", import.meta.url),
  ];

  let version = "unknown";
  for (const path of possiblePaths) {
    try {
      const file = Bun.file(path);
      if (await file.exists()) {
        const packageJson = await file.json();
        version = packageJson.version;
        break;
      }
    } catch {
      // Try next path
    }
  }

  console.log(`@decocms/mesh v${version}`);
  process.exit(0);
}

// Set PORT environment variable for the server
process.env.PORT = values.port;

// Ensure NODE_ENV defaults to production when running via CLI
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

// ANSI color codes
const dim = "\x1b[2m";
const reset = "\x1b[0m";
const bold = "\x1b[1m";
const cyan = "\x1b[36m";
const yellow = "\x1b[33m";

// Generate temporary secrets if not provided
// This allows users to try the app without setting up environment variables
const crypto = await import("crypto");
let showSecretWarning = false;

if (!process.env.BETTER_AUTH_SECRET) {
  process.env.BETTER_AUTH_SECRET = crypto.randomBytes(32).toString("base64");
  showSecretWarning = true;
}

if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  showSecretWarning = true;
}

console.log("");
console.log(`${bold}${cyan}MCP Mesh${reset}`);
console.log(`${dim}Self-hostable MCP Gateway${reset}`);

if (showSecretWarning) {
  console.log("");
  console.log(
    `${yellow}⚠️  Using temporary secrets - sessions/credentials won't persist across restarts.${reset}`,
  );
  console.log(
    `${dim}   For production, set these environment variables:${reset}`,
  );
  console.log(`${dim}   BETTER_AUTH_SECRET=$(openssl rand -base64 32)${reset}`);
  console.log(`${dim}   ENCRYPTION_KEY=$(openssl rand -hex 32)${reset}`);
}

console.log("");

// Run migrations unless skipped
if (!values["skip-migrations"]) {
  console.log(`${dim}Running database migrations...${reset}`);
  try {
    const { migrateToLatest } = await import("./database/migrate");
    // Keep database connection open since server will use it
    await migrateToLatest({ keepOpen: true });
    console.log(`${dim}Migrations complete.${reset}`);
    console.log("");
  } catch (error) {
    console.error("Failed to run migrations:", error);
    process.exit(1);
  }
}

// Import and start the server
// We import dynamically to ensure migrations run first
await import("./index");
