/**
 * Sandbox Preview Proxy
 *
 * Browser-facing reverse-proxy for Docker-backed sandbox dev servers. Every
 * request is forwarded to the container's daemon on `/proxy/<port>/*`. The
 * daemon reaches the dev server via container loopback, so dev processes that
 * bind to `127.0.0.1` (Vite < 5 default, many others) work without any
 * `--host 0.0.0.0` flag in user code.
 *
 * Request surface:
 *   /api/sandbox/:handle/preview/                  → port auto-resolved from /dev/status
 *   /api/sandbox/:handle/preview/<port>/...        → explicit port (legacy)
 *   /api/sandbox/:handle/_decopilot_vm/events      → daemon SSE stream
 *   /api/sandbox/:handle/dev/{start,stop,status,logs,scripts} → dev control
 *
 * Authorization: every route checks `sandbox_runner_state.user_id === session.userId`.
 * The daemon bearer token is held inside DockerSandboxRunner and never leaves
 * the mesh process — browsers authenticate via session cookie only.
 *
 * WebSocket upgrades (for Vite HMR etc.) are pre-empted at the top-level
 * `Bun.serve` fetch handler and forwarded by `handleSandboxWsUpgrade`
 * exported here.
 */

import { ContextFactory } from "@/core/context-factory";
import type { MeshContext } from "@/core/mesh-context";
import { getSharedRunner } from "@/sandbox/shared-runner";
import type { Context } from "hono";
import { Hono } from "hono";
import { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";

const SANDBOX_RUNNER_KIND = "docker";
const STRIP_RESPONSE_HEADERS = [
  "x-frame-options",
  "content-security-policy",
  "content-encoding",
];

/**
 * Authorize a sandbox request. Returns the handle if the caller owns it, or a
 * Response describing the failure.
 */
async function authorizeSandbox(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
): Promise<{ handle: string; runner: DockerSandboxRunner } | Response> {
  const ctx = c.get("meshContext");
  const userId = ctx.auth?.user?.id;
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const handle = c.req.param("handle");
  if (!handle) return c.json({ error: "Invalid sandbox handle" }, 400);

  const row = await ctx.db
    .selectFrom("sandbox_runner_state")
    .select(["user_id", "runner_kind"])
    .where("handle", "=", handle)
    .executeTakeFirst();
  if (!row || row.user_id !== userId) {
    return c.json({ error: "Sandbox not found" }, 404);
  }
  if (row.runner_kind !== SANDBOX_RUNNER_KIND) {
    return c.json(
      { error: `Preview proxy unsupported for runner ${row.runner_kind}` },
      400,
    );
  }

  const runner = getSharedRunner(ctx);
  if (!(runner instanceof DockerSandboxRunner)) {
    return c.json({ error: "Runner not configured for docker preview" }, 500);
  }
  return { handle, runner };
}

function stripResponseHeaders(headers: Headers): Headers {
  const out = new Headers(headers);
  for (const h of STRIP_RESPONSE_HEADERS) out.delete(h);
  return out;
}

/**
 * Rewrite self-referential absolute redirects (Fresh, Next, etc. often emit
 * `Location: http://localhost:<port>/…`) to the mesh proxy path so the iframe
 * doesn't navigate away from `/api/sandbox/:handle/preview/*`. Without this,
 * the browser follows the Location to whatever service actually runs on the
 * user's host at that port — typically the mesh dev server, which sets
 * `frame-ancestors 'none'` and kills the iframe.
 *
 * Only rewrites `localhost` / `127.0.0.1` / `0.0.0.0` hosts. External redirects
 * (OAuth, CDN) pass through untouched. Relative Location values are already
 * resolved by the browser against the current frame URL, so they're fine.
 */
function rewriteLocationHeader(headers: Headers, handle: string): void {
  const location = headers.get("location");
  if (!location) return;
  const proxyPrefix = `/api/sandbox/${handle}/preview`;

  // Absolute URL: `http://localhost:<port>/foo` → `/api/sandbox/<handle>/preview/foo`
  try {
    const parsed = new URL(location);
    const host = parsed.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "0.0.0.0") {
      return;
    }
    headers.set(
      "location",
      `${proxyPrefix}${parsed.pathname}${parsed.search}${parsed.hash}`,
    );
    return;
  } catch {
    // Not an absolute URL — fall through to absolute-path handling below.
  }

  // Absolute-path reference: `/foo` escapes the proxy prefix because the
  // browser resolves it against the origin, not the current request URL. The
  // classic symptom is `Location: /` → browser navigates to `http://<origin>/`
  // which is the mesh server, whose `frame-ancestors 'none'` kills the iframe.
  // Relative paths (`./foo`, `foo`) don't need rewriting — the browser
  // resolves them against the current request, which is already under the
  // proxy prefix.
  if (location.startsWith("/") && !location.startsWith(`${proxyPrefix}/`)) {
    headers.set("location", `${proxyPrefix}${location}`);
  }
}

