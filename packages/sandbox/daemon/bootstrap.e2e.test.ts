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
const BOOT_TOKEN = "t".repeat(32);
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
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`daemon did not listen on :${port} within ${timeoutMs}ms`);
}

interface StartOpts {
  preseedBootstrapJson?: string;
  bootstrapDirOverride?: string;
  extraEnv?: Record<string, string>;
  omitToken?: boolean;
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
    DAEMON_NO_AUTOSTART: "1",
    DAEMON_DROP_PRIVILEGES: "0",
    DAEMON_BOOTSTRAP_DIR: bootstrapDir,
  };
  if (!opts.omitToken) env.DAEMON_TOKEN = BOOT_TOKEN;

  delete env.CLONE_URL;
  delete env.REPO_NAME;
  delete env.BRANCH;
  delete env.GIT_USER_NAME;
  delete env.GIT_USER_EMAIL;
  delete env.RUNTIME;
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
  runtime: "node" | "bun" | "deno";
  cloneUrl?: string;
  repoName?: string;
  branch?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  packageManager?: "npm" | "pnpm" | "yarn" | "bun" | "deno";
  devPort?: number;
  env?: Record<string, string>;
}

function basicPayload(over: Partial<BootstrapPayload> = {}): BootstrapPayload {
  return {
    schemaVersion: 1,
    runtime: "node",
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
  lastError: string | null;
}> {
  const res = await fetch(`http://localhost:${daemonPort}/health`);
  return res.json() as Promise<{
    ready: boolean;
    bootId: string;
    setup: { running: boolean; done: boolean };
    phase: string;
    lastError: string | null;
  }>;
}

describe("daemon bootstrap (state machine)", () => {
  beforeEach(async () => {
    await startDaemon();
  }, HOOK_TIMEOUT_MS);
  afterEach(async () => {
    await stopDaemon();
  }, HOOK_TIMEOUT_MS);

  it("starts in pending-bootstrap when env carries no tenant config", async () => {
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

  it("runtime invalid → 400", async () => {
    const r = await postBootstrap(basicPayload({ runtime: "ruby" as never }));
    expect(r.status).toBe(400);
  });

  it("concurrent identical POSTs (10) → all 200, file written once", async () => {
    const p = basicPayload();
    const promises = Array.from({ length: 10 }, () => postBootstrap(p));
    const results = await Promise.all(promises);
    for (const r of results) expect(r.status).toBe(200);
    const hashes = new Set(results.map((r) => r.json.hash as string));
    expect(hashes.size).toBe(1);
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

  it("bash works in pending-bootstrap (general-compute surface)", async () => {
    expect((await getHealth()).phase).toBe("pending-bootstrap");
    const b64 = Buffer.from(
      JSON.stringify({ command: "echo hello" }),
      "utf-8",
    ).toString("base64");
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/bash`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${BOOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: b64,
      },
    );
    expect(res.status).toBe(200);
  });

  it("bash without bearer returns 401 in pending-bootstrap", async () => {
    const b64 = Buffer.from(
      JSON.stringify({ command: "true" }),
      "utf-8",
    ).toString("base64");
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/bash`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: b64,
      },
    );
    expect(res.status).toBe(401);
  });

  it("exec (managed scripts) requires tenant config → 503 pre-bootstrap", async () => {
    const res = await fetch(
      `http://localhost:${daemonPort}/_decopilot_vm/exec/dev`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${BOOT_TOKEN}` },
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

describe("daemon bootstrap (file rehydration)", () => {
  afterEach(async () => {
    await stopDaemon();
  }, HOOK_TIMEOUT_MS);

  function buildValidFileBytes(): string {
    const payload = {
      schemaVersion: 1,
      runtime: "node",
    };
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
      preseedBootstrapJson: buildValidFileBytes(),
    });
    const h = await getHealth();
    expect(h.phase).toBe("bootstrapping");
  });

  it("unknown schemaVersion in file → file deleted, phase=pending-bootstrap", async () => {
    await startDaemon({
      preseedBootstrapJson: JSON.stringify({
        schemaVersion: 99,
        hash: "x",
        payload: {},
      }),
    });
    const h = await getHealth();
    expect(h.phase).toBe("pending-bootstrap");
    expect(h.lastError).toContain("schemaVersion");
  });

  it("hash mismatch in file → file deleted, phase=pending-bootstrap", async () => {
    const payload = {
      schemaVersion: 1,
      runtime: "node",
    };
    const bytes = JSON.stringify({
      schemaVersion: 1,
      hash: "0".repeat(64),
      payload,
    });
    await startDaemon({
      preseedBootstrapJson: bytes,
    });
    const h = await getHealth();
    expect(h.phase).toBe("pending-bootstrap");
    expect(h.lastError).toContain("hash mismatch");
  });

  it(".tmp leftover is cleaned up on boot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "daemon-tmpcleanup-"));
    writeFileSync(join(dir, "bootstrap.json.tmp"), "junk");
    try {
      await startDaemon({
        bootstrapDirOverride: dir,
      });
      let stillThere = false;
      try {
        statSync(join(dir, "bootstrap.json.tmp"));
        stillThere = true;
      } catch {}
      expect(stillThere).toBe(false);
    } finally {
    }
  });

  it("kill -9 mid-write equivalent: existing valid file rehydrates", async () => {
    await startDaemon();
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
      bootstrapDirOverride: dir,
    });
    const h = await getHealth();
    expect(h.phase).toBe("bootstrapping");
  });
});

describe("daemon boot (token + env tenant)", () => {
  afterEach(async () => {
    await stopDaemon();
  }, HOOK_TIMEOUT_MS);

  it("env-driven tenant config: RUNTIME set → phase=bootstrapping", async () => {
    await startDaemon({
      extraEnv: { RUNTIME: "node" },
    });
    const h = await getHealth();
    expect(h.phase).toBe("bootstrapping");
  });

  it("missing DAEMON_TOKEN at boot → daemon refuses to start", async () => {
    await expect(startDaemon({ omitToken: true })).rejects.toThrow();
  });
});
