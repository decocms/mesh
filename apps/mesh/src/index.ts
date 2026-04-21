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

// Sweep stale sandbox containers before we start serving. Best-effort: any
// failure (docker CLI missing, daemon down, sweep errors) is logged but does
// not block startup. This is the primary cleanup mechanism in dev — SIGTERM
// handling races with the parent killing postgres, so boot sweep is what
// actually keeps `docker ps` empty between sessions.
const { sweepSandboxesOnBoot, probeClaudeImageOnBoot } = await import(
  "./sandbox/shared-runner"
);
await sweepSandboxesOnBoot();
// Loud warning when MESH_CLAUDE_CODE_IN_SANDBOX=1 but the claude image
// is mis-tagged (no claude binary). Surfaces the misconfig before any
// thread pays for it via the daemon's lazy install fallback.
await probeClaudeImageOnBoot();

// Create the Hono app
const app = await createApp();

// Sandbox preview WS bridge — lazy-loaded so that registry/types-only imports
// of the preview route don't pull bun-specific WS code into non-server paths.
const {
  parseSandboxPreviewUrl,
  resolveSandboxWsTarget,
  extractSandboxHandleFromReferer,
} = await import("./api/routes/sandbox-preview");

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

interface SandboxWsData {
  upstream: WebSocket;
  pending: Array<string | ArrayBufferLike | Blob | Uint8Array>;
  upstreamOpen: boolean;
}

const server = Bun.serve<SandboxWsData>({
  // This was necessary because MCP has SSE endpoints (like notification) that disconnects after 10 seconds (default bun idle timeout)
  idleTimeout: 0,
  port,
  hostname: "0.0.0.0", // Listen on all network interfaces (required for K8s)
  reusePort,
  fetch: async (request, server) => {
    // Intercept WS upgrades to sandbox preview URLs so we can tunnel them
    // through the container daemon (HMR etc. require WebSockets; the regular
    // /api/sandbox HTTP proxy can't handle Upgrade on its own).
    const upgradeHeader = request.headers.get("upgrade");
    if (upgradeHeader?.toLowerCase() === "websocket") {
      const url = new URL(request.url);
      const parsed = parseSandboxPreviewUrl(url.pathname);
      if (parsed) {
        const target = await resolveSandboxWsTarget(request, parsed);
        if ("error" in target) {
          return new Response(target.error, { status: target.status });
        }
        const upstreamUrl = `${target.daemonWsBase}/proxy/${target.port}${target.subPath}${url.search}`;
        // Bun's WebSocket client accepts a non-standard `headers` init field
        // so we can forward the daemon bearer token server-to-server. The
        // browser never sees it.
        const upstream = new WebSocket(upstreamUrl, {
          headers: { authorization: `Bearer ${target.daemonToken}` },
        } as unknown as string[]);
        const data: SandboxWsData = {
          upstream,
          pending: [],
          upstreamOpen: false,
        };
        const upgraded = server.upgrade(request, { data });
        if (!upgraded) {
          try {
            upstream.close();
          } catch {}
          return new Response("Upgrade failed", { status: 500 });
        }
        // Bun returns undefined after a successful upgrade; we're done.
        return undefined;
      }
    }

    // Forward absolute-path assets from sandbox preview iframes. The iframe's
    // HTML often references paths like `/styles.css` or `/_frsh/refresh.js`
    // that the browser resolves against the mesh origin, bypassing the
    // `/api/sandbox/<handle>/preview/` prefix entirely. Without this, those
    // requests hit the mesh's own asset server (or 404), and the page
    // renders with the wrong CSS / missing scripts. Referer carries the
    // full iframe URL (same-origin) so we can route each stray request to
    // its originating sandbox.
    const reqUrl = new URL(request.url);
    const previewSource = extractSandboxHandleFromReferer(
      request.headers.get("referer"),
    );
    if (
      previewSource &&
      !reqUrl.pathname.startsWith("/api/sandbox/") &&
      !reqUrl.pathname.startsWith("/api/") &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      const prefix = previewSource.threadId
        ? `/api/sandbox/${previewSource.handle}/thread/${encodeURIComponent(previewSource.threadId)}/preview`
        : `/api/sandbox/${previewSource.handle}/preview`;
      const rewritten = new Request(
        `${reqUrl.origin}${prefix}${reqUrl.pathname}${reqUrl.search}`,
        request,
      );
      return app.fetch(rewritten, { server });
    }

    // Try assets first (static files or dev proxy), then API
    // Pass server as env so Hono's getConnInfo can access requestIP
    const assetRes = await handleAssets(request);
    if (assetRes) return withSecurityHeaders(assetRes);
    return app.fetch(request, { server });
  },
  websocket: {
    open(ws) {
      const { upstream, pending } = ws.data;
      const onOpen = () => {
        ws.data.upstreamOpen = true;
        for (const msg of pending) {
          try {
            upstream.send(msg);
          } catch {}
        }
        pending.length = 0;
      };
      const onMessage = (ev: MessageEvent) => {
        try {
          // ev.data may be string | ArrayBuffer | Blob — ws.send handles all.
          ws.send(ev.data as string | ArrayBuffer | Uint8Array);
        } catch {}
      };
      const onClose = () => {
        try {
          ws.close();
        } catch {}
      };
      const onError = () => {
        try {
          ws.close();
        } catch {}
      };
      if (upstream.readyState === WebSocket.OPEN) {
        onOpen();
      } else {
        upstream.addEventListener("open", onOpen);
      }
      upstream.addEventListener("message", onMessage);
      upstream.addEventListener("close", onClose);
      upstream.addEventListener("error", onError);
    },
    message(ws, message) {
      const { upstream, pending, upstreamOpen } = ws.data;
      if (!upstreamOpen) {
        pending.push(message);
        return;
      }
      try {
        // message is string | Buffer; upstream.send accepts both.
        upstream.send(message as string | ArrayBufferLike);
      } catch {}
    },
    close(ws) {
      try {
        ws.data.upstream.close();
      } catch {}
    },
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

    // 2. Give K8s time to notice the 503 and stop routing traffic before
    //    we close connections (~2s is enough for most configurations)
    await new Promise((r) => setTimeout(r, 2_000));

    // 3. Stop accepting new connections, force-close active ones
    //    (SSE streams are long-lived and would block graceful drain indefinitely)
    await server.stop(true);

    // 4. Stop workers, flush telemetry, close DB
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