/**
 * Normalize the `/preview/[port/]…` tail. Hono parameters don't include the
 * leading slash, and callers often build the preview URL with a trailing slash
 * (so they paste on `/_decopilot_vm/events` and double-slash), so we
 * canonicalize.
 */
function normalizeSubPath(raw: string | undefined): string {
  let s = raw ?? "";
  if (!s.startsWith("/")) s = `/${s}`;
  if (s.startsWith("//")) s = s.slice(1);
  return s;
}

async function proxyWithPort(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
  auth: { handle: string; runner: DockerSandboxRunner },
  port: number,
  subPath: string,
): Promise<Response> {
  // The `/_decopilot_vm/events` SSE stream is a daemon-level endpoint — it
  // doesn't live behind `/proxy/<port>`. Route it separately so the UI can
  // keep its existing `${previewUrl}/_decopilot_vm/events` URL shape.
  if (subPath === "/_decopilot_vm/events") {
    return proxyDaemonPath(c, auth, "/_decopilot_vm/events");
  }

  const url = new URL(c.req.url);
  const target = `/proxy/${port}${subPath}${url.search}`;
  const upstream = await auth.runner.proxyDaemonRequest(auth.handle, target, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  });
  // If the dev server isn't listening yet (daemon returns 502) and this looks
  // like the initial preview load, render a friendly loading page instead.
  if (upstream.status === 502 && wantsHtml(c)) {
    return loadingHtmlResponse(auth.handle);
  }
  const outHeaders = stripResponseHeaders(upstream.headers);
  rewriteLocationHeader(outHeaders, auth.handle);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

async function proxyDaemonPath(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
  auth: { handle: string; runner: DockerSandboxRunner },
  path: string,
): Promise<Response> {
  const url = new URL(c.req.url);
  const upstream = await auth.runner.proxyDaemonRequest(
    auth.handle,
    `${path}${url.search}`,
    {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.raw.body,
    },
  );
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: stripResponseHeaders(upstream.headers),
  });
}

/**
 * Port-less preview path. Ask the daemon for the discovered dev port; if it's
 * not yet listening, render a loading page that auto-reloads on ready.
 */
async function proxyAutoPort(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
  auth: { handle: string; runner: DockerSandboxRunner },
  subPath: string,
): Promise<Response> {
  if (subPath === "/_decopilot_vm/events") {
    return proxyDaemonPath(c, auth, "/_decopilot_vm/events");
  }

  const statusRes = await auth.runner.proxyDaemonRequest(
    auth.handle,
    "/dev/status",
    { method: "GET", headers: new Headers(), body: null },
  );
  const status = (await statusRes.json().catch(() => null)) as {
    port?: number | null;
    phase?: string;
  } | null;

  if (!status?.port) {
    if (wantsHtml(c)) return loadingHtmlResponse(auth.handle);
    return c.json({ error: "Dev server not ready", phase: status?.phase }, 503);
  }
  return proxyWithPort(c, auth, status.port, subPath);
}

function wantsHtml(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
): boolean {
  const method = c.req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  const accept = c.req.header("accept") ?? "";
  return accept.includes("text/html") || accept === "*/*" || accept === "";
}

/**
 * Minimal loading shell the iframe renders while the dev server is booting.
 * Polls /dev/status every 1s and reloads once ready. Shows last-known logs
 * in a pre. Intentionally dependency-free HTML so it can't break when the
 * dev server is also broken.
 */
