/**
 * Local sandbox ingress forwarder.
 *
 * Dev-only. Raw TCP proxy: parses the first HTTP request's `Host` header to
 * pick a handle + routing target (`/_daemon/*` → daemon port, else → dev
 * port), then pipes raw bytes bidirectionally. Unified path for HTTP and
 * WebSocket — avoids Bun's broken `node:http` `upgrade` event (the handed-off
 * socket reports writable but its writes never reach the client).
 *
 * Binds both `127.0.0.1` and `::1` on the same port so Chrome's Happy-Eyeballs
 * race can't miss us — macOS resolves `*.sandboxes.localhost` to both
 * families, and port 7000 is Apple's AirPlay (why default is 7070).
 *
 * No DNS setup needed: macOS/Linux resolve `*.localhost` to loopback natively
 * (RFC 6761). Handles are 32 hex chars (fits DNS's 63-char label cap).
 *
 * Production uses an Ingress / load balancer per pod on a wildcard domain —
 * this forwarder is NOT wired in that environment.
 */

import * as net from "node:net";
import type { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";

const HOST_RE = /^([^.]+)\.sandboxes\.localhost(?::\d+)?$/i;
const MAX_HEADER_BYTES = 16 * 1024;
const HEADERS_TERMINATOR = Buffer.from("\r\n\r\n");

function extractHandle(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const m = HOST_RE.exec(hostHeader);
  return m ? (m[1] ?? null) : null;
}

function isDaemonPath(pathname: string): boolean {
  return pathname === "/_daemon" || pathname.startsWith("/_daemon/");
}

function parseRequestHead(
  headerText: string,
): { path: string; host: string | null } | null {
  const firstCrlf = headerText.indexOf("\r\n");
  if (firstCrlf === -1) return null;
  const requestLine = headerText.slice(0, firstCrlf);
  const parts = requestLine.split(" ");
  if (parts.length < 3) return null;
  const path = parts[1] ?? "/";
  let host: string | null = null;
  for (const line of headerText.slice(firstCrlf + 2).split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    if (line.slice(0, colon).toLowerCase() === "host") {
      host = line.slice(colon + 1).trim();
      break;
    }
  }
  return { path, host };
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
): net.Server[] {
  const handleConnection = (client: net.Socket): void => {
    let buffer: Buffer = Buffer.alloc(0);
    let settled = false;

    const fail = (status: number, message: string): void => {
      if (settled) return;
      settled = true;
      const body = `${message}\n`;
      client.end(
        `HTTP/1.1 ${status} ${message}\r\n` +
          `Content-Type: text/plain; charset=utf-8\r\n` +
          `Content-Length: ${Buffer.byteLength(body)}\r\n` +
          `Connection: close\r\n\r\n${body}`,
      );
    };

    const onData = (chunk: Buffer): void => {
      if (settled) return;
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf(HEADERS_TERMINATOR);
      if (end === -1) {
        if (buffer.length > MAX_HEADER_BYTES) {
          client.off("data", onData);
          fail(431, "Request Header Fields Too Large");
        }
        return;
      }
      client.off("data", onData);
      settled = true;
      const headerText = buffer.slice(0, end).toString("utf8");
      void route(headerText);
    };

    const route = async (headerText: string): Promise<void> => {
      const head = parseRequestHead(headerText);
      if (!head) {
        fail(400, "Bad Request");
        return;
      }
      const handle = extractHandle(head.host);
      const runner = getRunner();
      if (!runner) {
        fail(503, "Sandbox Runner Not Initialized");
        return;
      }
      if (!handle) {
        fail(404, "Not a Sandbox Host");
        return;
      }
      let pathname: string;
      try {
        pathname = new URL(head.path, "http://local").pathname;
      } catch {
        fail(400, "Bad Request");
        return;
      }
      const target = await resolveTarget(runner, handle, pathname);
      if (!target) {
        fail(404, "Sandbox Not Found");
        return;
      }
      const upstream = net.connect(target, "127.0.0.1", () => {
        upstream.write(buffer);
        buffer = Buffer.alloc(0);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on("error", () => client.destroy());
      client.on("error", () => upstream.destroy());
      client.on("close", () => upstream.destroy());
      upstream.on("close", () => client.destroy());
    };

    client.on("data", onData);
    client.on("error", () => {
      /* surfaced via close */
    });
  };

  const bind = (host: string): net.Server => {
    const server = net.createServer(handleConnection);
    const MAX_RETRIES = 20; // ~10s at 500ms; covers the previous process's drain.
    let attempt = 0;
    let warnedInUse = false;
    const tryListen = (): void => {
      server.listen(port, host, () => {
        console.log(
          `[mesh-sandbox-ingress] forwarding *.sandboxes.localhost → ${host}:${port}`,
        );
      });
    };
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && attempt < MAX_RETRIES) {
        if (!warnedInUse) {
          warnedInUse = true;
          console.warn(
            `[mesh-sandbox-ingress] ${host}:${port} in use — waiting for previous process to release (up to ${MAX_RETRIES / 2}s)...`,
          );
        }
        attempt++;
        setTimeout(tryListen, 500);
        return;
      }
      if (err.code === "EADDRINUSE") {
        const hint =
          port === 7000
            ? " (port 7000 is grabbed by macOS AirPlay Receiver — set SANDBOX_INGRESS_PORT to another port, e.g. 7070)"
            : " — another process is holding it; find it with `lsof -iTCP:" +
              port +
              " -sTCP:LISTEN -n -P`";
        console.warn(
          `[mesh-sandbox-ingress] ${host}:${port} still in use after ${MAX_RETRIES / 2}s; giving up${hint}.`,
        );
        return;
      }
      console.warn(
        `[mesh-sandbox-ingress] ${host}:${port} listen error: ${err.message}`,
      );
    });
    tryListen();
    return server;
  };

  // Bind both loopback families — macOS resolves `*.localhost` to both
  // 127.0.0.1 and ::1, and Chrome often prefers IPv6.
  return [bind("127.0.0.1"), bind("::1")];
}
