/**
 * MCP Mesh Server Entry Point
 *
 * Bundled server entry point for production.
 * Start with: bun run index.js
 * Or: bun run src/index.ts
 */

import { getSettings } from "./settings";
import { initObservability } from "./observability";

const settings = getSettings();

// Initialize OpenTelemetry SDK BEFORE importing any app modules.
// Modules like database/index.ts and run-registry.ts create OTel instruments
// (histograms, counters) at import time via `meter.createX()`. If the SDK
// hasn't started yet, those calls hit the NoopMeter and silently discard all
// data forever. Dynamic-importing the app tree after `initObservability()`
// ensures every `meter.createX()` call hits the real MeterProvider.
initObservability();

const { createApp } = await import("./api/app");
const { isServerPath } = await import("./api/utils/paths");
const { createAssetHandler, resolveClientDir } = await import(
  "@decocms/runtime/asset-server"
);
const { red } = await import("./fmt");

const port = settings.port;

// Refuse local mode in production — it disables authentication
if (
  settings.localMode &&
  settings.nodeEnv === "production" &&
  !settings.allowLocalProd
) {
  console.error(
    red(
      "Error: Local mode is not allowed in production (NODE_ENV=production).",
    ),
  );
  console.error(
    "Set DECOCMS_ALLOW_LOCAL_PROD=true to override (not recommended).",
  );
  process.exit(1);
}

// Create asset handler - handles both dev proxy and production static files
// When running from source (src/index.ts), the "../client" relative path
// doesn't resolve to dist/client/. Fall back to dist/client/ relative to CWD.
import { existsSync } from "fs";
const resolvedClientDir = resolveClientDir(import.meta.url, "../client");
const clientDir = existsSync(resolvedClientDir)
  ? resolvedClientDir
  : resolveClientDir(import.meta.url, "../dist/client");
const handleAssets = createAssetHandler({
  clientDir,
  isServerPath,
});

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
};

function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

// Populated below if the local sandbox ingress is enabled; gracefulShutdown
// closes these so the port is freed the moment this process exits instead of
// lingering through the Hono server drain.
let ingressServers: import("node:net").Server[] = [];

// Docker-only boot/dev wiring. Both hooks (boot sweep + local ingress) live
// in the user-sandbox plugin because they're intimate with Docker — the
// boot sweep talks to the local docker daemon via labels, the ingress
// forwards to host-side container ports. Freestyle / Kubernetes runners
// host their own VM/ingress lifecycle, so we skip the whole branch under
// any non-docker runner kind.
const { resolveRunnerKindFromEnv } = await import(
  "mesh-plugin-user-sandbox/runner"
);
if (resolveRunnerKindFromEnv() === "docker") {
  const { sweepDockerOrphansOnBoot, startLocalSandboxIngress } = await import(
    "mesh-plugin-user-sandbox/runner"
  );
  const { asDockerRunner, getSharedRunnerIfInit } = await import(
    "./sandbox/lifecycle"
  );

  // Sweep stale sandbox containers before we start serving. Best-effort:
  // any failure (docker CLI missing, daemon down, sweep errors) is logged
  // but does not block startup. This is the primary cleanup mechanism in
  // dev — SIGTERM handling races with the parent killing postgres, so
  // the boot sweep is what actually keeps `docker ps` empty between
  // sessions.
  await sweepDockerOrphansOnBoot();

  // Local sandbox ingress — dev-only. Opt in with
  // MESH_LOCAL_SANDBOX_INGRESS=1 or leave enabled by default when
  // NODE_ENV !== "production". Browsers reach preview iframes via
  // `<handle>.sandboxes.localhost:<port>/`. macOS/Linux resolve
  // `*.localhost` to loopback natively, so no DNS setup is required.
  // Default port is 7070 — port 7000 conflicts with macOS AirPlay Receiver
  // (ControlCenter binds `*:7000` on IPv4 and IPv6, so a Chrome
  // Happy-Eyeballs race to `[::1]:7000` would hit Apple instead of us).
  const ingressDevEnabled =
    settings.nodeEnv !== "production" ||
    process.env.MESH_LOCAL_SANDBOX_INGRESS === "1";
  if (ingressDevEnabled) {
    const ingressPort = Number(process.env.SANDBOX_INGRESS_PORT ?? 7070);
    ingressServers = startLocalSandboxIngress(
      () => asDockerRunner(getSharedRunnerIfInit()),
      ingressPort,
    );
  }
}

// Create the Hono app
const app = await createApp();

