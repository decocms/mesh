/**
 * End-to-end tests for the bootstrap state machine (Phase 1).
 *
 * Spawns the bundled daemon under Bun without DAEMON_TOKEN so the daemon
 * comes up in `pending-bootstrap`. Tests then drive POST /_decopilot_vm/bootstrap
 * directly and observe phase via /health.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";

const DAEMON_BUNDLE = join(import.meta.dir, "dist", "daemon.js");
const VALID_TOKEN = "t".repeat(32);
const VALID_NONCE = "n".repeat(32);
const HOOK_TIMEOUT_MS = 30_000;
const PORT_WAIT_TIMEOUT_MS = 20_000;

let daemonProc: ChildProcess | null = null;
let daemonPort = 0;
let appDir = "";
let bootstrapDir = "";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (typeof addr === "object" && addr && typeof addr.port === "number") {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("freePort: bad address")));
      }
    });
  });
}

async function waitForPort(
  port: number,
  proc: ChildProcess,
  stderrBuf: { value: string },
  timeoutMs = PORT_WAIT_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      throw new Error(
        `daemon exited before /health responded (code=${proc.exitCode} signal=${proc.signalCode}) stderr=${stderrBuf.value.slice(-2000)}`,
      );
    }
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`daemon did not listen on :${port} within ${timeoutMs}ms`);
}

interface StartOpts {
  withClaimNonce?: boolean;
  strictNonce?: boolean;
  bootstrapTimeoutMs?: number;
  preseedBootstrapJson?: string;
  // Optional override for the bootstrap dir (skip mkdtemp)
  bootstrapDirOverride?: string;
  extraEnv?: Record<string, string>;
}

async function startDaemon(opts: StartOpts = {}) {
  appDir = mkdtempSync(join(tmpdir(), "daemon-bootstrap-"));
  bootstrapDir =
    opts.bootstrapDirOverride ??
    mkdtempSync(join(tmpdir(), "daemon-bootstrap-state-"));
  if (opts.preseedBootstrapJson) {
    writeFileSync(
      join(bootstrapDir, "bootstrap.json"),
      opts.preseedBootstrapJson,
    );
  }
  daemonPort = await freePort();
  const env: Record<string, string> = {
    ...process.env,
    DAEMON_BOOT_ID: `boot-${daemonPort}`,
    APP_ROOT: appDir,
    PROXY_PORT: String(daemonPort),
    DEV_PORT: "3000",
    DAEMON_NO_AUTOSTART: "1",
    DAEMON_DROP_PRIVILEGES: "0",
    DAEMON_BOOTSTRAP_DIR: bootstrapDir,
    BOOTSTRAP_TIMEOUT_MS: String(opts.bootstrapTimeoutMs ?? 60_000),
  };
  if (opts.withClaimNonce) env.CLAIM_NONCE = VALID_NONCE;
  if (opts.strictNonce) env.STRICT_NONCE = "true";

  // Important: do NOT pass DAEMON_TOKEN (parent shell may have it set);
  // the bootstrap path is gated by its absence. Strip BEFORE applying
  // extraEnv so opt-in env-driven tests can re-set it.
  delete env.DAEMON_TOKEN;
  delete env.CLONE_URL;
  delete env.REPO_NAME;
  delete env.BRANCH;
  delete env.GIT_USER_NAME;
  delete env.GIT_USER_EMAIL;
  Object.assign(env, opts.extraEnv ?? {});

  daemonProc = spawn("bun", [DAEMON_BUNDLE], {
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
  const stderrBuf = { value: "" };
  daemonProc.stdout?.on("data", (c) =>
    process.stderr.write(`[daemon:out] ${c}`),
  );
  daemonProc.stderr?.on("data", (c) => {
    stderrBuf.value += c.toString();
    process.stderr.write(`[daemon:err] ${c}`);
  });
  await waitForPort(daemonPort, daemonProc, stderrBuf);
}

async function stopDaemon() {
  if (daemonProc) {
    const proc = daemonProc;
    daemonProc = null;
    if (proc.exitCode === null && proc.signalCode === null) {
      await new Promise<void>((resolve) => {
        proc.once("exit", () => resolve());
        proc.kill("SIGKILL");
      });
    }
  }
  if (appDir) {
    rmSync(appDir, { recursive: true, force: true });
    appDir = "";
  }
  if (bootstrapDir) {
    rmSync(bootstrapDir, { recursive: true, force: true });
    bootstrapDir = "";
  }
}

interface BootstrapPayload {
  schemaVersion: 1;
  claimNonce: string;
  daemonToken: string;
  runtime: "node" | "bun" | "deno";
  cloneUrl?: string;
  repoName?: string;
  branch?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  packageManager?: "npm" | "pnpm" | "yarn" | "bun" | "deno";
  devPort?: number;
  appRoot?: string;
  env?: Record<string, string>;
}

function basicPayload(over: Partial<BootstrapPayload> = {}): BootstrapPayload {
  return {
    schemaVersion: 1,
    claimNonce: VALID_NONCE,
    daemonToken: VALID_TOKEN,
    runtime: "node",
    appRoot: appDir,
    ...over,
  };
}

async function postBootstrap(
  body: unknown,
  port = daemonPort,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const raw = JSON.stringify(body);
  const b64 = Buffer.from(raw, "utf-8").toString("base64");
  const res = await fetch(`http://localhost:${port}/_decopilot_vm/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: b64,
  });
  return {
    status: res.status,
    json: (await res.json()) as Record<string, unknown>,
  };
}

async function getHealth(): Promise<{
  ready: boolean;
  bootId: string;
  setup: { running: boolean; done: boolean };
  phase: string;
}> {
  const res = await fetch(`http://localhost:${daemonPort}/health`);
  return res.json() as Promise<{
    ready: boolean;
    bootId: string;
    setup: { running: boolean; done: boolean };
    phase: string;
  }>;
}

describe("daemon bootstrap (state machine)", () => {
  beforeEach(async () => {
    await startDaemon({ withClaimNonce: true });
  }, HOOK_TIMEOUT_MS);
  afterEach(async () => {
    await stopDaemon();
  }, HOOK_TIMEOUT_MS);

  it("starts in pending-bootstrap when no env-driven token + no file", async () => {
    const h = await getHealth();
    expect(h.phase).toBe("pending-bootstrap");
  });

  it("happy path: pending → bootstrapping (after POST)", async () => {
    const r = await postBootstrap(basicPayload());
    expect(r.status).toBe(200);
    expect(r.json.phase).toBe("bootstrapping");
    expect(typeof r.json.hash).toBe("string");
    expect(r.json.bootId).toBe(`boot-${daemonPort}`);
    const h = await getHealth();
    expect(h.phase).toBe("bootstrapping");
  });

  it("idempotency: identical POST twice both 200", async () => {
    const p = basicPayload();
    const r1 = await postBootstrap(p);
    const r2 = await postBootstrap(p);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.json.hash).toBe(r2.json.hash);
  });

  it("conflict: different POST after the first returns 409", async () => {
    const r1 = await postBootstrap(basicPayload({ branch: "main" }));
    expect(r1.status).toBe(200);
    const r2 = await postBootstrap(basicPayload({ branch: "feature" }));
    expect(r2.status).toBe(409);
    expect(r2.json.reason).toBe("conflict");
  });

  it("schemaVersion unknown → 400", async () => {
    const p = basicPayload();
    (p as unknown as { schemaVersion: number }).schemaVersion = 99;
    const r = await postBootstrap(p);
    expect(r.status).toBe(400);
  });

  it("daemonToken < 32 chars → 400", async () => {
    const r = await postBootstrap(basicPayload({ daemonToken: "short" }));
    expect(r.status).toBe(400);
  });

  it("claimNonce mismatch → 403", async () => {
    const r = await postBootstrap(basicPayload({ claimNonce: "wrong" }));
    expect(r.status).toBe(403);
  });

  it("concurrent identical POSTs (10) → all 200, file written once", async () => {
    const p = basicPayload();
    const promises = Array.from({ length: 10 }, () => postBootstrap(p));
    const results = await Promise.all(promises);
    for (const r of results) expect(r.status).toBe(200);
    const hashes = new Set(results.map((r) => r.json.hash as string));
    expect(hashes.size).toBe(1);
    // bootstrap.json exists and is non-empty
    const bytes = readFileSync(join(bootstrapDir, "bootstrap.json"), "utf-8");
    expect(bytes.length).toBeGreaterThan(10);
  });

  it("concurrent differing POSTs → exactly one 200, others 409", async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      postBootstrap(basicPayload({ branch: `b-${i}` })),
    );
    const results = await Promise.all(promises);
    const oks = results.filter((r) => r.status === 200);
    const conflicts = results.filter((r) => r.status === 409);
    expect(oks.length).toBe(1);
    expect(conflicts.length).toBe(9);
  });

  it("bootstrap.json file mode is 0600", async () => {
    await postBootstrap(basicPayload());
    const st = statSync(join(bootstrapDir, "bootstrap.json"));
    expect(st.mode & 0o777).toBe(0o600);
  });

  it("/health reflects the new phase", async () => {
    expect((await getHealth()).phase).toBe("pending-bootstrap");
    await postBootstrap(basicPayload());
    expect((await getHealth()).phase).toBe("bootstrapping");
  });

  it("mutating routes return 503 with phase when not ready", async () => {
    const b64 = Buffer.from(
      JSON.stringify({ command: "true" }),
      "utf-8",
    ).toString("base64");
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/bash`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: b64,
      },
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { phase: string };
    expect(body.phase).toBe("pending-bootstrap");
  });

  it("Phase 0 regression: unauth GETs still work", async () => {
    const r1 = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/scripts`,
    );
    expect(r1.status).toBe(200);
    const r2 = await fetch(`http://localhost:${daemonPort}/_decopilot_vm/idle`);
    expect(r2.status).toBe(200);
    const ctrl = new AbortController();
    const r3 = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/events`,
      { signal: ctrl.signal },
    );
    expect(r3.status).toBe(200);
    ctrl.abort();
    const r4 = await fetch(`http://localhost:${daemonPort}/health`);
    expect(r4.status).toBe(200);
  });

  it("Phase 0 regression: POST /bootstrap tolerates an arbitrary Authorization header", async () => {
    // Mesh's `proxyDaemonRequest` stamps a bearer on every path it forwards.
    // Bootstrap is unauth-by-design (phase + nonce gated), but the handler
    // must not reject a request just because Authorization was attached.
    // A 200 (first call accepted) or 409 (already-bootstrapped from an
    // earlier test in this describe block) both prove the header is ignored.
    const raw = JSON.stringify(basicPayload());
    const b64 = Buffer.from(raw, "utf-8").toString("base64");
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/bootstrap`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer junk-value",
        },
        body: b64,
      },
    );
    expect([200, 409]).toContain(res.status);
  });
});

describe("daemon bootstrap (CLAIM_NONCE absent + strict mode)", () => {
  afterEach(async () => {
    await stopDaemon();
  }, HOOK_TIMEOUT_MS);

  it("when CLAIM_NONCE is unset and STRICT_NONCE=false, accepts any nonce", async () => {
    await startDaemon({ withClaimNonce: false });
    const r = await postBootstrap(basicPayload({ claimNonce: "anything" }));
    expect(r.status).toBe(200);
  });

  it("when CLAIM_NONCE is unset and STRICT_NONCE=true, rejects all", async () => {
    await startDaemon({ withClaimNonce: false, strictNonce: true });
    const r = await postBootstrap(basicPayload());
    expect(r.status).toBe(403);
  });
});

describe("daemon bootstrap (file rehydration)", () => {
  afterEach(async () => {
    await stopDaemon();
  }, HOOK_TIMEOUT_MS);

  function buildValidFileBytes(): string {
    const payload = {
      schemaVersion: 1,
      claimNonce: VALID_NONCE,
      daemonToken: VALID_TOKEN,
      runtime: "node",
    };
    // Recompute canonical JSON the same way the daemon does. Simple
    // serializer: keys sorted, no whitespace, undefined dropped.
    const canonical = (v: unknown): unknown => {
      if (v === undefined) return undefined;
      if (Array.isArray(v))
        return v.map((x) => (x === undefined ? null : canonical(x)));
      if (v && typeof v === "object") {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(v as Record<string, unknown>).sort()) {
          const val = (v as Record<string, unknown>)[k];
          if (val !== undefined) out[k] = canonical(val);
        }
        return out;
      }
      return v;
    };
    const hash = createHash("sha256")
      .update(JSON.stringify(canonical(payload)))
      .digest("hex");
    return JSON.stringify({ schemaVersion: 1, hash, payload });
  }

  it("hydrates from valid bootstrap.json → phase=bootstrapping", async () => {
    await startDaemon({
      withClaimNonce: true,
      preseedBootstrapJson: buildValidFileBytes(),
    });
    const h = await getHealth();
    expect(h.phase).toBe("bootstrapping");
  });

  it("unknown schemaVersion in file → phase=failed (and :9000 still binds)", async () => {
    await startDaemon({
      withClaimNonce: true,
      preseedBootstrapJson: JSON.stringify({
        schemaVersion: 99,
        hash: "x",
        payload: {},
      }),
    });
    const h = await getHealth();
    expect(h.phase).toBe("failed");
  });

  it("hash mismatch in file → phase=failed", async () => {
    const payload = {
      schemaVersion: 1,
      claimNonce: VALID_NONCE,
      daemonToken: VALID_TOKEN,
      runtime: "node",
    };
    const bytes = JSON.stringify({
      schemaVersion: 1,
      hash: "0".repeat(64),
      payload,
    });
    await startDaemon({
      withClaimNonce: true,
      preseedBootstrapJson: bytes,
    });
    const h = await getHealth();
    expect(h.phase).toBe("failed");
  });

  it(".tmp leftover is cleaned up on boot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "daemon-tmpcleanup-"));
    writeFileSync(join(dir, "bootstrap.json.tmp"), "junk");
    try {
      await startDaemon({
        withClaimNonce: true,
        bootstrapDirOverride: dir,
      });
      // After daemon hydrates it should have removed the .tmp.
      let stillThere = false;
      try {
        statSync(join(dir, "bootstrap.json.tmp"));
        stillThere = true;
      } catch {
        /* gone — good */
      }
      expect(stillThere).toBe(false);
    } finally {
      // stopDaemon will rm the override dir too.
    }
  });

  it("kill -9 mid-write equivalent: existing valid file rehydrates", async () => {
    // Direct simulation: bootstrap, snapshot the file bytes, kill the
    // daemon, restart pointing at a fresh dir holding those bytes. Covers
    // the same atomic-rename + boot-rehydration code path that a true
    // kill -9 mid-write would exercise.
    await startDaemon({ withClaimNonce: true });
    const r = await postBootstrap(basicPayload());
    expect(r.status).toBe(200);
    const fileBytes = readFileSync(
      join(bootstrapDir, "bootstrap.json"),
      "utf-8",
    );
    await stopDaemon();
    const dir = mkdtempSync(join(tmpdir(), "daemon-rehydrate-"));
    writeFileSync(join(dir, "bootstrap.json"), fileBytes);
    await startDaemon({
      withClaimNonce: true,
      bootstrapDirOverride: dir,
    });
    const h = await getHealth();
    expect(h.phase).toBe("bootstrapping");
  });
});

