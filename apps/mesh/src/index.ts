/**
 * MCP Mesh Server Entry Point
 *
 * Bundled server entry point for production.
 * Start with: bun run index.js
 * Or: bun run src/index.ts
 */

// Import observability module early to initialize OpenTelemetry SDK
import "./observability";
import app from "./api";

const port = parseInt(process.env.PORT || "3000", 10);

// ANSI color codes
const reset = "\x1b[0m";
const bold = "\x1b[1m";
const dim = "\x1b[2m";
const green = "\x1b[32m";
const cyan = "\x1b[36m";
const underline = "\x1b[4m";

const url = `http://localhost:${port}`;

console.log("");
console.log(`${green}✓${reset} ${bold}Ready${reset}`);
console.log("");
console.log(
  `  ${dim}Open in browser:${reset}  ${cyan}${underline}${url}${reset}`,
);
console.log("");

Bun.serve({
  port,
  hostname: "0.0.0.0", // Listen on all network interfaces (required for K8s)
  fetch: app.fetch,
  development: process.env.NODE_ENV !== "production",
});