function loadingHtmlResponse(handle: string): Response {
  const statusUrl = `/api/sandbox/${handle}/dev/status`;
  const logsUrl = `/api/sandbox/${handle}/dev/logs?tail=200`;
  const startUrl = `/api/sandbox/${handle}/dev/start`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Starting dev server…</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #0b0d10; color: #d6dde5; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .wrap { display: flex; flex-direction: column; height: 100%; padding: 16px 20px; box-sizing: border-box; }
  .row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #f5c518; box-shadow: 0 0 8px #f5c51880; animation: pulse 1.2s ease-in-out infinite; }
  .dot.crashed { background: #ef4444; animation: none; }
  @keyframes pulse { 0%,100% { opacity: .6 } 50% { opacity: 1 } }
  h1 { font-size: 13px; font-weight: 600; margin: 0; color: #e5e7eb; }
  .sub { color: #9aa4b2; }
  pre { flex: 1; margin: 0; padding: 10px 12px; background: #0e1115; border: 1px solid #1f242b; border-radius: 6px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
  button { background: #1f2937; color: #e5e7eb; border: 1px solid #374151; border-radius: 6px; padding: 4px 10px; font: inherit; cursor: pointer; }
  button:hover { background: #293242; }
</style>
</head>
<body>
<div class="wrap">
  <div class="row">
    <span id="dot" class="dot"></span>
    <h1 id="phase">Starting dev server…</h1>
    <span class="sub" id="sub"></span>
    <span style="flex:1"></span>
    <button id="restart" hidden>Restart</button>
  </div>
  <pre id="log">(loading…)</pre>
</div>
<script>
  const STATUS = ${JSON.stringify(statusUrl)};
  const LOGS = ${JSON.stringify(logsUrl)};
  const START = ${JSON.stringify(startUrl)};
  const phaseEl = document.getElementById("phase");
  const subEl = document.getElementById("sub");
  const dotEl = document.getElementById("dot");
  const logEl = document.getElementById("log");
  const restartBtn = document.getElementById("restart");
  async function tick() {
    try {
      const [s, l] = await Promise.all([
        fetch(STATUS, { cache: "no-store" }).then(r => r.ok ? r.json() : null),
        fetch(LOGS, { cache: "no-store" }).then(r => r.ok ? r.text() : ""),
      ]);
      if (l) logEl.textContent = l;
      if (!s) return;
      const labels = { idle: "Waiting…", installing: "Installing dependencies…", starting: "Starting dev server…", ready: "Ready — reloading…", exited: "Exited", crashed: "Crashed" };
      phaseEl.textContent = labels[s.phase] ?? s.phase ?? "Starting…";
      subEl.textContent = s.pm ? "(" + s.pm + " run " + (s.script || "dev") + ")" : "";
      dotEl.classList.toggle("crashed", s.phase === "crashed" || s.phase === "exited");
      if (s.phase === "ready") { location.reload(); return; }
      if (s.phase === "crashed" || s.phase === "exited") restartBtn.hidden = false;
      else restartBtn.hidden = true;
    } catch {}
  }
  restartBtn.addEventListener("click", () => {
    restartBtn.hidden = true;
    fetch(START, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ restart: true }) }).catch(() => {});
  });
  tick();
  setInterval(tick, 1000);
</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function createSandboxPreviewRoutes() {
  const app = new Hono<{ Variables: { meshContext: MeshContext } }>();

  // ── Dev control routes ──────────────────────────────────────────────────
  const devForward =
    (path: string) =>
    async (c: Context<{ Variables: { meshContext: MeshContext } }>) => {
      const auth = await authorizeSandbox(c);
      if (auth instanceof Response) return auth;
      return proxyDaemonPath(c, auth, path);
    };

  app.get("/api/sandbox/:handle/dev/status", devForward("/dev/status"));
  app.post("/api/sandbox/:handle/dev/start", devForward("/dev/start"));
  app.post("/api/sandbox/:handle/dev/stop", devForward("/dev/stop"));
  app.get("/api/sandbox/:handle/dev/logs", devForward("/dev/logs"));
  app.get("/api/sandbox/:handle/dev/scripts", devForward("/dev/scripts"));

  // Canonical SSE location. Also reachable from any `.../preview[/<port>]/...`
  // path below so the UI's existing `${previewUrl}/_decopilot_vm/events` keeps
  // working.
  app.get(
    "/api/sandbox/:handle/_decopilot_vm/events",
    devForward("/_decopilot_vm/events"),
  );

  // ── Preview (explicit port) ─────────────────────────────────────────────
  const explicitPortRoute = async (
    c: Context<{ Variables: { meshContext: MeshContext } }>,
  ) => {
    const auth = await authorizeSandbox(c);
    if (auth instanceof Response) return auth;
    const port = Number(c.req.param("port"));
    if (!Number.isInteger(port) || port <= 0) {
      return c.json({ error: "Invalid port" }, 400);
    }
    const prefix = `/api/sandbox/${auth.handle}/preview/${port}`;
    const tail = c.req.path.startsWith(prefix)
      ? c.req.path.slice(prefix.length)
      : "";
    return proxyWithPort(c, auth, port, normalizeSubPath(tail));
  };
  app.all("/api/sandbox/:handle/preview/:port{[0-9]+}/*", explicitPortRoute);
  app.all("/api/sandbox/:handle/preview/:port{[0-9]+}", explicitPortRoute);

  // ── Preview (port-less) ─────────────────────────────────────────────────
  const autoPortRoute = async (
    c: Context<{ Variables: { meshContext: MeshContext } }>,
  ) => {
    const auth = await authorizeSandbox(c);
    if (auth instanceof Response) return auth;
    const prefix = `/api/sandbox/${auth.handle}/preview`;
    const tail = c.req.path.startsWith(prefix)
      ? c.req.path.slice(prefix.length)
      : "";
    return proxyAutoPort(c, auth, normalizeSubPath(tail));
  };
  app.all("/api/sandbox/:handle/preview/*", autoPortRoute);
  app.all("/api/sandbox/:handle/preview", autoPortRoute);

  return app;
}

// ───────────────────────────────────────────────────────────────────────────
// WebSocket upgrade plumbing (called from the top-level Bun.serve fetch).
// Exports the handle/port extraction + auth + upstream-open so the
// index.ts-level pre-emption only worries about the Bun.serve wiring.
// ───────────────────────────────────────────────────────────────────────────

export interface SandboxWsTarget {
  handle: string;
  /** `ws://127.0.0.1:<daemonHostPort>` — the daemon's browser-reachable base. */
  daemonWsBase: string;
  /** Bearer token for the daemon. Never surfaces to the browser. */
  daemonToken: string;
  /** Container-local port of the dev server. */
  port: number;
  /** Sub-path after `/preview[/<port>]`. Always starts with `/`. */
  subPath: string;
}

/**
 * Parse `/api/sandbox/<handle>/preview[/<port>]/<subPath>` and return the
 * upgrade target (or null if the path isn't a sandbox preview URL).
 *
 * Port may be omitted, in which case the caller resolves via /dev/status.
 */
/**
 * Pull the sandbox handle out of a Referer header that points at a preview
 * URL. Used by the top-level fetch handler to forward stray absolute-path
 * asset requests (`/styles.css`, `/_frsh/refresh.js`, etc.) back to their
 * originating sandbox. Returns null for any Referer that isn't a sandbox
 * preview URL, so the fallback is safe to call on every request.
 */
export function extractSandboxHandleFromReferer(
  referer: string | null,
): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    const match = /^\/api\/sandbox\/([^/]+)\/preview(?:\/|$)/.exec(u.pathname);
    return match ? match[1]! : null;
  } catch {
    return null;
  }
}

export function parseSandboxPreviewUrl(
  pathname: string,
): { handle: string; port: number | null; subPath: string } | null {
  const withPort = /^\/api\/sandbox\/([^/]+)\/preview\/(\d+)(\/.*)?$/.exec(
    pathname,
  );
  if (withPort) {
    return {
      handle: withPort[1]!,
      port: Number(withPort[2]!),
      subPath: withPort[3] ?? "/",
    };
  }
  const noPort = /^\/api\/sandbox\/([^/]+)\/preview(\/.*)?$/.exec(pathname);
  if (noPort) {
    return {
      handle: noPort[1]!,
      port: null,
      subPath: noPort[2] ?? "/",
    };
  }
  return null;
}

/**
 * Auth + port resolution for a WS upgrade. Returns an upstream-ready target
 * or a short description of why the upgrade was refused.
 */
export async function resolveSandboxWsTarget(
  request: Request,
  parsed: { handle: string; port: number | null; subPath: string },
): Promise<SandboxWsTarget | { error: string; status: number }> {
  const ctx = await ContextFactory.create(request).catch(() => null);
  if (!ctx) return { error: "Unauthorized", status: 401 };
  const userId = ctx.auth?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 };

  const row = await ctx.db
    .selectFrom("sandbox_runner_state")
    .select(["user_id", "runner_kind"])
    .where("handle", "=", parsed.handle)
    .executeTakeFirst();
  if (!row || row.user_id !== userId) {
    return { error: "Not found", status: 404 };
  }
  if (row.runner_kind !== SANDBOX_RUNNER_KIND) {
    return { error: "Unsupported runner", status: 400 };
  }

  const runner = getSharedRunner(ctx);
  if (!(runner instanceof DockerSandboxRunner)) {
    return { error: "Runner not configured", status: 500 };
  }

  let port = parsed.port;
  if (port == null) {
    const statusRes = await runner.proxyDaemonRequest(
      parsed.handle,
      "/dev/status",
      { method: "GET", headers: new Headers(), body: null },
    );
    const status = (await statusRes.json().catch(() => null)) as {
      port?: number | null;
    } | null;
    if (!status?.port) return { error: "Dev server not ready", status: 503 };
    port = status.port;
  }

  const [daemonUrl, token] = await Promise.all([
    runner.resolveDaemonUrl(parsed.handle),
    runner.resolveDaemonToken(parsed.handle),
  ]);
  if (!daemonUrl || !token) {
    return { error: "Sandbox not reachable", status: 503 };
  }
  // Swap http:// → ws:// for the WebSocket connection; the daemon accepts
  // upgrades on the same port as its HTTP listener.
  const daemonWsBase = daemonUrl.replace(/^http/, "ws");
  return {
    handle: parsed.handle,
    daemonWsBase,
    daemonToken: token,
    port,
    subPath: parsed.subPath,
  };
}
