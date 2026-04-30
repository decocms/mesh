import { BOOTSTRAP_SCRIPT } from "./constants";
import type { Broadcaster } from "./events/broadcast";

export interface ProxyDeps {
  broadcaster: Broadcaster;
  /** Resolved each request — follows the dev process's actual listening port. */
  getDevPort: () => number;
}

export function makeProxyHandler({ broadcaster, getDevPort }: ProxyDeps) {
  function log(...args: string[]) {
    const msg = `[daemon] ${new Date().toISOString()} ${args.join(" ")}`;
    broadcaster.broadcastChunk("daemon", msg + "\r\n");
  }

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    log("proxy", req.method, url.pathname);
    const target = `http://localhost:${getDevPort()}${url.pathname}${url.search}`;
    const outHeaders = new Headers(req.headers);
    outHeaders.delete("accept-encoding");
    outHeaders.delete("host");
    outHeaders.delete("transfer-encoding");
    outHeaders.delete("content-length");
    // Defensive: never forward the daemon bearer to the user dev server.
    // Today this is moot — mesh's proxyDaemonRequest is only called for
    // /_decopilot_vm/* paths, and proxyPreviewRequest doesn't go through
    // here. Strip anyway so a future caller wiring proxyDaemonRequest to
    // wildcard paths can't leak the bearer to user code.
    outHeaders.delete("authorization");

    let upstream: Response;
    try {
      const init: RequestInit = {
        method: req.method,
        headers: outHeaders,
        redirect: "manual",
        signal: AbortSignal.timeout(60000),
      };
      if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = await req.arrayBuffer();
      }
      upstream = await fetch(target, init);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      log("proxy error", req.method, url.pathname, msg);
      const connErr =
        /ECONNREFUSED|ECONNRESET|ECONNABORTED|fetch failed|Unable to connect|TimeoutError|timed out/i.test(
          msg,
        );
      if (url.pathname === "/" && connErr) {
        return new Response(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Starting...</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fafafa;color:#555}div{text-align:center}p{margin-top:8px;font-size:14px;color:#999}</style></head><body><div><h3>Server is starting…</h3><p>This page will refresh automatically.</p></div><script>setTimeout(function(){window.location.reload()},1000)</script></body></html>`,
          {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Retry-After": "1",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }
      return new Response(JSON.stringify({ error: `proxy error: ${msg}` }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const respHeaders = new Headers(upstream.headers);
    respHeaders.delete("x-frame-options");
    respHeaders.delete("content-security-policy");
    respHeaders.delete("content-encoding");

    const ct = (upstream.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("text/html")) {
      respHeaders.delete("content-length");
      let html = await upstream.text();
      const idx = html.lastIndexOf("</body>");
      html =
        idx !== -1
          ? html.slice(0, idx) + BOOTSTRAP_SCRIPT + html.slice(idx)
          : html + BOOTSTRAP_SCRIPT;
      return new Response(html, {
        status: upstream.status,
        headers: respHeaders,
      });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  };
}
