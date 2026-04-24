/**
 * End-to-end smoke tests for the in-VM daemon.
 *
 * Spawns the generated daemon script on a random localhost port under Bun
 * and exercises real HTTP/SSE endpoints. Since the daemon uses `spawn` with
 * uid/gid=1000 ("deco" user) in production, this test strips those when
 * running outside the VM — a helper below creates a sandboxed /tmp/app dir
 * and writes a patched daemon script with uid/gid removed.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { buildDaemonScript } from "./daemon-script";

const DAEMON_TOKEN = "t".repeat(32);

function authHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  return { Authorization: `Bearer ${DAEMON_TOKEN}`, ...extra };
}

let daemonProc: ChildProcess | null = null;
let daemonPort = 0;
let appDir = "";

async function waitForPort(port: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(
        `http://localhost:${port}/_decopilot_vm/scripts`,
        {
          headers: authHeaders(),
        },
      );
      if (res.ok) return;
    } catch {
      /* server not up yet */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`daemon did not listen on :${port} within ${timeoutMs}ms`);
}

function freePort(): number {
  // 50000-59999 range to avoid clashing with dev servers
  return 50000 + Math.floor(Math.random() * 10000);
}

async function startDaemon() {
  appDir = mkdtempSync(join(tmpdir(), "daemon-e2e-"));
  daemonPort = freePort();
  const script = buildDaemonScript({
    upstreamPort: "3000",
    packageManager: null,
    pathPrefix: "",
    port: "3000",
    cloneUrl: "https://invalid.example.com/no-op.git",
    repoName: "test/repo",
    proxyPort: daemonPort,
    bootstrapScript: "<!--bs-->",
    gitUserName: "test",
    gitUserEmail: "t@e",
    branch: "main",
    daemonToken: DAEMON_TOKEN,
  })
    // Strip uid/gid so spawn works outside the VM (we're not root here).
    // Match the full pair including the leading comma so we don't leave
    // dangling commas or lone gid when uid/gid appear right before `}`.
    .replaceAll(/,\s*uid:\s*DECO_UID\s*,\s*gid:\s*DECO_GID/g, "")
    // Use our temp dir for APP_ROOT
    .replace(/const APP_ROOT = "\/app";/, `const APP_ROOT = "${appDir}";`);

  const scriptPath = join(appDir, "daemon.js");
  writeFileSync(scriptPath, script);

  daemonProc = spawn("bun", [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  // Surface daemon logs when the test fails
  daemonProc.stdout?.on("data", (c) =>
    process.stderr.write(`[daemon:out] ${c}`),
  );
  daemonProc.stderr?.on("data", (c) =>
    process.stderr.write(`[daemon:err] ${c}`),
  );
  await waitForPort(daemonPort);
}

async function stopDaemon() {
  if (daemonProc) {
    daemonProc.kill("SIGKILL");
    daemonProc = null;
  }
  if (appDir) {
    rmSync(appDir, { recursive: true, force: true });
    appDir = "";
  }
}

describe("daemon e2e (runs generated script under Bun)", () => {
  beforeEach(async () => {
    await startDaemon();
  });
  afterEach(async () => {
    await stopDaemon();
  });

  it("GET /_decopilot_vm/scripts returns { scripts: [] } before discovery", async () => {
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/scripts`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { scripts: string[] };
    expect(body.scripts).toEqual([]);
  });

  it("rejects unauthenticated /_decopilot_vm/* with 401", async () => {
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/scripts`,
    );
    expect(res.status).toBe(401);
  });

  it("POST /_decopilot_vm/bash executes a command and returns stdout", async () => {
    // Base64-wrap is the permanent wire format (WAF bypass); see daemon-script.ts header.
    const raw = JSON.stringify({ command: "echo hello-world" });
    const b64 = Buffer.from(raw, "utf-8").toString("base64");
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/bash`,
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: b64,
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stdout: string;
      stderr: string;
      exitCode: number;
    };
    expect(body.stdout.trim()).toBe("hello-world");
    expect(body.exitCode).toBe(0);
  });

  it("GET /_decopilot_vm/events streams an SSE status event on connect", async () => {
    const ctrl = new AbortController();
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/events`,
      { signal: ctrl.signal, headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-accel-buffering")).toBe("no");

    const reader = res.body!.getReader();
    const chunk = await reader.read();
    const text = new TextDecoder().decode(chunk.value);
    expect(text).toContain("event: status");
    expect(text).toContain("data:");
    ctrl.abort();
  });

  it("OPTIONS /_decopilot_vm/bash returns CORS headers (no auth required)", async () => {
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/bash`,
      { method: "OPTIONS" },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toContain(
      "Authorization",
    );
  });

  it("SSE replays buffered events on connect and delivers live broadcasts", async () => {
    // Fire a request to produce a log line in the "daemon" replay buffer.
    await fetch(`http://localhost:${daemonPort}/_decopilot_vm/scripts`, {
      headers: authHeaders(),
    });
    // Give the daemon a moment to append to its replay buffer.
    await new Promise((r) => setTimeout(r, 50));

    const ctrl = new AbortController();
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/events`,
      { signal: ctrl.signal, headers: authHeaders() },
    );
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // First chunk should include the `status` event (replay).
    const first = await reader.read();
    const firstText = decoder.decode(first.value);
    expect(firstText).toContain("event: status");

    // Trigger a new log line by hitting the proxy fallthrough, and confirm
    // we see it live on the SSE stream within a deadline.
    const deadline = Date.now() + 3000;
    let saw = false;
    await fetch(`http://localhost:${daemonPort}/something-live`).catch(() => {
      /* proxy upstream likely 502 — we only care about the log side-effect */
    });
    while (!saw && Date.now() < deadline) {
      const r = await reader.read();
      if (r.done) break;
      const t = decoder.decode(r.value);
      if (t.includes("proxy") && t.includes("something-live")) saw = true;
    }
    expect(saw).toBe(true);
    ctrl.abort();
  });

  it("POST /_decopilot_vm/exec/setup triggers re-setup and returns { ok: true }", async () => {
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/exec/setup`,
      { method: "POST", headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("POST /_decopilot_vm/exec/setup returns 409 when setup is already running", async () => {
    // The daemon auto-triggers setup on boot; by the time this test runs
    // the boot setup is typically still in-flight (clone fails fast against
    // invalid.example.com but leaves a blocked setupRunning window around
    // spawn events). Fire two POSTs back-to-back and expect exactly one
    // 200 and one 409 — the re-entry guard rejects the concurrent call.
    const first = fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/exec/setup`,
      { method: "POST", headers: authHeaders() },
    );
    const second = fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/exec/setup`,
      { method: "POST", headers: authHeaders() },
    );
    const [r1, r2] = await Promise.all([first, second]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it("POST /_decopilot_vm/exec/<unknown> before setup returns 400", async () => {
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/exec/dev`,
      { method: "POST", headers: authHeaders() },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("setup not complete");
  });

  it("POST /_decopilot_vm/kill/<name> when process isn't running returns 400", async () => {
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/kill/nonexistent`,
      { method: "POST", headers: authHeaders() },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("not running");
  });

  it("POST /_decopilot_vm/grep and /_decopilot_vm/glob succeed (confirms uid/gid stripped from spawn)", async () => {
    // Create a file in appDir to search
    const sampleFile = join(appDir, "needle.txt");
    writeFileSync(sampleFile, "hello world\n");

    const toBody = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");

    const grepRes = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/grep`,
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: toBody({ pattern: "hello", output_mode: "content" }),
      },
    );
    expect(grepRes.status).toBe(200);
    const grepBody = (await grepRes.json()) as { results: string };
    expect(grepBody.results).toContain("hello world");

    const globRes = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/glob`,
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: toBody({ pattern: "*.txt" }),
      },
    );
    expect(globRes.status).toBe(200);
    const globBody = (await globRes.json()) as { files: string[] };
    expect(globBody.files).toContain("needle.txt");
  });

  it("POST /_decopilot_vm/read returns file contents with line numbers", async () => {
    const sampleFile = join(appDir, "greet.txt");
    writeFileSync(sampleFile, "line1\nline2\nline3\n");
    const toBody = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");

    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/read`,
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: toBody({ path: "greet.txt" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string; lineCount: number };
    expect(body.content).toContain("1\tline1");
    expect(body.content).toContain("2\tline2");
    expect(body.lineCount).toBeGreaterThanOrEqual(3);
  });

  it("POST /_decopilot_vm/write + /edit round-trip", async () => {
    const toBody = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");

    const wr = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/write`,
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: toBody({ path: "ed.txt", content: "hello world" }),
      },
    );
    expect(wr.status).toBe(200);

    const ed = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/edit`,
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: toBody({
          path: "ed.txt",
          old_string: "world",
          new_string: "bun",
        }),
      },
    );
    expect(ed.status).toBe(200);
    const edBody = (await ed.json()) as { ok: boolean; replacements: number };
    expect(edBody.ok).toBe(true);
    expect(edBody.replacements).toBe(1);
  });

  it("POST /_decopilot_vm/bash with a timeout-killed command resolves with exitCode=-1 (does not hang)", async () => {
    // Exercises the same Promise-resolution path as a spawn "error" event:
    // child terminates externally (timeout-triggered SIGKILL) and close
    // resolves the await promise with -1. If handleBash ever hangs on
    // spawn failures, this test would time out.
    const toBody = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/bash`,
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: toBody({ command: "sleep 30", timeout: 500 }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { exitCode: number };
    expect(body.exitCode).toBe(-1);
  });

  it("POST /_decopilot_vm/bash with invalid base64 body returns 400", async () => {
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/bash`,
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: "not-valid-base64-!!@#$",
      },
    );
    expect(res.status).toBe(400);
  });

  it("daemon stays up and keeps probing upstream even when upstream is unreachable", async () => {
    // UPSTREAM is :3000 (per startDaemon fixture) — nothing is listening there.
    // The probe should fail gracefully and not crash the daemon. Give it time
    // for at least one probe cycle (1s initial + 3s fast interval), then
    // confirm the daemon is still responsive.
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/scripts`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
  });
});

describe("daemon e2e (Bun-native server guarantees)", () => {
  beforeEach(async () => {
    await startDaemon();
  });
  afterEach(async () => {
    await stopDaemon();
  });

  it("returns Access-Control-Allow-Origin=* on every /_decopilot_vm/* response branch", async () => {
    // 1. GET /scripts (native Response branch)
    const scripts = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/scripts`,
      { headers: authHeaders() },
    );
    expect(scripts.headers.get("access-control-allow-origin")).toBe("*");

    // 2. OPTIONS preflight (native Response branch)
    const preflight = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/bash`,
      { method: "OPTIONS" },
    );
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");

    // 3. POST /bash (Bun-native Response)
    const bashBody = Buffer.from(
      JSON.stringify({ command: "true" }),
      "utf-8",
    ).toString("base64");
    const bash = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/bash`,
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: bashBody,
      },
    );
    expect(bash.headers.get("access-control-allow-origin")).toBe("*");

    // 4. GET unknown daemon route (404 catch-all)
    const missing = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/does-not-exist`,
      { headers: authHeaders() },
    );
    expect(missing.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("unknown daemon route returns 404 JSON (not a proxy forward)", async () => {
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/does-not-exist`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Not found");
  });
});

