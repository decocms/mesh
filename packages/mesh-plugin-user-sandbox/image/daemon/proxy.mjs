/**
 * HTTP reverse proxy to container loopback (/proxy/:port/*). Strips iframe-
 * hostile upstream headers and, when configured, injects an HMR bootstrap
 * snippet into HTML responses. Serves a friendly "starting…" retry page
 * when the upstream hasn't bound yet.
 */

import http from "node:http";
import net from "node:net";
import { BOOTSTRAP, TOKEN } from "./config.mjs";

export function parseProxyUrl(url) {
  // Match /proxy/<digits>(/rest)?(?search)?
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

/**
 * Inject `BOOTSTRAP` into the response HTML, strip headers that break iframe
 * embedding, and remove `content-encoding` since we buffered + mutated the
 * body (upstream's gzip/br is no longer valid).
 *
 * Inject site preference, in order:
 *   1. Right after the opening `<head>` tag — this is the earliest point
 *      where a script can run, ensuring the WebSocket URL monkey-patch in
 *      the bootstrap is in place before any framework dev client (Vite,
 *      Fresh, Next, …) constructs its HMR socket.
 *   2. Right after `<html …>` if no `<head>` is present.
 *   3. Before `</body>` as a last resort.
 *   4. Append to body. Should never happen on real HTML.
 */
function injectBootstrap(upstreamHeaders, bodyBuf) {
  const headers = { ...upstreamHeaders };
  delete headers["x-frame-options"];
  delete headers["content-security-policy"];
  delete headers["content-encoding"];
  delete headers["content-length"];
  // Prevent the dev server from setting cookies on the mesh origin.
  delete headers["set-cookie"];
  delete headers["Set-Cookie"];
  const html = bodyBuf.toString("utf8");
  const headOpen = /<head\b[^>]*>/i.exec(html);
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length;
    return {
      headers,
      body: html.slice(0, at) + BOOTSTRAP + html.slice(at),
    };
  }
  const htmlOpen = /<html\b[^>]*>/i.exec(html);
  if (htmlOpen) {
    const at = htmlOpen.index + htmlOpen[0].length;
    return {
      headers,
      body: html.slice(0, at) + BOOTSTRAP + html.slice(at),
    };
  }
  const bodyClose = html.lastIndexOf("</body>");
  if (bodyClose !== -1) {
    return {
      headers,
      body: html.slice(0, bodyClose) + BOOTSTRAP + html.slice(bodyClose),
    };
  }
  return { headers, body: html + BOOTSTRAP };
}

export function proxyHttp(req, res, parsed) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.authorization;
  // Defense in depth: mesh's daemon-client already strips `cookie`, but the
  // daemon port is bound on the host via `-p` (or is the host's own net ns
  // in host-network mode), so a direct loopback caller could otherwise pass
  // browser cookies straight through to the dev server.
  delete headers["cookie"];
  // `accept-encoding` dropped so upstream doesn't gzip — we may rewrite the
  // body for HTML injection, and decoding gzip just to re-encode wastes CPU.
  delete headers["accept-encoding"];

  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: parsed.port,
      path: parsed.subPath + parsed.search,
      method: req.method,
      headers,
    },
    (u) => {
      const contentType = (u.headers["content-type"] ?? "").toLowerCase();
      const isHtml = contentType.includes("text/html");
      // Always strip iframe-hostile headers. Only buffer+inject when body is
      // HTML AND we actually have a bootstrap string to splice in.
      if (!isHtml || !BOOTSTRAP) {
        const outHeaders = { ...u.headers };
        delete outHeaders["x-frame-options"];
        delete outHeaders["content-security-policy"];
        // Prevent the dev server from setting cookies on the mesh origin.
        // Node's IncomingMessage spreads multi-value `set-cookie` into both
        // camelCase and lowercase forms; delete both to be safe.
        delete outHeaders["set-cookie"];
        delete outHeaders["Set-Cookie"];
        res.writeHead(u.statusCode ?? 502, outHeaders);
        u.pipe(res);
        return;
      }
      const chunks = [];
      u.on("data", (c) => chunks.push(c));
      u.on("end", () => {
        const { headers: outHeaders, body } = injectBootstrap(
          u.headers,
          Buffer.concat(chunks),
        );
        res.writeHead(u.statusCode ?? 502, outHeaders);
        res.end(body);
      });
    },
  );

  upstream.on("error", (err) => {
    // Boot grace: when the caller is browsing the proxied root and the dev
    // server hasn't bound its port yet, serve a friendly auto-reloading page
    // instead of a JSON 502. Any other path (assets, HMR sockets) gets the
    // structured error — we don't want to mask real failures.
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
  // Require bearer on upgrade — mesh attaches it server-to-server.
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
    // Rebuild the upgrade request with the rewritten path and stripped
    // proxy-only headers, then pipe both directions.
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
