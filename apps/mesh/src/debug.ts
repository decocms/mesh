/**
 * Internal Debug Server
 *
 * A separate server for debugging/diagnostics that runs on an internal port.
 * Only enabled when ENABLE_DEBUG_SERVER=true.
 *
 * Endpoints:
 * - GET /health       - Health check with uptime
 * - GET /memory       - Memory usage stats
 * - GET /heap-snapshot - Download heap snapshot
 * - GET /gc           - Trigger garbage collection
 */

export interface DebugServerConfig {
  port: number;
  hostname?: string;
}

export function startDebugServer(config: DebugServerConfig) {
  const { port, hostname = "0.0.0.0" } = config;

  return Bun.serve({
    port,
    hostname,
    fetch: async (request) => {
      const url = new URL(request.url);

      // GET /health - simple health check
      if (url.pathname === "/health") {
        return Response.json({ status: "ok", uptime: process.uptime() });
      }

      // GET /memory - memory usage stats
      if (url.pathname === "/memory") {
        return Response.json({
          ...process.memoryUsage(),
          uptimeSeconds: process.uptime(),
        });
      }

      // GET /heap-snapshot - generate and download heap snapshot
      if (url.pathname === "/heap-snapshot") {
        const timestamp = Date.now();
        const filename = `/tmp/heap-${timestamp}.heapsnapshot`;

        try {
          Bun.generateHeapSnapshot(filename);
          const file = Bun.file(filename);

          return new Response(file, {
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Disposition": `attachment; filename="heap-${timestamp}.heapsnapshot"`,
            },
          });
        } catch (error) {
          return Response.json({ error: String(error) }, { status: 500 });
        }
      }

      // GET /gc - force garbage collection (if available)
      if (url.pathname === "/gc") {
        if (typeof Bun.gc === "function") {
          Bun.gc(true);
          return Response.json({ status: "gc triggered" });
        }
        return Response.json({ status: "gc not available" }, { status: 501 });
      }

      return Response.json({ error: "Not found" }, { status: 404 });
    },
  });
}
