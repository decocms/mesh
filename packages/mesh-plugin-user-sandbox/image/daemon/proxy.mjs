/**
 * HTTP reverse proxy to container loopback (/proxy/:port/*). Strips iframe-
 * hostile upstream headers. Serves a friendly "starting…" retry page when the
 * upstream hasn't bound yet.
 *
 * Legacy path kept alive for the transitional commit that moves dev-server
 * traffic off the daemon and onto its own host-mapped port. Deleted once
 * callers migrate.
 */

import http from "node:http";
import net from "node:net";
import { TOKEN } from "./config.mjs";

export function parseProxyUrl(url) {
  const m = /^\/proxy\/(\d+)(\/[^?]*)?(\?.*)?$/.exec(url);
  if (!m) return null;
  return { port: Number(m[1]), subPath: m[2] ?? "/", search: m[3] ?? "" };
}

const STARTING_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Starting…</title>
    <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fafafa;color:#555}div{text-align:center}p{margin-top:8px;font-size:14px;color:#999}</style>
  </head>
  <body>
    <div><h3>Server is starting…</h3><p>This page will refresh automatically.</p></div>
    <script>setTimeout(function(){window.location.reload()},1000)</script>
  </body>
</html>`;

export function proxyHttp(req, res, parsed) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.authorization;
  delete headers["cookie"];

  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: parsed.port,
      path: parsed.subPath + parsed.search,
      method: req.method,
      headers,
    },
    (u) => {
      const outHeaders = { ...u.headers };
      delete outHeaders["x-frame-options"];
      delete outHeaders["content-security-policy"];
      delete outHeaders["set-cookie"];
      delete outHeaders["Set-Cookie"];
      res.writeHead(u.statusCode ?? 502, outHeaders);
      u.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    const connRefused = /ECONNREFUSED|ECONNRESET|ECONNABORTED/.test(
      String(err),
    );
    if (connRefused && (parsed.subPath === "/" || parsed.subPath === "")) {
      if (!res.headersSent) {
        res.writeHead(503, {
          "content-type": "text/html; charset=utf-8",
          "retry-after": "1",
        });
      }
      res.end(STARTING_HTML);
      return;
    }
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(
      JSON.stringify({
        error: "Upstream connection failed",
        detail: String(err),
      }),
    );
  });

  req.pipe(upstream);
}

/** WebSocket upgrade passthrough for /proxy/:port/*. */
export function handleUpgrade(req, clientSocket, head) {
  if ((req.headers["authorization"] ?? "") !== `Bearer ${TOKEN}`) {
    clientSocket.write(
      "HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n",
    );
    clientSocket.destroy();
    return;
  }
  const parsed = parseProxyUrl(req.url ?? "");
  if (!parsed) {
    clientSocket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    clientSocket.destroy();
    return;
  }

  const upstream = net.connect(parsed.port, "127.0.0.1", () => {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.authorization;
    headers.host = `127.0.0.1:${parsed.port}`;

    const lines = [`${req.method} ${parsed.subPath + parsed.search} HTTP/1.1`];
    for (const [k, v] of Object.entries(headers)) {
      if (Array.isArray(v)) for (const vv of v) lines.push(`${k}: ${vv}`);
      else if (v != null) lines.push(`${k}: ${v}`);
    }
    lines.push("\r\n");
    upstream.write(lines.join("\r\n"));
    if (head && head.length) upstream.write(head);

    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });

  upstream.on("error", () => {
    try {
      clientSocket.write(
        "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n",
      );
    } catch {}
    clientSocket.destroy();
  });
  clientSocket.on("error", () => {
    upstream.destroy();
  });
}