describe("daemon e2e (reverse proxy)", () => {
  let upstreamServer: ReturnType<typeof Bun.serve> | null = null;
  let upstreamPort = 0;

  async function startWithUpstream(
    upstreamHandler: (req: Request) => Response | Promise<Response>,
  ) {
    upstreamServer = Bun.serve({ port: 0, fetch: upstreamHandler });
    upstreamPort = upstreamServer.port as number;
    appDir = mkdtempSync(join(tmpdir(), "daemon-e2e-"));
    daemonPort = freePort();
    const script = buildDaemonScript({
      upstreamPort: String(upstreamPort),
      packageManager: null,
      pathPrefix: "",
      port: String(upstreamPort),
      cloneUrl: "https://invalid.example.com/no-op.git",
      repoName: "test/repo",
      proxyPort: daemonPort,
      bootstrapScript: "<!--BOOTSTRAP-->",
      gitUserName: "test",
      gitUserEmail: "t@e",
      branch: "main",
      daemonToken: DAEMON_TOKEN,
    })
      .replaceAll(/,\s*uid:\s*DECO_UID\s*,\s*gid:\s*DECO_GID/g, "")
      .replace(/const APP_ROOT = "\/app";/, `const APP_ROOT = "${appDir}";`);
    const scriptPath = join(appDir, "daemon.js");
    writeFileSync(scriptPath, script);
    daemonProc = spawn("bun", [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    daemonProc.stdout?.on("data", (c) =>
      process.stderr.write(`[daemon:out] ${c}`),
    );
    daemonProc.stderr?.on("data", (c) =>
      process.stderr.write(`[daemon:err] ${c}`),
    );
    await waitForPort(daemonPort);
  }

  async function startWithoutUpstream() {
    // Point upstream at a port where nothing is listening.
    upstreamPort = freePort();
    appDir = mkdtempSync(join(tmpdir(), "daemon-e2e-"));
    daemonPort = freePort();
    const script = buildDaemonScript({
      upstreamPort: String(upstreamPort),
      packageManager: null,
      pathPrefix: "",
      port: String(upstreamPort),
      cloneUrl: "https://invalid.example.com/no-op.git",
      repoName: "test/repo",
      proxyPort: daemonPort,
      bootstrapScript: "<!--BOOTSTRAP-->",
      gitUserName: "test",
      gitUserEmail: "t@e",
      branch: "main",
      daemonToken: DAEMON_TOKEN,
    })
      .replaceAll(/,\s*uid:\s*DECO_UID\s*,\s*gid:\s*DECO_GID/g, "")
      .replace(/const APP_ROOT = "\/app";/, `const APP_ROOT = "${appDir}";`);
    const scriptPath = join(appDir, "daemon.js");
    writeFileSync(scriptPath, script);
    daemonProc = spawn("bun", [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    daemonProc.stdout?.on("data", (c) =>
      process.stderr.write(`[daemon:out] ${c}`),
    );
    daemonProc.stderr?.on("data", (c) =>
      process.stderr.write(`[daemon:err] ${c}`),
    );
    await waitForPort(daemonPort);
  }

  afterEach(async () => {
    await stopDaemon();
    if (upstreamServer) {
      upstreamServer.stop(true);
      upstreamServer = null;
    }
  });

  it("injects BOOTSTRAP and strips XFO/CSP/content-encoding for HTML", async () => {
    await startWithUpstream(
      () =>
        new Response("<html><body><h1>hi</h1></body></html>", {
          headers: {
            "Content-Type": "text/html",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy": "default-src 'none'",
          },
        }),
    );

    const res = await fetch(`http://localhost:${daemonPort}/page`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("content-encoding")).toBeNull();
    const body = await res.text();
    expect(body).toContain("<!--BOOTSTRAP--></body>");
  });

  it("passes through non-HTML responses untouched", async () => {
    await startWithUpstream(() =>
      Response.json({ ok: true }, { headers: { "X-Frame-Options": "DENY" } }),
    );

    const res = await fetch(`http://localhost:${daemonPort}/api/data`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBeNull();
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns 503 'Server is starting' HTML when upstream is unreachable at /", async () => {
    await startWithoutUpstream();
    const res = await fetch(`http://localhost:${daemonPort}/`);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("1");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.text();
    expect(body).toContain("Server is starting");
  });

  it("returns 502 JSON when upstream is unreachable at a non-root path", async () => {
    await startWithoutUpstream();
    const res = await fetch(`http://localhost:${daemonPort}/api/thing`);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("proxy error");
  });

  it("forwards POST bodies to upstream", async () => {
    let receivedBody = "";
    await startWithUpstream(async (req) => {
      receivedBody = await req.text();
      return Response.json({ ok: true });
    });

    const res = await fetch(`http://localhost:${daemonPort}/api/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });
    expect(res.status).toBe(200);
    expect(receivedBody).toBe('{"hello":"world"}');
  });

  it("forwards chunked POST bodies to upstream", async () => {
    let receivedBody = "";
    await startWithUpstream(async (req) => {
      receivedBody = await req.text();
      return Response.json({ ok: true });
    });

    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("chunk1 "));
        c.enqueue(new TextEncoder().encode("chunk2"));
        c.close();
      },
    });
    // `duplex: "half"` required by fetch when streaming a request body.
    const res = await fetch(`http://localhost:${daemonPort}/api/echo`, {
      method: "POST",
      body: stream,
      // @ts-expect-error — duplex is valid but not in all TS lib types
      duplex: "half",
    });
    expect(res.status).toBe(200);
    expect(receivedBody).toBe("chunk1 chunk2");
  });
});
