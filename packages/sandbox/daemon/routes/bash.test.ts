import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeBashHandler } from "./bash";

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");
}

function post(obj: unknown): Request {
  return new Request("http://x/_decopilot_vm/bash", {
    method: "POST",
    body: b64(obj),
  });
}

describe("bash", () => {
  let appRoot = "";
  let h: ReturnType<typeof makeBashHandler>;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "bash-handler-"));
    h = makeBashHandler({ appRoot });
  });

  afterEach(() => {
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("runs an echo and returns stdout+exitCode=0", async () => {
    const res = await h(post({ command: "echo hello-world" }));
    const body = (await res.json()) as { stdout: string; exitCode: number };
    expect(body.stdout.trim()).toBe("hello-world");
    expect(body.exitCode).toBe(0);
  });

  it("SIGKILLs on timeout and returns exitCode=-1", async () => {
    const res = await h(post({ command: "sleep 30", timeout: 300 }));
    const body = (await res.json()) as { exitCode: number };
    expect(body.exitCode).toBe(-1);
  });

  it("rejects missing command", async () => {
    const res = await h(post({}));
    expect(res.status).toBe(400);
  });

  it("does not leak backgrounded children past the request", async () => {
    // Reproduces the wedge: `&` + redirects had bash sit in wait4() forever
    // on macOS, and even on Linux the child outlived the request. The
    // process-group SIGKILL on close should reap it.
    const pidFile = join(appRoot, "bg.pid");
    const cmd = `sleep 30 > /dev/null 2>&1 & echo $! > "${pidFile}"; wait $!`;
    const res = await h(post({ command: cmd, timeout: 500 }));
    const body = (await res.json()) as { exitCode: number };
    expect(body.exitCode).toBe(-1);

    expect(existsSync(pidFile)).toBe(true);
    const bgPid = Number(readFileSync(pidFile, "utf-8").trim());
    expect(Number.isInteger(bgPid)).toBe(true);

    // Give SIGKILL a beat to land. `kill 0` throws ESRCH when gone.
    await new Promise((r) => setTimeout(r, 100));
    let alive = true;
    try {
      process.kill(bgPid, 0);
    } catch {
      alive = false;
    }
    expect(alive).toBe(false);
  });
});
