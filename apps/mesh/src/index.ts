/**
 * MCP Mesh Server Entry Point
 *
 * Bundled server entry point for production.
 * Start with: bun run index.js
 * Or: bun run src/index.ts
 */

// Import observability module early to initialize OpenTelemetry SDK
import "./observability";
import { createApp } from "./api/app";
import { resolve, dirname } from "path";

const port = parseInt(process.env.PORT || "3000", 10);

// ANSI color codes
const reset = "\x1b[0m";
const bold = "\x1b[1m";
const dim = "\x1b[2m";
const green = "\x1b[32m";
const cyan = "\x1b[36m";
const underline = "\x1b[4m";

const url = `http://localhost:${port}`;

// Resolve client directory for static file serving
const scriptUrl = new URL(import.meta.url);
const scriptPath = scriptUrl.pathname;
const scriptDir = dirname(scriptPath);
const clientDir = resolve(scriptDir, "../client");
const indexPath = resolve(clientDir, "index.html");

// Create the Hono app (skip built-in asset server since we handle it here)
const app = createApp({ skipAssetServer: true });

console.log("");
console.log(`${green}✓${reset} ${bold}Ready${reset}`);
console.log("");
console.log(
  `  ${dim}Open in browser:${reset}  ${cyan}${underline}${url}${reset}`,
);
console.log("");

// Custom fetch handler that serves static files first, then falls back to Hono
async function handleRequest(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  // Decode the pathname to handle URL-encoded characters (e.g., %20 -> space)
  const path = decodeURIComponent(requestUrl.pathname);

  // In production, serve static files for GET requests
  if (request.method === "GET" && process.env.NODE_ENV === "production") {
    // Skip API routes - let Hono handle them
    if (
      !path.startsWith("/api/") &&
      !path.startsWith("/mcp/") &&
      path !== "/health" &&
      path !== "/metrics" &&
      !path.startsWith("/.well-known")
    ) {
      // Determine file path
      let filePath: string;

      if (path === "/" || !path.includes(".")) {
        // SPA routes (including /) - serve index.html
        filePath = indexPath;
      } else {
        // Static assets (css, js, images, etc.)
        filePath = resolve(clientDir, path.slice(1)); // Remove leading /
      }

      // Try to serve the file
      try {
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file);
        }
      } catch {
        // Fall through to Hono
      }
    }
  }

  // Fall back to Hono app for API routes and non-existent files
  return app.fetch(request);
}

Bun.serve({
  port,
  hostname: "0.0.0.0", // Listen on all network interfaces (required for K8s)
  fetch: handleRequest,
  development: process.env.NODE_ENV !== "production",
});
