/**
 * Local sandbox ingress forwarder.
 *
 * Dev-only. Binds a single host port and routes `<handle>.sandboxes.localhost`
 * requests to the right container port on 127.0.0.1:
 *   - `/_daemon/*` → `daemonPort` (bearer-authed control plane)
 *   - anything else → `devPort`   (user's dev server on container :3000)
 *
 * Relies on a dnsmasq `address=/sandboxes.localhost/127.0.0.1` entry (or any
 * equivalent DNS rewrite) so the browser resolves every sandbox subdomain to
 * loopback. One-time setup; see the package README for the snippet.
 *
 * Production uses an Ingress / load balancer per pod on a wildcard domain —
 * this forwarder is NOT wired in that environment.
 */

import * as http from "node:http";
import * as net from "node:net";
import type { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";

const HOST_RE = /^([^.]+)\.sandboxes\.localhost(?::\d+)?$/i;

function extractHandle(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  const m = HOST_RE.exec(hostHeader);
  return m ? (m[1] ?? null) : null;
}

function isDaemonPath(pathname: string): boolean {
  return pathname === "/_daemon" || pathname.startsWith("/_daemon/");
}

async function resolveTarget(
  runner: DockerSandboxRunner,
  handle: string,
  pathname: string,
): Promise<number | null> {
  const port = isDaemonPath(pathname)
    ? await runner.resolveDaemonPort(handle)
    : await runner.resolveDevPort(handle);
  return port ?? null;
}

export function startLocalSandboxIngress(
  getRunner: () => DockerSandboxRunner | null,
  port: number,
): http.Server {
  const server = http.createServer(async (req, res) => {
    const runner = getRunner();
    const handle = extractHandle(req.headers.host);
    if (!runner || !handle) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end(runner ? "not a sandbox host" : "sandbox runner not initialized");
      return;
    }
    const url = new URL(req.url ?? "/", "http://local");
    const target = await resolveTarget(runner, handle, url.pathname);
    if (!target) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("sandbox not found");
      return;
    }
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: target,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${target}` },
      },
      (u) => {
        res.writeHead(u.statusCode ?? 502, u.headers);
        u.pipe(res);
      },
    );
    upstream.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain" });
      }
      res.end(`upstream error: ${err.message}`);
    });
    req.pipe(upstream);
  });

  server.on("upgrade", async (req, clientSocket, head) => {
    const runner = getRunner();
    const handle = extractHandle(req.headers.host);
    if (!runner || !handle) {
      clientSocket.destroy();
      return;
    }
    const url = new URL(req.url ?? "/", "http://local");
    const target = await resolveTarget(runner, handle, url.pathname);
    if (!target) {
      clientSocket.destroy();
      return;
    }
    const upstream = net.connect(target, "127.0.0.1", () => {
      const headers = { ...req.headers, host: `127.0.0.1:${target}` };
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [k, v] of Object.entries(headers)) {
        if (Array.isArray(v)) for (const vv of v) lines.push(`${k}: ${vv}`);
        else if (v != null) lines.push(`${k}: ${v}`);
      }
      lines.push("", "");
      upstream.write(lines.join("\r\n"));
      if (head && head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => upstream.destroy());
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(
        `[mesh-sandbox-ingress] port ${port} is in use — sandbox preview URLs will not resolve locally. Set SANDBOX_INGRESS_PORT to another port or free ${port}.`,
      );
      return;
    }
    console.warn(`[mesh-sandbox-ingress] listen error: ${err.message}`);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(
      `[mesh-sandbox-ingress] forwarding *.sandboxes.localhost → 127.0.0.1:${port}`,
    );
  });
  return server;
}
