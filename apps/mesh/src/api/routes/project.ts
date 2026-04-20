/**
 * Project API Routes
 *
 * Exposes project scan results and dev server control endpoints.
 * Only available in local mode when a project directory is detected.
 */

import { Hono } from "hono";
import { getScanResult } from "@/project/state";
import {
  getDevServerState,
  startProjectDevServer,
  stopProjectDevServer,
  restartProjectDevServer,
} from "@/project/dev-server";

const app = new Hono();

/**
 * GET /api/project
 * Returns project scan result and dev server state
 */
app.get("/", (c) => {
  const scan = getScanResult();
  if (!scan) {
    return c.json({ success: false, error: "No project detected" }, 404);
  }

  return c.json({
    success: true,
    scan,
    devServer: getDevServerState(),
  });
});

/**
 * GET /api/project/dev-server
 * Returns just the dev server state (for lightweight polling)
 */
app.get("/dev-server", (c) => {
  return c.json({
    success: true,
    devServer: getDevServerState(),
  });
});

/**
 * POST /api/project/dev-server/start
 * Starts the project dev server
 */
app.post("/dev-server/start", async (c) => {
  const scan = getScanResult();
  if (!scan) {
    return c.json({ success: false, error: "No project detected" }, 404);
  }

  await startProjectDevServer(scan);
  return c.json({ success: true, devServer: getDevServerState() });
});

/**
 * POST /api/project/dev-server/stop
 * Stops the project dev server
 */
app.post("/dev-server/stop", async (c) => {
  await stopProjectDevServer();
  return c.json({ success: true, devServer: getDevServerState() });
});

/**
 * POST /api/project/dev-server/restart
 * Restarts the project dev server
 */
app.post("/dev-server/restart", async (c) => {
  await restartProjectDevServer();
  return c.json({ success: true, devServer: getDevServerState() });
});

/**
 * GET /api/project/dev-server/logs
 * Returns dev server logs
 */
app.get("/dev-server/logs", (c) => {
  const state = getDevServerState();
  return c.json({ success: true, logs: state.logs });
});

/**
 * Reverse proxy to the project dev server, stripping frame-blocking headers.
 * This allows the preview iframe to load the dev server content.
 * Handles both /api/project/preview and /api/project/preview/* paths.
 */
app.all("/preview", (c) => handlePreviewProxy(c));
app.all("/preview/*", (c) => handlePreviewProxy(c));

async function handlePreviewProxy(c: {
  req: { path: string; url: string; method: string; raw: Request };
  text: (body: string, status: number) => Response;
}) {
  const devServer = getDevServerState();
  if (!devServer.url) {
    return c.text("Dev server not running", 503);
  }

  // Reconstruct the target URL from the wildcard path
  const path = c.req.path.replace(/^\/api\/project\/preview\/?/, "/");
  const targetUrl = new URL(path || "/", devServer.url);

  // Forward query string
  const reqUrl = new URL(c.req.url);
  targetUrl.search = reqUrl.search;

  try {
    const headers = new Headers(c.req.raw.headers);
    // Remove host header to avoid conflicts
    headers.delete("host");

    const response = await fetch(targetUrl.toString(), {
      method: c.req.method,
      headers,
      body:
        c.req.method !== "GET" && c.req.method !== "HEAD"
          ? c.req.raw.body
          : undefined,
      redirect: "manual",
    });

    // Clone response and strip frame-blocking headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("x-frame-options");
    responseHeaders.delete("content-security-policy");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return c.text("Failed to proxy to dev server", 502);
  }
}

export default app;