// When running via CLI, the calling script handles its own banner/config output
if (!settings.isCli) {
  const { ASCII_ART } = await import("./fmt");
  console.log("");
  for (const line of ASCII_ART) {
    console.log(line);
  }
}

// REUSE_PORT is an internal coordination signal set by serve.ts when
// numThreads > 1 on Linux. It intentionally bypasses the Settings pipeline
// because it is not a user-facing config — it is set programmatically by the
// CLI layer immediately before importing this module.
const reusePort =
  process.platform === "linux" && process.env.REUSE_PORT === "true";

// DECOCMS_IS_WORKER is set by serve.ts on spawned worker processes.
// Workers skip local-mode seeding to avoid concurrent DB races.
const isWorker = process.env.DECOCMS_IS_WORKER === "1";

const server = Bun.serve({
  // This was necessary because MCP has SSE endpoints (like notification) that disconnects after 10 seconds (default bun idle timeout)
  idleTimeout: 0,
  port,
  hostname: "0.0.0.0", // Listen on all network interfaces (required for K8s)
  reusePort,
  fetch: async (request, server) => {
    // Try assets first (static files or dev proxy), then API
    // Pass server as env so Hono's getConnInfo can access requestIP
    const assetRes = await handleAssets(request);
    if (assetRes) return withSecurityHeaders(assetRes);
    return app.fetch(request, { server });
  },
  development: settings.nodeEnv !== "production",
});

// Local mode: seed admin user + organization after server is listening
// This must run after Bun.serve() so that the org seed can fetch tools
// from the self MCP endpoint (http://localhost:PORT/mcp/self).
// Worker processes skip seeding — only the primary process seeds to avoid
// concurrent DB races across workers.
if (settings.localMode && !isWorker) {
  import("./auth/local-mode")
    .then(async ({ seedLocalMode, markSeedComplete }) => {
      try {
        const seeded = await seedLocalMode();
        void seeded;
      } catch (error) {
        console.error("Failed to seed local mode:", error);
      } finally {
        markSeedComplete();
      }
    })
    .catch(async (error) => {
      console.error("Failed to load local-mode module:", error);
      // Still release the seed gate so /local-session doesn't hang forever
      try {
        const { markSeedComplete } = await import("./auth/local-mode");
        markSeedComplete();
      } catch {
        // Module itself failed to load — gate was never armed (isLocalMode()
        // would have resolved it immediately in the Promise constructor)
      }
    });
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

let shuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[shutdown] Received ${signal}, shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error("[shutdown] Timed out after 55s, forcing exit.");
    process.exit(1);
  }, 55_000);
  forceExitTimer.unref?.();

  let exitCode = 0;
  try {
    // 1. Mark as shutting down — readiness returns 503 immediately
    app.markShuttingDown();

    // 2. Close sandbox ingress listeners first so port 7070 is freed
    //    immediately — the next `bun dev` shouldn't need to wait out our drain.
    for (const s of ingressServers) s.close();

    // 3. Give K8s time to notice the 503 and stop routing traffic before
    //    we close connections (~2s is enough for most configurations).
    //    Skipped in dev — there's no load balancer draining, and the 2s delay
    //    is the usual cause of "port still in use" on rapid restart.
    if (settings.nodeEnv === "production") {
      await new Promise((r) => setTimeout(r, 2_000));
    }

    // 4. Stop accepting new connections, force-close active ones
    //    (SSE streams are long-lived and would block graceful drain indefinitely)
    await server.stop(true);

    // 5. Stop workers, flush telemetry, close DB
    await app.shutdown();
  } catch (err) {
    console.error("[shutdown] Error during shutdown:", err);
    exitCode = 1;
  }

  clearTimeout(forceExitTimer);
  process.exit(exitCode);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
// Terminal close / `bun --hot` parent death sends SIGHUP — without this handler
// Bun keeps the process alive after the shell window closes, accumulating
// zombies that still hold ports (port 7070 ingress, etc.).
process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));

// Belt-and-braces: in local dev, if we become orphaned (re-parented to launchd
// after the shell exits without delivering SIGHUP), exit immediately. Guarded
// by NODE_ENV since prod containers legitimately run with PID 1 parentage.
if (settings.nodeEnv !== "production") {
  const initialPpid = process.ppid;
  setInterval(() => {
    if (process.ppid !== initialPpid && process.ppid <= 1) {
      console.error("[shutdown] Orphaned (ppid=1), force-exiting.");
      process.exit(130);
    }
  }, 2_000).unref();
}
