import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
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
});