describe("daemon bootstrap (timeout + back-compat)", () => {
  afterEach(async () => {
    await stopDaemon();
  }, HOOK_TIMEOUT_MS);

  it("bootstrap timeout fires when no POST arrives → phase=failed", async () => {
    await startDaemon({
      withClaimNonce: true,
      bootstrapTimeoutMs: 500,
    });
    expect((await getHealth()).phase).toBe("pending-bootstrap");
    await new Promise((r) => setTimeout(r, 1500));
    expect((await getHealth()).phase).toBe("failed");
  });

  it("subsequent bootstrap call after failed → 409", async () => {
    await startDaemon({
      withClaimNonce: true,
      bootstrapTimeoutMs: 300,
    });
    await new Promise((r) => setTimeout(r, 1000));
    const r = await postBootstrap(basicPayload());
    expect(r.status).toBe(409);
    expect(r.json.phase).toBe("failed");
  });

  it("env-driven path: DAEMON_TOKEN set → phase=ready (back-compat)", async () => {
    await startDaemon({
      withClaimNonce: false,
      extraEnv: {
        DAEMON_TOKEN: VALID_TOKEN,
        // No clone — keeps orchestrator a no-op so phase stays ready.
      },
    });
    const h = await getHealth();
    expect(h.phase).toBe("ready");
  });
});
